# 上游问题报告草稿：`@deepseek-ai/dsh-client-modules`（客户端模块系统）

> **这份是什么**：给 DSH 上游的 issue 草稿（本机 `@deepseek-ai/dsh-desktop` / `dsh-client-modules`
> `0.2.0-rc.2`，上游仓库 `https://github.com/deepseek-ai/deepseek-harness`，包目录
> `packages/client/modules`）。正文用英文写，可直接粘进 issue；现场、时间线与我们的规避规程留在
> 本仓库 [`WORKSPACE.md`](../WORKSPACE.md) 已知限制 9（中文）。
>
> **触发它的两次真机崩溃**（同型，互相独立）：
> `%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-2026-10-17T01-48-07-569Z-web-boot.log`（我们自己构建后）
> 与 `…\crash-2026-10-17T02-25-13-030Z-web-boot.log`（第三方插件更新后；我们的四个包一个都没事）。
>
> **原文引用**：下面引的日志与 `file:line` 都是这台机器上**逐字核对过**的；`file:line` 指向
> `@deepseek-ai/dsh-client-modules@0.2.0-rc.2` 的 `lib/index.js` 与 `lib/client.js`。
>
> **结论强度**：机制（rev 精确查表 + 只留一代 + 一失败连坐整批）是**可核的代码事实**；
> 「为什么启动那一刻的 boot 载荷会落后于宿主表」这一点我们**没有**定位到具体那一行，列在
> *What we have not confirmed* 里，没有写成结论。

---

## Title

Rewriting a plugin's `lib/client.js` while the app is running makes the next web boot abort: stale-rev
module URLs 404, one failed combo bundle takes down every row that shares it
(`web boot: N entries did not activate`)

## Environment

- `@deepseek-ai/dsh-desktop` **0.2.0-rc.2**; `@deepseek-ai/dsh-client-modules` **0.2.0-rc.2**
  (`packages/client/modules`).
- Windows 11 x64, Electron 44.0.0, Node 24.18.1, locale `zh-CN`.
- Profile `desktop` with ~20 client packages that all land in one `application` combo, including third-party
  plugins installed from the market (`billion-context`, `dsh-free-search`, `dsh-better-sidebar`,
  `dsh-cost-meter`, `dsh-web-search-pro`, `dshmarket`, …).
- Logs: `%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-*-web-boot.log`.

## Summary

Installing/updating a plugin — or a local rebuild — **while the app is running** writes new bytes into that
plugin's `lib/client.js`. The next web boot then fails hard:

```
Error: web boot: 4 entries did not activate
```

Each failing row names **two** URLs, and both are dead:

1. the shared **combo** URL (`plugins/??<20ish ids>/client.js&rev=<graph rev>`), reported as
   `skipped after an earlier failure of this bundle`;
2. the row's own **single-package** URL (`plugins/??<id>/client.js&rev=<per-entry rev>`), reported as
   `bundle script … failed to load` (a transport failure, i.e. non-2xx).

The per-entry revs are *exact and per-package* (`0459143204d4`, `63ada3bb2b61`, `f374f0e48ce4`), so this is not
a random network error: the page was handed a module graph whose revisions the Host could no longer serve.
Once one script in a combo fails, everything else addressed by that same combo fails with it, so a stale
artifact in **one** third-party plugin aborts the boot for **four** unrelated packages — and the user sees
"应用无法启动或已意外停止" (the app cannot start) with only a restart as the way out.

## Reproduction

Deterministic on this machine; no plugin bug is involved — the trigger is the artifact being rewritten:

1. Install ≥2 client-side plugins that share the `application` combo (any two will do).
2. Start DSH desktop and let it boot normally (it does).
3. **While it is running**, replace the bytes of ≥2 of those packages' `lib/client.js`
   (what `pnpm install` / a market update / a local `build` does).
4. Reload the window or restart the app.
5. Expect `web boot: N entries did not activate` in `logs/crash-*-web-boot.log`, with N = the number of
   packages whose artifacts were rewritten, each naming the shared combo URL and its own single URL.
6. Restart again **without touching any file** → boots fine. The variable is the rewrite, not the content.

## Evidence (verbatim, 2026-10-17T02:25:13.030Z)

This crash had **no** local plugin involved; the four entries are all third-party. Two of them had their
artifacts written 3 minutes earlier (`dsh-better-sidebar` 02:21:50Z, `dsh-cost-meter` 02:22:05Z — local time
10:21:50 / 10:22:05).

```
--- error ---
Error: web boot: 4 entries did not activate
billion-context: import failed (see console for the import error)
dsh-free-search: import failed: client-modules: could not load "dsh-free-search":
  plugins/??@oblivion/brand/client.js,…,dsh-free-search/client.js,…,dsh-cost-meter/client.js,…&rev=9386d9e513c2:
  skipped after an earlier failure of this bundle;
  plugins/??dsh-free-search/client.js&rev=0459143204d4: client-modules: bundle script
  plugins/??dsh-free-search/client.js&rev=0459143204d4 failed to load
dsh-better-sidebar: import failed: … &rev=9386d9e513c2: skipped after an earlier failure of this bundle;
  plugins/??dsh-better-sidebar/client.js&rev=63ada3bb2b61: … bundle script … failed to load
dsh-cost-meter: import failed: … &rev=9386d9e513c2: skipped after an earlier failure of this bundle;
  plugins/??dsh-cost-meter/client.js&rev=f374f0e48ce4: … bundle script … failed to load
```

(Full text in the crash log; the combo URL there lists 20 package ids. Note `dsh-free-search`'s
`lib/client.js` **mtime was still 2026-10-06** — six days old — yet its rev changed, because the replacement
updates `ctime`.)

The other crash, 4.5 hours earlier, has the *identical shape* and the mirror-image cause — **our own** four
packages had just been rebuilt:

```
time: 2026-10-17T01:48:07.569Z
--- error ---
Error: web boot: 4 entries did not activate
@oblivion/panel: import failed (see console for the import error)
@oblivion/brand: import failed: … &rev=9c53f2b96b1a: skipped after an earlier failure of this bundle;
  plugins/??@oblivion/brand/client.js&rev=7d4ce09464c9: … failed to load
@oblivion/daily-life: … plugins/??@oblivion/daily-life/client.js&rev=2b1aa1cb8663: … failed to load
@oblivion/vimc: … plugins/??@oblivion/vimc/client.js&rev=c3186877c838: … failed to load
```

Two extra details worth noting: that boot's combo URL lists a package (`dsh-deepseek-web-login`) which is **gone**
from the later crash's combo — so a boot payload can also be stale in its *composition*, not only in its revs;
and in both crashes the number of unactivated entries equals the number of packages whose artifacts had just
changed.

## What the code does (verified at these lines, 0.2.0-rc.2)

| # | Fact | Location |
| --- | --- | --- |
| ① | An entry's revision is `sha1` over **filesystem metadata** — `mtimeMs`, **`ctimeMs`**, `size` — not content | `lib/index.js:193-199` (`artifactRevision`) |
| ② | `rev` is embedded in the URL, and lookup is an **exact string match** on the full path+query | `lib/index.js:958-971` (`bundleResource`) |
| ③ | The table keeps the current `responses` plus exactly **one previous generation** of *batch* responses | `lib/index.js:681-683`, used at `:962` |
| ④ | Only *chunk* URLs are carried forward from the previous `responses`; **single-package** URLs of older generations are dropped | `lib/index.js:668-680` |
| ⑤ | A failed combo bundle is remembered for the rest of the process and **every other row addressed by it is skipped** | `lib/client.js:629-637` (`failedBundleUrls` / `executedBundleUrls`) |
| ⑥ | The documented per-row fallback ("one failed batch costs at most three requests per missing row and never fails the rows that were registered") relies on the single-package URL still being served — which is exactly what ④ breaks | comment `lib/client.js:595-608`, fallback `:639` |
| ⑦ | The retry is on the **same** URL (twice), never on a re-resolved one | `lib/client.js:636` |

So: every artifact rewrite produces a new metadata-hash ⇒ a new graph rev (and new per-entry revs) ⇒ a new
generation. Because `ctimeMs` participates, replacing a file with **identical bytes** still invalidates it (①),
and a single `pnpm install` that touches several packages produces several generations at once. As soon as the
document's URLs are more than one generation behind, ③/④ make them 404 — and ⑤ turns one 404 into
"N entries did not activate", which `web boot` treats as fatal.

## Impact

- The app is unusable until a full restart (the failure surfaces as a crash report: "应用无法启动或已意外停止").
- Blast radius is per-combo, not per-plugin: one stale third-party artifact took out four unrelated packages
  in our second incident, and could equally take out DSH's own client packages, since they share the combo.
- The message misdirects debugging: `failed to load` hides whether it was a 404 (stale URL) or a genuine script
  error, and the crash names the *victims* (the rows that did not activate) rather than the *cause* (the file
  that was rewritten).

## Suggested fixes (smallest first)

1. **Report the status.** Include the HTTP status (or `net::ERR_*`) per failed URL in `bundleResource`'s `404`
   and in `client.js`'s `failed to load` text — a stale-rev 404 currently looks exactly like a broken script.
2. **Reconcile on 404 instead of failing the boot.** On a non-2xx for a row, re-resolve that row against the
   live table and retry once with the current URL (the Host can serve every package at its current rev — that
   is the point of the single-package URL). ⑦ retries the same URL only.
3. **Don't condemn the whole combo.** `failedBundleUrls` is per-bundle, but the remedy is per-row: a row that
   failed should be retried against its current single URL even if the combo is permanently marked failed.
4. **Widen the retention window.** Keep the last K generations of `batchResponses` (a timestamped map, TTL/LRU)
   instead of one, so a document that is a couple of generations behind still boots. Alternatively, serve
   *any* known URL by retaining a `Map<rev, artifact>` per entry.
5. **Content-address the revision** (or at least drop `ctimeMs`). Hashing the file content makes a
   rewrite-with-identical-bytes a no-op and stops a package manager's `install` from invalidating six packages
   at once.
6. **Make it non-fatal.** If a plugin's client half cannot be loaded, the window should come up with that plugin
   disabled (and say so in the UI), rather than aborting the boot; a stale third-party artifact should not be
   able to prevent the app from starting.

## Our workaround (not a fix)

Never rewrite client artifacts while the app runs: our build script now refuses to build when DSH is alive
(refusing is correct for packages that have a client half, and it can be narrowed to client-half-free packages
when it is safe), and after a third-party update the rule is "**restart DSH completely**" (a window reload is
not enough). Recovering from the dialog's "重启" is the correct move; disabling third-party plugins is a last
resort.

## What we have not confirmed

- **Why the boot payload is behind the Host table at boot time.** Both crashes are consistent with a document
  whose URLs are ≥2 generations old, but we did not isolate whether the boot graph is composed per document
  load or served from a cached/tapped index response (the package description mentions an "index tap"). If the
  latter, the fix belongs there; if the former, the URL was stale because rewrites happened around the boot.
- **Whether a renderer-only reload re-composes the boot payload** (which would make "reload" a sufficient
  recovery). In our incidents the reported recovery was a full app restart; we did not test reload-in-place.
- **Whether `previousBatchResponses` is meant to cover the single-package URLs at all.** As written it cannot
  (④), but the comment at `client.js:595-608` reads as if it were expected to.
- Whether an in-flight `serveBundle` **during** a rescan can also 404 a *current* rev (we only observed
  stale-rev failures; `responses` is rebuilt synchronously, so we did not see a torn read).

## Questions

1. Is the boot graph expected to be re-composed on every document load, or is it cached/tapped? Which component
   owns the "the page's revs must be servable" invariant?
2. Should a missing/stale module URL be recoverable at runtime (re-resolve + retry), or is a full restart the
   intended contract?
3. Is `ctimeMs` in `artifactRevision` deliberate (replace-detection) or incidental? It is what makes an
   identical-content rewrite invalidate a package.
4. Is there a supported way to pin a document's module graph to a retained generation (e.g. keep the graph the
   page was composed with alive until the page goes away)?
