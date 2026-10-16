# 上游问题报告草稿：`billion-context`（lane）

> **这份是什么**：给上游 `billion-context` 的 issue 草稿（本机 lane 版本 **0.1.197**）。正文用英文写，
> 可直接粘进 issue；现场、规避配置与复核配方留在本仓库 [`WORKSPACE.md`](../WORKSPACE.md) 已知限制 7。
>
> **还没定案的一点**：路由级 `providers."https://api.deepseek.com".passthrough` 是否足以规避 —— 见文末
> *What we have not yet confirmed*。在此之前不要把结论写成「已确认」。
>
> 触发这份草稿的三条 lane 自述：`#2432`（rebasing ACP state）、`unified shadow DIGEST DRIFT … migration
> parity broken, report this`、`reasoning-pair-violated … (#684/#762/#2864)`。

---

## Title

Anthropic-shape request rebuild drops the `tool_result` that must immediately follow a `tool_use`
(upstream 400: `` messages.N.1: `tool_use` ids were found without `tool_result` blocks immediately after ``)

## Environment

- billion-context **0.1.197**; the same wording was already logged at **0.1.185** (two other sessions).
- Windows 11 desktop DSH (profile `desktop`); lane MITM proxy on `http://127.0.0.1:18787`.
- Routes involved: `https://api.deepseek.com/anthropic/v1/messages` (Anthropic shape) and one private-host
  OpenAI-compatible upstream (`/v1/chat/completions`).
- Lane config at first observation: `~/.config/billion-context/billion-context.json` = `{"providers":{}}`.
- Lane state/log: `~/.local/share/billion-context/sessions/index.db`, `~/.local/state/billion-context/bili.log`
  (timestamps UTC).

## Summary

For one long session (`session-10837d9b-ba07-420d-a8d3-3e14e1972481`), **every** request to the Anthropic-shaped
upstream is rejected with a tool-pairing error that names the *same* tool call id, at a message index that moves
with the array size (1097 → 713 → 47 → 65). The very same session, with the lane doing a full rebuild, works on the
OpenAI-shaped upstream.

The offending `tool_use` exists in DSH's durable history **with** its `tool_result` immediately after, and DSH's own
Anthropic serializer validates tool pairing locally (it raises locally rather than forwarding a broken body), so the
break is introduced downstream of it. The lane's own store splits that one assistant message into three records —
`assistant/tool-call` → `assistant/text` → `assistant/tool-call` — and the record's `wireIndex` (65) is exactly the
message index the upstream complains about (`messages.65.1`).

## Reproduction / observations

1. DSH session log (`session.v4.jsonl.zstd`, multi-frame zstd, `time` = epoch ms): a single assistant message
   (`seq=18087`, `2026-10-10T14:22:49.850Z`) has content
   `[tool-call(call_271ef71a7fed425c8482), text, tool-call(call_92a32957fcb84f21a747)]`; its two results are the
   following records (`18089` / `18091`, both non-empty). It is the **only** assistant message in that session's
   surface that interleaves a text block between two tool calls (5 messages carry more than one tool call).
2. First upstream rejection for that call id: `2026-10-11T02:39:02.157Z` → `messages.1097.1: … call_271…`.
   Later requests report the same id at `messages.713.1`, then `messages.47.1`, then `messages.65.1` — the index
   drifts, the id never changes.
3. The same wording already appeared on **2026-10-06T09:08:28Z** for two *other* sessions
   (`session-70941d46-…`, `session-e8a4ca50-…`) on 0.1.185, with a different id
   (`call_436f4aeb9f78477a9544`) → recurrence, not a one-off.
4. Enabling DSH-native compaction for the session did **not** clear it: `compaction/start → summary → end`,
   `surfaceOp {replace, startSeq 14994, endSeq 17791}`, usage 199% → 40%, and the next deepseek request still
   400s on the same call id.
5. The global `passthrough: true` did **not** clear it either (lane logged `PASSTHROUGH (compression OFF)`, the
   request still carried the same orphan) — consistent with the documented scope of the global switch
   (no compression / tool injection / nudging) rather than "no session state".
6. Switching the session's model to the OpenAI-shaped upstream works, with the lane rebuilding that very request:
   `request: 311 msgs, inbound=652.4KiB, outbound=500.4KiB, local=505ms` (T1 nudge + fold active), upstream
   accepts, `turn/end reason={"kind":"completed"}`.

## Evidence (verbatim log lines)

```
2026-10-11T02:39:02.157Z [warn] [sess=session-10837d9b-…_sub:41358f0ce0304f7f] [v=0.1.192] ← upstream 400:
{"error":{"message":"messages.1097.1: `tool_use` ids were found without `tool_result` blocks immediately after:
call_271ef71a7fed425c8482. Each `tool_use` block must have a corresponding `tool_result` block in the next message.
(request_id: f6634558-c6ee-4986-b1f7-89bb6608e892)","type":"invalid_request_error","code":"invalid_request_error"}}

2026-10-06T09:08:28.399Z [warn] [sess=session-70941d46-…_sub:5e64704973bd3d86] [v=0.1.185] ← upstream 400:
{"error":{"message":"messages.135.2: `tool_use` ids were found without `tool_result` blocks immediately after:
call_436f4aeb9f78477a9544. …"}}

2026-10-16T23:04:52.157Z [warn] [sess=session-10837d9b-…] [v=0.1.197]
dsh native compaction detected (0/556 covered id(s) retained, checkpoint framing in resent history)
— rebasing ACP state onto the compacted history (#2432)

2026-10-16T23:04:52.345Z [warn] [sess=session-10837d9b-…] [v=0.1.197]
reasoning-pair-violated: 121 assistant tool-call message(s) lack reasoning_content while 1 carry it
— strict-echo upstreams (DeepSeek thinking mode) will reject the request; first seen: call_00_VVOiKzpL4tjqfPoGkJ273636, …
(#684/#762/#2864)

2026-10-16T15:49:40.294Z [error] [sess=session-10837d9b-…_sub:18dba9ceb29a49d2] [v=0.1.197] [storage]
unified shadow DIGEST DRIFT for session-10837d9b-…|sub:18dba9ceb29a49d2: unified replay != legacy load view
— migration parity broken, report this
```

## Hypothesis

The Anthropic-shape renderer, when one `wireIndex` group contains a text record *between* two tool-call records,
emits that text as its own `messages[]` entry (or otherwise lets a message boundary fall between a `tool_use` and
its `tool_result`), so the upstream sees the `tool_use` without an immediately-following `tool_result`. The
OpenAI-shape renderer for the same session, same request, does not show the problem — i.e. the two renderers
disagree about grouping records of one assistant message.

## Impact

Once it happens, the session is **permanently unusable on every Anthropic-shaped upstream**: every turn is a 400,
and neither DSH-native compaction nor the global `passthrough` recovers it.

## Workaround we use

Route-scoped `passthrough` for the affected upstream (documented as "route-scoped byte-for-byte relay with no
session state"), so the lane stops rebuilding that request:

```json
{
  "dsh": { "allowDshCompaction": true },
  "providers": { "https://api.deepseek.com": { "passthrough": true } }
}
```

`providers.<upstream>.direct` (client-side exemption, traffic never pointed at the lane) is the fallback if the
above turns out not to be enough.

## What we have not yet confirmed

- Whether the route-scoped exemption actually avoids the 400 (verification needs the session switched back to the
  Anthropic-shaped upstream; not done yet). If it does **not**, the rebuild is exonerated and the break has to come
  from elsewhere on the chain (there *is* another `globalThis.fetch` wrapper in this install — lane logged
  `third-party globalThis.fetch install detected (#1158) — re-chaining as downstream`).
- Whether excluding the lane from that route also removes repairs this session's Anthropic route needs — the lane
  reports `reasoning-pair-violated` (121 assistant tool-call messages lack `reasoning_content`), so the next
  failure there could be about `reasoning_content` instead of tool pairing.

## Questions

1. Does the Anthropic renderer merge all records sharing one `wireIndex` into a single `messages[]` entry, and does
   it keep `tool_result` blocks in the *next* message when a text record sits between two tool-call records?
2. Is there a supported way to disable the request rebuild for **one session** (rather than one provider/global)?
3. Are `reasoning-pair-violated` and `unified shadow DIGEST DRIFT … migration parity broken` expected when the
   incoming history carries DSH-native compaction checkpoints, or are they symptoms of the same
   store-vs-render divergence?
