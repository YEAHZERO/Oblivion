#!/usr/bin/env python3
"""
从 DSH 会话日志（session.v4.jsonl.zstd）导入到 Oblivion 知识库。

事件 schema（v4，实测）：
  turn/start   {data:{turn}}
  turn/end     {data:{turn, reason:{kind}}}
  user/message {data:{content:[{type:'text',text:'...'}]}}
  assistant/message {data:{turn,step,message:{content:[{type:'text'|'reasoning'|'tool-call',...}]}}}
  tool/call    {data:{callId,name,arguments}}
  tool/result  {data:{message:{content:[{type:'text',text}]}}}
  session/title {data:{title}}

用法:
  python import-dsh-sessions.py [--dry-run] [--top N] [--cleanup] [--max-qa M]
"""
import os
import sys
import io
import json
import argparse
import zstandard
from pathlib import Path
from datetime import datetime

DSH_HOME = Path.home() / ".dsh"
SESSIONS_DIR = DSH_HOME / "sessions"
PROJCACHE_DIR = DSH_HOME / "storages" / "session_projcache" / "sessions"

OBLIVION_ROOT = Path(__file__).parent.parent
KB_DIR = OBLIVION_ROOT / "01_问答沉淀"


def decompress_session(path: Path) -> list[dict]:
    """stream_reader 解压多帧 zstd，返回事件列表。"""
    try:
        data = path.read_bytes()
        reader = zstandard.ZstdDecompressor().stream_reader(io.BytesIO(data))
        text = reader.read().decode("utf-8", errors="replace")
        events = []
        for line in text.split("\n"):
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return events
    except Exception as e:
        print(f"  解压失败 {path.name}: {e}", file=sys.stderr)
        return []


def text_of_blocks(blocks) -> str:
    """从内容块数组里取所有 text 块拼起来。"""
    if isinstance(blocks, str):
        return blocks.strip()
    if not isinstance(blocks, list):
        return ""
    parts = []
    for b in blocks:
        if isinstance(b, dict) and b.get("type") == "text":
            t = b.get("text", "")
            if isinstance(t, str) and t.strip():
                parts.append(t.strip())
    return "\n".join(parts)


def extract_turns(events: list[dict]) -> list[dict]:
    """按 turn 切分，返回 [{turn, user, assistant, tools, aborted}]。"""
    title = ""
    for e in events:
        if e.get("type") == "session/title":
            title = (e.get("data") or {}).get("title", "")
            break

    turns: dict[int, dict] = {}
    # callId -> tool name，用于把 tool/result 归到对应工具
    call_names: dict[str, str] = {}

    for e in events:
        etype = e.get("type", "")
        data = e.get("data") or {}

        if etype == "turn/start":
            tn = data.get("turn")
            if tn is not None:
                turns.setdefault(tn, {"turn": tn, "user": "", "assistant": "", "tools": [], "aborted": False})

        elif etype == "turn/end":
            tn = data.get("turn")
            if tn is not None and tn in turns:
                reason = (data.get("reason") or {}).get("kind", "")
                turns[tn]["aborted"] = reason == "aborted"

        elif etype == "user/message":
            # 归属到当前未关闭的 turn：取最后一个 turn
            tn = None
            for t in turns:
                if not turns[t].get("user") and not turns[t].get("closed"):
                    tn = t
                    break
            if tn is None:
                # 找最大 turn
                tn = max(turns.keys()) if turns else 1
                turns.setdefault(tn, {"turn": tn, "user": "", "assistant": "", "tools": [], "aborted": False})
            text = text_of_blocks(data.get("content"))
            if text and not turns[tn]["user"]:
                turns[tn]["user"] = text
                turns[tn]["closed"] = True  # 只认第一条 user/message

        elif etype == "assistant/message":
            tn = data.get("turn")
            if tn is None or tn not in turns:
                continue
            msg = data.get("message") or {}
            text = text_of_blocks(msg.get("content"))
            if text:
                if turns[tn]["assistant"]:
                    turns[tn]["assistant"] += "\n\n" + text
                else:
                    turns[tn]["assistant"] = text

        elif etype == "tool/call":
            cid = data.get("callId", "")
            name = data.get("name", "")
            tn = data.get("turn")
            if cid:
                call_names[cid] = name
            if tn is not None and tn in turns:
                turns[tn]["tools"].append({"name": name, "callId": cid})

        elif etype == "tool/result":
            tn = data.get("turn")
            msg = data.get("message") or {}
            cid = msg.get("toolCallId") or msg.get("source", {}).get("callId", "")
            if tn is not None and tn in turns and cid:
                preview = text_of_blocks(msg.get("content"))[:200].replace("\n", " ")
                for t in turns[tn]["tools"]:
                    if t.get("callId") == cid:
                        t["resultPreview"] = preview
                        break

    # 过滤出有实质问答的轮次（滤掉单字确认、纯工具调试的空轮）
    result = []
    for tn in sorted(turns.keys()):
        t = turns[tn]
        u = (t.get("user") or "").strip()
        a = (t.get("assistant") or "").strip()
        if len(u) < 8 or len(a) < 60:
            continue
        # 纯确认词（继续/好/ok/是的）跳过
        if u in ("继续", "好", "ok", "OK", "是的", "对", "嗯", "可以", "行"):
            continue
        result.append(t)
    return result, title


MAX_BODY = 8000  # 单条正文上限（约 3k token，适合知识库检索）


def clip(text: str, limit: int, hint: str = "") -> str:
    if len(text) <= limit:
        return text
    head = text[:limit].rstrip()
    tail = f"\n\n> （已截断，原长 {len(text)} 字符{hint}）"
    return head + tail


def format_qa(turn: dict, session_title: str, session_id: str) -> str:
    lines = []
    lines.append(f"# {clean_title(session_title)} · 轮 {turn['turn']}")
    lines.append("")
    lines.append(f"- 来源会话: `{session_id}`")
    if turn.get("aborted"):
        lines.append(f"- 状态: 中断（回答可能不完整）")
    lines.append("")
    lines.append("## 问题")
    lines.append("")
    lines.append(clip(turn["user"], MAX_BODY // 4, "；问题全文见会话原始日志"))
    lines.append("")
    lines.append("## 回答")
    lines.append("")
    lines.append(clip(turn["assistant"], MAX_BODY, f"；完整回答见会话 `{session_id}` 轮 {turn['turn']}"))
    # 工具调用只记名字清单（过程噪声不进正文，检索时靠名字就够了）
    if turn.get("tools"):
        names = sorted({t.get("name", "?") for t in turn["tools"]})
        lines.append("")
        lines.append(f"- 涉及工具: {', '.join('`' + n + '`' for n in names)}")
    lines.append("")
    lines.append("---")
    return "\n".join(lines)


def clean_title(s: str) -> str:
    """把 fallback 标题清洗成可读标题：去路径、去引号反引号、按句子边界截断。"""
    s = s.strip().strip('"\'').strip('`').strip()
    # 路径形式：C:\a\b\c.md → 取有意义的段
    if "\\" in s or "/" in s:
        parts = [p for p in s.replace("/", "\\").split("\\") if p]
        # 跳过以 . 开头的隐藏目录段（.design / .memory / .action）
        parts = [p for p in parts if not p.startswith(".")]
        last = parts[-1] if parts else s
        last = last.rsplit(".", 1)[0]
        if last.lower() in ("index", "readme", "layout", "main", "app") and len(parts) >= 2:
            last = f"{parts[-2]}-{last}"
        s = last
    # 反引号可能出现在任意位置，全部去掉
    s = s.replace("`", "").replace("_C__", "").replace("C__", "")
    s = " ".join(s.split())
    # 按中文/英文句子边界截断，避免半截词
    for sep in ("。", "？", "！", "\n", ". ", "? ", "! "):
        idx = s.find(sep)
        if 4 <= idx <= 50:
            s = s[:idx]
            break
    s = s.strip(" _-")
    # 退化标题（少于 4 字符 / 纯单字母）不可用作文件名，交给调用方用问题兜底
    if len(s) < 4 or (len(s) <= 2 and s.isascii()):
        return ""
    return s


def safe_name(s: str, fallback: str = "", limit: int = 60) -> str:
    """文件名：先清洗标题；标题退化时用 fallback（通常是问题前段）。"""
    s = clean_title(s)
    if not s and fallback:
        s = clean_title(fallback)
    if not s and fallback:
        # 问题可能整段都没有句号，直接截前 20 字符
        s = " ".join(fallback.split())[:20]
    s = "".join(c if c.isalnum() or c in " _-" else "_" for c in s)
    s = " ".join(s.split())
    return s[:limit].strip() or "untitled"


def save_qa(content: str, session_title: str, turn_no: int, session_id: str, dry_run: bool, question: str = ""):
    base = safe_name(session_title, fallback=question)
    name = f"{base}_t{turn_no}.md"
    path = KB_DIR / name
    if path.exists():
        ts = datetime.now().strftime("%H%M%S")
        path = KB_DIR / f"{base}_t{turn_no}_{ts}.md"
    if dry_run:
        print(f"  [DRY] {path.name} ({len(content)} chars)")
        return
    path.write_text(content, encoding="utf-8")
    print(f"  写入 {path.name}")


def cleanup_orphans(dry_run: bool):
    """清理 projcache 中不对应任何活跃会话目录的条目。

    会话目录名有两种形态（实测混存）：
      session-<uuid>   常规会话
      <uuid>           部分历史/迁移会话
    所以 active 集合收所有目录名，并额外收去掉 session- 前缀后的 uuid，
    projcache 的裸 uuid 文件名对两种形态都能命中。
    """
    active = set()
    if SESSIONS_DIR.exists():
        for ws in SESSIONS_DIR.iterdir():
            if not ws.is_dir():
                continue
            for sub in ws.iterdir():
                if not sub.is_dir():
                    continue
                name = sub.name
                active.add(name)
                if name.startswith("session-"):
                    active.add(name[len("session-"):])  # 裸 uuid
                else:
                    active.add(f"session-{name}")       # 补前缀
    orphans = []
    if PROJCACHE_DIR.exists():
        for f in PROJCACHE_DIR.glob("*.json"):
            sid = f.stem
            if sid not in active:
                orphans.append(f)
    print(f"\n孤儿清理: 活跃 {len(active)}, 孤儿 {len(orphans)}")
    if not orphans:
        return
    total = sum(f.stat().st_size for f in orphans)
    print(f"  可释放 {total/1024:.1f} KB")
    if dry_run:
        for f in orphans[:5]:
            print(f"  [DRY] {f.name}")
        return
    for f in orphans:
        try:
            f.unlink()
        except Exception as e:
            print(f"  删除失败 {f.name}: {e}")
    print(f"  已删除 {len(orphans)} 个")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--top", type=int, default=10, help="只处理最大的 N 个会话")
    ap.add_argument("--max-qa", type=int, default=20, help="每会话最多导出的问答数")
    ap.add_argument("--cleanup", action="store_true", help="顺带清理孤儿 projcache")
    args = ap.parse_args()

    KB_DIR.mkdir(parents=True, exist_ok=True)
    print(f"来源: {SESSIONS_DIR}")
    print(f"目标: {KB_DIR}")
    print()

    candidates = []
    if SESSIONS_DIR.exists():
        for ws in SESSIONS_DIR.iterdir():
            if not ws.is_dir():
                continue
            for sd in ws.iterdir():
                if not sd.is_dir() or not sd.name.startswith("session-"):
                    continue
                zs = list(sd.glob("*.jsonl.zstd"))
                if zs:
                    size = sum(z.stat().st_size for z in zs)
                    candidates.append((sd, zs[0], size))
    candidates.sort(key=lambda x: -x[2])
    chosen = candidates[: args.top]
    print(f"发现 {len(candidates)} 个会话，处理前 {len(chosen)} 个\n")

    total_qa = 0
    seen_fingerprints: set[tuple[str, str]] = set()  # (清洗后标题, 首问题前30字符) 去重 fork
    for sd, zf, size in chosen:
        print(f"[{sd.name}] {size/1024:.0f} KB")
        events = decompress_session(zf)
        if not events:
            print("  跳过：无事件")
            continue
        turns, title = extract_turns(events)
        if not title:
            title = sd.name
        clean = clean_title(title)
        print(f"  标题: {clean[:50]}")
        print(f"  有问答的轮次: {len(turns)}")
        for t in turns[: args.max_qa]:
            fp = (clean, (t["user"] or "")[:30])
            if fp in seen_fingerprints:
                print(f"    [跳过 fork 重复] 轮 {t['turn']}")
                continue
            seen_fingerprints.add(fp)
            content = format_qa(t, title, sd.name)
            save_qa(content, title, t["turn"], sd.name, args.dry_run, question=t.get("user", ""))
            total_qa += 1

    print(f"\n总计 {total_qa} 条问答")
    if args.cleanup:
        cleanup_orphans(args.dry_run)


if __name__ == "__main__":
    main()
