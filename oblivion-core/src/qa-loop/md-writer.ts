import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { KnowledgeItem } from '../types.js';
import { isoDate } from '../util/time.js';

export type MdAction = 'created' | 'appended' | 'duplicate';

export interface MdPayload {
  action: MdAction;
  item: KnowledgeItem;
  /** 仅 duplicate 分支使用：被补进来的来源。 */
  mergedSource?: { type: string; ref: string };
}

/** 分类映射：来源类型 → mdRoot 下的子目录（设计书 §25.3）。 */
export type MdClassifyMap = Readonly<Record<string, string>>;

/** §25.3 兜底目录：不匹配任何规则的知识落这里。 */
export const MD_FALLBACK_DIR = '99_其他';

/**
 * 取分类目录。
 *
 * 依次看条目的来源类型，命中第一条有映射的就用它；都没有则落 `99_其他/`（§25.3 兜底）。
 */
export function classifyDir(item: KnowledgeItem, map: MdClassifyMap | undefined): string {
  if (map) {
    for (const source of item.sources) {
      const dir = map[source.type];
      if (typeof dir === 'string' && dir.trim() !== '') return dir.trim();
    }
  }
  return MD_FALLBACK_DIR;
}

function safeName(topic: string): string {
  return (topic || 'untitled').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

const ID_MARKER = 'oblivion:';

/**
 * 新条目渲染。`<!-- oblivion:id=… -->` 是幂等连接键：
 * 同一个 id 重复落盘不会生成第二份。
 */
function renderNew(item: KnowledgeItem): string {
  const tags = item.tags.map((t) => '#' + t).join(' ');
  const sources = item.sources.map((s) => '- `' + s.type + '`: ' + s.ref).join('\n');
  const note = item.content.replace(/\s+/g, ' ').slice(0, 100);
  return [
    '# ' + item.title,
    '',
    '>Date :  ' + isoDate(item.created_at),
    '>Source：Oblivion',
    '>Note：' + note,
    '>Tags： ' + tags,
    '',
    '## 内容',
    '',
    item.content,
    '',
    '## 来源',
    '',
    sources,
    '',
    '<!-- oblivion:id=' + item.id + ' version=' + item.version + ' -->',
    '',
  ].join('\n');
}

function appendSection(existing: string, item: KnowledgeItem): string {
  const parts = item.content.split('\n\n---\n\n');
  const tail = parts[parts.length - 1] ?? '';
  const block = [
    '',
    '## 追加（' + isoDate(item.updated_at) + '）',
    '',
    tail,
    '',
    '<!-- oblivion:append id=' + item.id + ' version=' + item.version + ' -->',
    '',
  ].join('\n');
  const head = existing.replace(/<!-- oblivion:id=.*?-->\n?/g, '').trimEnd();
  return head + '\n\n' + block;
}

function appendSource(existing: string, payload: MdPayload): string {
  if (!payload.mergedSource) return existing;
  const line = '- `' + payload.mergedSource.type + '`: ' + payload.mergedSource.ref + '（重复捕获，仅补来源）';
  if (existing.includes(line)) return existing;
  return existing.trimEnd() + '\n' + line + '\n';
}

/**
 * 写主题笔记。三个分支都以 id 为连接键，因此重放同一次捕获是幂等的。
 *
 * 落盘路径 = `<mdRoot>/<分类目录>/<topic>.md`（分类见 `classifyDir`，默认问答沉淀落 `01_问答沉淀/`）。
 *
 * ⚠️ **共用知识库的防误伤**：`mdRoot` 是既有的 Obsidian 知识库，同名文件很可能是**用户自己的笔记**。
 * 所以目标文件若已存在且**不含任何 `oblivion:` 标记**，就视为外来文件 —— 不追加、不改写，
 * 改为写 `<topic>-oblivion.md`。发现这种情况时不会有静默覆盖。
 */
export async function writeMD(
  root: string,
  payload: MdPayload,
  classify?: MdClassifyMap,
): Promise<string> {
  const dir = join(root, classifyDir(payload.item, classify));
  await mkdir(dir, { recursive: true });

  const name = safeName(payload.item.topic);
  let path = join(dir, name + '.md');
  let existing = await readFile(path, 'utf8').catch(() => '');
  if (existing !== '' && !existing.includes(ID_MARKER)) {
    path = join(dir, name + '-oblivion.md');
    existing = await readFile(path, 'utf8').catch(() => '');
  }

  switch (payload.action) {
    case 'created': {
      if (existing.includes('oblivion:id=' + payload.item.id)) return path;
      const body = existing ? existing.trimEnd() + '\n\n' + renderNew(payload.item) : renderNew(payload.item);
      await writeFile(path, body, 'utf8');
      return path;
    }
    case 'appended':
      await writeFile(path, appendSection(existing, payload.item), 'utf8');
      return path;
    case 'duplicate':
      await writeFile(path, appendSource(existing, payload), 'utf8');
      return path;
  }
}