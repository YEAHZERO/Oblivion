# 创造一个插件（命名为@oblivion · 轮 2

- 来源会话: `session-10837d9b-ba07-420d-a8d3-3e14e1972481`

## 问题

@C:\Programs\Configure\vimium_c-20251214_001720.json 根据这个配置文件，设置本插件兼容该配置项，然后在设置中给出设置页面。
同时，i进入输入框，需要「Esc 退出输入框」；还需要 f 对屏幕上的可点击链接出现字母显示，图中的各个可点击的按照1个字母，多的时候再采用2个字母，输入该字母后能跳转的结果

## 回答

New scope: config compatibility + a real settings page + link hints (`f`) + Esc-to-leave-input. Let me start by reading your Vimium-C config and inspecting DSH's settings slot.

Now let me learn DSH's settings-slot contract and theme tokens from the live page:

Now I'll implement. First the Vimium-C compatibility layer (key-mapping parser + config importer):

The parser loop I wrote has a garbled branch — let me rewrite it cleanly:

Now the key model (modifier-aware, driven by the parsed mapping text):

Now the link-hints engine (`f`):

Now the engine (new commands, hints routing, exclusions):

Now the DSH settings page (React panel):

The bundle grew 3× — let me check whether React got bundled instead of externalized:

React is correctly external. Now let me update the test suite for v0.2 behavior and add the new tests:

`exclusionRules` is an array (PowerShell's JSON display unwrapped it). Let me fix the importer and the two test-side mistakes:

Test flaw found (the code block isn't inside the viewport, so the y-axis had no target). Fixing:

All 31 tests pass. Let me bump to v0.2.0 and run the DSHX source check:

Source check green. Now deploying v0.2.0 to the live page and verifying:

Live proof is strong — the Host recorded **real keypresses** (scrollPageUp ×9, scrollPageDown ×7, focusInput ×2, …) from your session. Let me verify the settings page is registered live:

Settings page is live (registrant `@oblivion/vimc-client`, id `oblivion-vimc`, order 46). Now the docs:

Let me add a render test for the settings panel (its riskiest untested code):

PowerShell's `[IO.File]` used the process CWD, not the `cd` — let me use the edit tool instead:

All 32 pass. Final logging and consolidated verification:

已完成并在线生效（无需重启）——`@oblivion/vimc` **v0.2.0**。顺便说一句：我读宿主证据时看到**你刚才真按了键**（`scrollPageUp 9 · scrollPageDown 7 · focusInput 2 · scrollToTop 1 · scrollToBottom 2`），说明按键链路在你这个真实页面里已经跑通了。

## 1. 兼容那份 Vimium-C 配置

| 导出里的项 | 本插件 | 实测值 |
| --- | --- | --- |
| `keyMappings`（map/run 文本） | `keyMappings`（可在设置页直接编辑） | 解析出 `w s a d W S f i q` + `Ctrl+↑↓←→` 等；**续行、`#` 注释、`unmapAll`、`run q i` 别名、`o.select`/`o.prefer` 都支持** |
| `linkHintCharacters` | 同名 | `dsavewrqcxz`（已作默认） |
| `scrollStepSize` | 同名 | `90`（已作默认） |
| `keyLayout = 0` | `ignoreKeyboardLayout: false` | 按**产出字符**匹配 = 你截图里「始终忽略键盘布局」停用 |
| `exclusionRules[].pattern` | `exclusions` | 命中即整体停用（模式语言子集） |
| `searchEngines` / `clipSub` / `grabBackFocus` / `vimSync` / `regexFindMode`… | — | 面板里**逐条给出「为什么不适用」**，不静默忽略 |

**一处语义变化要知道**：`map a scrollLeft` 在 Vimium 里是 `scrollStepSize` **像素步进**（不是「一屏」，一屏是 `scrollPageUp/Down`）。所以 `a/d` 现在是 90px 步进；想一按走更远：设置页改「像素步长」，或 `oblivionVimc.set({ scrollStepSize: 600 })`。另外那份 keyMappings 还把 `←/→/Backspace` 绑到前进/后退、`q` 绑到聚焦输入框——这些等你导入时才生效。

## 2. 设置页：**设置 → Oblivion 键盘导航**（order 46，紧挨「Oblivion 品牌」）

键位文本（含**生效键位**与**未接管命令逐条理由**）· 滚动（平滑/翻页比例/像素步长）· 输入框（Esc 退出、编辑中允许翻页、选区模式、优先选择器）· 链接提示（字母表 + 就地试跑）· **兼容导入**（选 `vimium_c-*.json` 或粘贴 JSON → 显示已采纳/未采纳报告）· 排除规则 + **只读自检**。改完即生效，不需要「保存」。

## 3. 链接提示 `f`

视口内可点击元素浮出琥珀色字母：**候选 ≤ 11 个时每个 1 个字母，更多时全部 2 个字母**（统一长度，避免 `d` 与 `da` 并存的前缀歧义），按「行 → 左」分配；输入即触发（依次派发 `pointerdown→mousedown→pointerup→mouseup→click`，React 与 `<a>` 都吃）；`Esc` 或字母表外的键取消；浮层随滚动重排、用完即删，**不注入常驻 DOM**。

## 4. `i` 进、`Esc` 出

`Esc 退出输入框` 现在**默认开启**（隐式行为，不占键位），有菜单/弹窗打开时让位给菜单。

## 5. 验证

| 项 | 结果 |
| --- | --- |
| `npm test` | **32/32**（含**用你那份真实 JSON 做的导入断言**、链接提示 5 条、设置页 SSR 渲染、像素步进、`unmapAll` 覆盖） |
| `dshx check`（CLI） | 全绿（新增 `client-inject` 检查通过） |
| 构建/类型/版本 | ✅ / ✅ / `0.2.0` |
| 线上自检 | `clientVersion 0.2.0`、`keys.active 12 · unsupported 0 · errors 0`、`hints.characters dsavewrqcxz`、视口内可点击元素 155 个、竖向容器 `div[data-conversation-scroll]` |
| 设置页在线 | `Slots` 只读查询：`settings.section` 占用者 `{ registrant: "@oblivion/vimc-client", id: "oblivion-vimc", order: 46, active: true }` |
| 你的真实按键 | 宿主计数器持续累加（见开头那组数字） |

## 6. 你现在可以试

按 `f` 看字母浮层 → 输字母跳转；`i` 进输入框、`Esc` 出来；打开设置就能看到新页面。**要不要我把那份 `keyMappings` 全量导入**（会带上 `unmapAll`、`q→focusInput`、`←/→/Backspace→前进后退`）？也可以你自己在设置页点「选择 vimium_c-*.json」——我不擅自打开，是因为 `←/→` 绑历史导航属于会改变手感的一步。

## 7. 已知边界（都写进 README 与设计笔记了）

序列键（`Xx`/`Gg`/`Fq`）、Vomnibar/标签页/查找/剪贴板/Marks/可视模式**不实现**（逐条给理由）；`reload`、`goUp`/`goToRoot` **故意不做**（会重建或改写应用外壳）；提示候选可能很多（DSH 会话页 `<summary>`/`<button>` 都算可点击，实测一屏 155 个 → 自动 2 字母）；另外**宿主半边**（413/`moduleUrl`/卸载自证）仍需重启 App 才加载，浏览器半边与你可见的功能不受影响。

文档已同步：[插件 README](oblivion-vimc/README.md)、[设计笔记](.design/vimc-键盘导航.md)（DEC-8~14 / AC-11~16）、[CHANGELOG](CHANGELOG.md)、[CONTRIBUTING](CONTRIBUTING.md) 登记（React 及类型包）、[README](README.md)、[每日日志](.memory/daily/2026-10-05.md)。

- 涉及工具: `cordis_inspect_query`, `create_goal`, `edit`, `present`, `pwsh`, `read`, `todo_write`, `update_goal`, `write`

---