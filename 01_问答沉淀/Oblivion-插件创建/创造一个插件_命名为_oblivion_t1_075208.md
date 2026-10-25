# 创造一个插件（命名为@oblivion · 轮 1

- 来源会话: `session-10837d9b-ba07-420d-a8d3-3e14e1972481`

## 问题

The approval policy changed from "ask" to "never" (changed by the user).

## 回答

I'll start with reconnaissance: the workspace, the reference materials, DSHX state, and available inspection providers.

Let me examine the reference materials, skill catalogs, and existing plugin layout.

Key discovery: DSHX Creator+ claim is blocked on this machine (the documented Windows host-discovery limitation). Let me probe which DSHX paths still work and inspect the live GUI's boot manifest.

Found the composer hook (`[data-composer-input]`). Now let me check whether DSH exposes a public client shortcut/keymap service I should use instead of raw DOM listeners.

This changes the picture — DSH has its own client shortcut/command system. Let me check whether these exact commands already exist in DSH.

DSH exposes a public `ctx.shortcuts` command registry — that's the right extension point. Let me read its contract and dispatch rules.

Now let me confirm versions, probe the installed app bundle, and research the vimium-c reference (license + command semantics).

Reconnaissance is complete. Let me record the plan and check the local test tooling I'll need.

Recon complete. Let me check the repo's documentation conventions I must satisfy, then start writing the plugin.

Now I'll build the plugin. Starting with the package skeleton:

Now the client-side engine. First the seams, config, and key mapping:

Now let me install dependencies and build:

Now the tests — a behavioral test of the built client bundle plus the host half:

Three failures — one test-harness gap and one real robustness bug (timer-id flagging). Let me fix both:

All 17 tests pass. Let me fix the test script and try the DSHX source check via its CLI:

DSHX's CLI source check is fully green. Let me see how DSHX obtains the authenticated Host URL (for a manifest-level proof):

The DSHX inspect channel works (unlike the claim-gated tools). Let me check what the Service catalog enumerates, to turn it into activation proof:

The tool list confirms there's no client-eval channel, so my own evidence files are the verification path. Let me confirm the profile patch is live-watched (no restart needed):

Now let me install the plugin into the live desktop profile (official CLI), with backups first:

Live activation confirmed without a restart (the Host's own pid/node wrote `host-mount.json` at 00:47:55). Let me add unmount self-evidence and re-prove both transitions with the current build:

Let me read the client-side evidence (the key proof) and then settle whether the Host re-imports on remount:

The client half is live in the real Electron page (4 self-reports). Let me verify the real scroll structure so `w/s` target the right pane:

The live transcript scrollport is `[data-conversation-scroll]`. Let me harden scroll targeting with that official anchor and add a build-identity field:

Two real findings: the Host caches the Node-half module (restart needed for Node changes), and my body-limit path recorded garbage. Let me fix the latter properly:

All 19 tests green. Now let me add a live-self-probe so the real page reports whether it can find DSH's scrollport and composer:

The probe's real lesson: at mount time the shell DOM may not be rendered yet. Let me add a settled probe after the shell paints:

The settle probe fires before the test builds its DOM. Let me make the harness build the DOM *before* apply (faithful to a real page):

All 20 tests green. Now let me push the newest client bundle into the live page and read the real-DOM self-probe:

Live proof — the real page resolves `div[data-conversation-scroll]` (1824px range) and `div[data-composer-input]`. Let me confirm horizontal scroll exists for wide code blocks, then write the docs:

Let me read the workspace README (I need to keep its plugin list accurate):

Now the documentation. First the plugin README:

Documentation done. Final verification pass on the frozen source:

Tests and the live plugin shared one evidence directory — a real flaw. Let me isolate them, then re-capture clean live evidence:

已完成并**已装机生效**。插件是 `@oblivion/vimc`，源码在 [oblivion-vimc/](oblivion-vimc/)，挂在你当前这个桌面 profile 上——不用重启，现在就能按。

## 键位与生效条件

| 键 | 行为 |
| --- | --- |
| `w` / `s` | 上翻 / 下翻一页（容器可视高度 × 0.9） |
| `a` / `d` | 左 / 右移一屏（宽代码块、表格、diff、终端块自己的横向条） |
| `W` / `S` | 回到顶部 / 跳到底部 |
| `i` | 聚焦输入框（`[data-composer-input]`，默认选中光标所在行） |

生效条件就是你要的那条：**焦点在输入框/终端里时一个键都不接管**（`contenteditable` 的 Lexical 宿主、`input`、`textarea`、`select`、`[role=textbox]`、`.xterm` 全部识别）；`Ctrl/Alt/Meta`、中文输入法选词期、已被 `preventDefault` 的事件一律放行；**找不到可滚容器时也不吞键**。滚谁按「视口中心探测 → DSH 正文 `[data-conversation-scroll]` → 上次容器 → 根滚动元素」四级来定，所以弹窗打开时滚弹窗、光标压在宽代码块上时滚那个块。

## 一个关键取舍：没用 `ctx.shortcuts`

DSH 官方快捷键服务看着正好能表达「只在 page 区域生效」，但桌面端 Windows/macOS 的**原生键盘桥会先于本地处理拦截已接受的组合键**，且 `ShortcutRegistry.dispatch()` 在 priority 为真时**跳过 region 判定**（`packages/client/shortcuts/src/client/{registry,native}.ts`）。把裸字母 `w/s/a/d/i` 注册进去，结果是你在输入框里**打不出这几个字母**。所以改成页面级 keydown + 自判焦点区域（Vimium 同类做法），代价是它不出现在 DSH 快捷键设置页——这一点写在 [README 第三节](oblivion-vimc/README.md) 里，属于宿主侧能力缺口，建议反馈上游。

## 验证（本机 DSHX 验证面全废，所以自建了证据链）

| 项 | 结果 |
| --- | --- |
| `npm test` | **20/20**（对构建产物 `lib/client.js` 派发真实 `KeyboardEvent`：翻页量级、大小写锁定、IME/修饰键放行、输入框守卫三条路径、横向轴、选区模式、卸载清理） |
| `npm run build` / `typecheck` | ✅ / ✅ |
| `dshx check`（CLI） | **全绿**，无 ERROR/WARN |
| 宿主半边挂载 | `%TEMP%\oblivion-vimc\host-mount.json`：pid 24220 / node 24.18.1（DSH 宿主自身写入） |
| 客户端半边真实运行 | `client-beat.json`：UA `@deepseek-ai/dsh-desktop/0.2.0-rc.2 … Electron/44.0.0`，`mounted` ×13 |
| 真实页面锚点自检 | `div[data-conversation-scroll]`（可滚 2157px）、`div[data-composer-input]`（命中优先选择器） |

后两项来自插件自带的诊断路由 `POST /oblivion-vimc/beat`（限长 8 KiB + 来源校验，不含 URL/会话内容/凭据）。

## 两件需要你知道的环境事实

1. **DSHX 的 MCP 工具面在本机全废**：`dshx_check`/`activate_new_client`/`activation_plan`/`scaffold`/`browser_open` 都先跑 `dshx creator claim`，而 claim 依赖 POSIX `ps -o lstart=`，恒报 `Creator+ Host identity is incomplete`。我改用 **`dshx` CLI 的 `check`**（不经 claim 包装）拿到源码契约证据，挂载走工作区既有路径（官方 `dsh plugin add link:` + `cordis.patch.yml` 插入行）。已写进 [WORKSPACE.md](WORKSPACE.md) 的「已知限制 3」。我没有去改任何官方源码来绕过它。
2. **宿主半边（`src/index.ts`）的改动要重启 App 才生效**（Host 复用 ESM 缓存里的模块命名空间，禁用再启用不会重新导入；浏览器半边不受此限，实测每次图重算都自动重挂）。当前跑着的宿主半边是首版——**用户可见功能完全一致**，差的只是 `moduleUrl` 字段、413 处理与卸载自证。你方便时重启一次即可。

## 文档与登记

[插件 README](oblivion-vimc/README.md)、[设计笔记](.design/vimc-键盘导航.md)（REQ/DEC/AC + 实测）、[CHANGELOG.md](CHANGELOG.md) 新条目、[CONTRIBUTING.md](CONTRIBUTING.md) 第三方复用登记（vimium-c 理念启发 1 行 + devDependencies 4 行 —— 仅理念吸收，未复制任何上游代码，`npm test` 新增的 `happy-dom` 已登记）、[README.md](README.md) 与 [.memory/daily/2026-10-05.md](.memory/daily/2026-10-05.md) 已同步。根 `VERSION` 未动：仓库根没有 CHANGELOG/AGENTS 所引用的 `scripts/bump-version.ps1`，已在 CHANGELOG 记录为待补工具。profile 的 `package.json` / `cordis.patch.yml` 都留了 `.bak-before-oblivion-vimc` 备份。

**请你验一下**：点一下主页面（别点输入框）按 `s`/`w` 翻页、`W`/`S` 到顶到底、`i` 回到输入框；然后试着在输入框里打 `wsad i` —— 应该完全是普通字符。觉得跟手了但想要「`Esc` 退出输入框」，在控制台执行 `oblivionVimc.set({ escapeToPage: true })` 即可；想瞬时滚动（长按连发更利落）用 `oblivionVimc.set({ smooth: false })`。

- 涉及工具: `cordis_inspect_list`, `cordis_inspect_query`, `create_goal`, `dshx_activate_new_client`, `dshx_activation_plan`, `dshx_browser_open`, `dshx_check`, `dshx_claim_plugin`, `dshx_scaffold`, `dshx_status`, `edit`, `glob`, `grep`, `present`, `pwsh`, `read`, `todo_write`, `update_goal`, `web_fetch`, `web_search`, `write`

---