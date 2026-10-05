# `@oblivion/vimc` 键盘导航插件 设计笔记

- **版本**：1.7.0 ｜ **日期**：2026-10-05 ｜ **状态**：已落地并装机（v0.2.8）
- **实现**：[`oblivion-vimc/`](../oblivion-vimc/README.md)（用法、键位、配置、安装卸载一律看插件 README，本文件只记**为什么**与**验收基线**）
- **上游参考**：gdh1995/vimium-c（理念启发，未复制代码；登记见 [`CONTRIBUTING.md`](../CONTRIBUTING.md)）；
  本机配置样本：`C:\Programs\Configure\vimium_c-20251214_001720.json`

---

## 1. 意图（REQ）

| 编号 | 需求 |
| --- | --- |
| REQ-1 | 把 DSH 当浏览器用：焦点不在输入框里时，用键盘翻页，减少鼠标往返 |
| REQ-2 | 键位照搬所有者给出的 Vimium-C 配置：`w/s/a/d`、`W/S`、`i` 聚焦输入框 |
| REQ-3 | **只在「鼠标点了主页面 / 焦点不在输入框内」时生效** —— 打字绝不能被吞 |
| REQ-4 | 交付形态是 DSH 外部插件，命名 `@oblivion/vimc`，与本仓库其余 `@oblivion/*` 同一工程规范 |
| REQ-5 | **兼容 Vimium-C 的配置项**（`vimium_c-*.json`），并提供**设置页面** |
| REQ-6 | `f`：屏幕上的可点击元素浮出字母（少则 1 个字母、多则 2 个），输入字母即跳转 |
| REQ-7 | `i` 进入输入框之后，必须能用 **`Esc` 退出输入框** |
| REQ-8 | 一个键跳到**上一条提问**（读到回答中间时回到本轮提问；已在提问顶部则继续往上），落点与右侧轮次导航一致 |
| REQ-9 | 版本规则改为：**从 `0.0.1` 起步、已有版本不回改、每次先加第三位** |
| REQ-10 | **确认插件不拖慢客户端**（可自证的开销数据，而不是口头保证） |
| REQ-11 | `/` 打开**页面内查找**，`,` / `.` 按关键词前后跳转（对应导出里的 `enterFindMode` / `performBackwardsFind` / `performFind`） |
| REQ-12 | 平滑滚动的**翻页距离**取小一点（**0.6**）：输入框占掉一部分可视高度 |
| REQ-13 | `f` 的候选：**会话正文里的链接优先拿单字母**，外部按钮排在后面 |
| REQ-14 | 页面内查找的**落点靠上留一点距离**（居中不好看） |
| REQ-15 | 落点必须**真的对齐**命中（错位等于没有落点），并在滚动/平滑滚动中跟随 |
| REQ-16 | **内联引用单独一档**，排在消息操作按钮之前；复用 vimium-c 的逻辑、保留本插件 UI |
---

## 2. 决策（DEC）

| 编号 | 决策 | 依据（一句话） |
| --- | --- | --- |
| DEC-1 | **不用 `ctx.shortcuts`**，改为页面级 `keydown` + 自判焦点区域 | 桌面端原生键盘桥先于本地处理拦截已接受组合键，且 `dispatch()` 在 priority 为真时跳过 region 判定 → 注册裸字母会让用户**打不出**这些字母 |
| DEC-2 | 滚动目标 = 视口中心探测 → `[data-conversation-scroll]` → 上次容器 → 根滚动元素 | DSH 是 100vh 外壳、内部面板各自滚动；中心探测天然把「弹窗打开时滚弹窗」做对 |
| DEC-3 | 事件级放行：修饰键未声明 / IME 组合 / 已 `preventDefault` / 无可滚容器 → **一律不接管** | 宁可少管一次，也不能吞掉宿主或系统的按键 |
| DEC-4 | 「有效 Shift」按**物理 Shift** 判，字符比对不分大小写 | 大写锁定不该把 `w`（上翻）变成 `W`（到顶） |
| DEC-5 | ~~不注册 DSH 设置面板~~ → **v0.2 起注册**（`settings.section` order 46） | REQ-5 要求设置页；v0.1 的「功能面太小」判断被新需求推翻 |
| DEC-6 | 自带诊断证据链：宿主写自证文件 + `POST /oblivion-vimc/beat` | 本机 DSHX 验证面不可用（§4），否则「客户端半边到底有没有在真实页面跑起来」无从证明 |
| DEC-7 | 挂载走 profile `link:` 依赖 + `cordis.patch.yml` 插入行（**不**声明 `dsh.bundle`） | `dsh.bundle` 是 profile 层，改一次要重启；插入行是受监视补丁层，实测**同一秒**即被装载 |
| DEC-8 | **键位文本是单一真源**：内置默认也写成一段 `map` 文本（`DEFAULT_KEY_MAPPINGS`），与用户文本走同一条解析路径 | 两套机制（硬编码表 + 解析器）必然漂移；一套路径等于「默认值就是可编辑的那段文本」 |
| DEC-9 | `a`/`d` 采用 Vimium 的**像素语义**（`scrollLeft`/`scrollRight` = `scrollStepSize` 像素，实测导出 90），不做「一屏」 | REQ-5 要求兼容该配置；「一屏」在 Vimium 里是 `scrollPageUp/Down`，混用会让导入后的手感与上游不一致 |
| DEC-10 | 链接提示用**统一长度**（≤ 字母表长度全部 1 字母，否则全部 2 字母），字母按「行 → 左」分配 | 混合长度有前缀歧义（`d` 与 `da` 并存时无法确定「立即触发还是等待」）；统一长度无需等待启发式 |
| DEC-11 | 设置页用 `ctx.inject(['slots'], …)` **渐进注册**，不把 `slots` 写成 `inject` 硬依赖 | 键盘引擎不该因为某个 UI 服务缺席而不安装；精简外壳里按键仍可用 |
| DEC-12 | 不接管的 Vimium 命令必须**逐条给出理由**（导入报告 + 设置页可见），不静默忽略 | 「兼容」的诚实边界：用户必须能看见哪些键为什么没生效 |
| DEC-13 | `Esc` 退出输入框是**隐式行为**（不占键位表），且让位给已打开的菜单/弹窗 | 与 Vimium 的「插入模式」语义一致；占键位会被 `unmapAll` 意外清掉 |
| DEC-14 | 触发链接提示用**合成指针序列**（`pointerdown → mousedown → pointerup → mouseup → click`）而不是 `element.click()` | React 的 `onMouseDown` 与 `onClick` 都要照顾；`click()` 只覆盖后者 |
| DEC-15 | 轮次跳转复用 DSH 官方锚点 `[data-chat-turn]`，判定用「**严格**在当前视口顶之上（8px 容差）里最靠下者」 | 与右侧轮次导航同源（不碰 class 名/内部结构）；「严格之上」才能实现「第一次回本轮、第二次再上一条」而不会卡住 |
| DEC-16 | 性能按**可测量**来做：① 筛序「便宜在前」② `checkVisibility()` 快路径 ③ 按键路径**先纯计算后问 DOM** ④ 自证里回报实测耗时 | REQ-10 要的是证据不是保证；实测把这四处的最贵一项（逐元素计算样式）从 111.8ms 压到 11.2ms |
| DEC-17 | 版本规则改为「0.0.1 起步、不回改、先加第三位」，且脚本**拒绝位置参数 minor/major** | REQ-9；把规则写进脚本而不是只写文档，避免「顺手 minor」 |
| DEC-18 | 宿主心跳落盘改**750ms 合并窗口**（尾部必写） | `writeFileSync` 是同步 IO，每条按键写一次会把诊断功能变成真实开销 |
| DEC-19 | 页面内查找自己实现（`Range` + CSS Custom Highlight），**不用 `window.find()`** | `window.find()` 会接管原生选区，而 DSH 输入框是 Lexical 宿主，外部改选区会导致编辑器状态与 DOM 不同步 |
| DEC-20 | 查找框做成 `<input>`，靠**已有的可编辑区守卫**让位 | 不需要为「查找模式」新增状态机：框内打字天然不会被插件吃键 |
| DEC-21 | 翻页距离取 0.7，并对「旧默认 0.9」做定向迁移 | REQ-12 给了 0.6–0.8；迁移只针对「没有 v0.2 字段」的旧存储，用户改过的值不动 |
| DEC-22 | 查找条做**两态**：编辑态（输入框，聚焦）→ 回车后**提交**为只读 HUD（输入框收起、焦点回页面） | 不这样做的话 `,`/`.` 会被仍持有焦点的输入框当普通字符吃掉；形态与 Vimium/浏览器原生查找条一致，计数写作 `(N 处)` |
| DEC-23 | 查找落点必须**与高亮能力解耦**：① `::highlight()` 只用长写属性（`background-color`，简写会被丢弃）② 每次都画 `position: fixed` 的**落点标记（ping）** ③ 落点居中 ④ 命中在折叠 `<details>` 里时先点 `<summary>` 展开再跳 ⑤ 自检回报 `highlight`/`pings` | 所有者实测「跳过去没有高亮、不知道在哪」；根因是「高亮不可见」与「命中在折叠内容里」两类，任何一种都会让跳转白跳 —— 所以要有**不依赖高亮 API** 的可见落点 |
| DEC-24 | `f` 候选按三档排序（正文链接 → 正文其它 → 外部），提示串按顺序分配且**短提示优先**：单字母用完时，其余用**被保留首字母**的两位串（`d…x` 单字母 + `zd/zs/…`） | 所有者要求「正文链接优先单字母、外部按钮靠后」；保留首字母是让混合长度**仍然前缀无歧义**的唯一简单办法（按 `d` 立即触发，按 `z` 才等第二键） |
| DEC-25 | 查找落点比例 1/2 → **1/4** | 所有者反馈「太靠中了不好看」，要求像自己那条提问的位置（靠上、离顶边一点距离） |
| DEC-26 | 翻页比例默认 **0.6**，历史默认（0.9 / 0.7）**定向迁移**，判据是存储里有没有 `regexFindMode` 字段 | 字段是 v0.2.2 才引入的：没有它 = 那份配置只可能带历史默认值；用户自己调过的值（如 0.5）必须保留 |
| DEC-27 | 落点标记必须**先滚再画**且在存活期**跟随重摆**（`scroll`/`resize` 捕获 + rAF 节流），寿命 1200ms | 所有者实测「搜『高亮』黄框落在『结果』旁」：视口坐标 + 先画后滚 = 错位。上游 `flash_()` 走页面坐标（`.AbsF`），DSH 是嵌套滚动容器、不能假定定位上下文 |
| DEC-28 | 内联引用独立成①档：真链接，或 `title`/`aria-label` 含 `/`、以 `@` 开头、或以**已知扩展名**结尾 | 所有者要求「引用排在消息操作按钮之前」；判据必须紧（宽泛的「点+短串」会把 `v4.1` 这类版本号误判，实测踩过） |

---

## 3. 验收基线（AC）与实测结果

| 编号 | 验收条件 | 结果 | 证据 |
| --- | --- | --- | --- |
| AC-1 | 源码契约全绿（manifest / `export apply` / 无默认导出 / boot-marker / overlay 可移植 / `dsh.client.platform=web` / `client-inject` / 构建产物到位） | ✅ | `dshx check <dir>`（CLI）无 ERROR/WARN |
| AC-2 | 构建与类型检查通过，版本一致 | ✅ | `npm run build` / `typecheck` / `check:version` = `0.2.0` |
| AC-3 | REQ-2 键位语义可验证（翻页、像素步进、到顶到底、修饰键） | ✅ | `npm test`（对构建产物派发真实 `KeyboardEvent`） |
| AC-4 | REQ-3：焦点在输入框内时零接管 | ✅ | 三条路径测试（目标是可编辑元素 / 焦点在输入框而目标在 body / 输入框内字母键）；另测 IME 与未声明修饰键放行 |
| AC-5 | 宿主半边真的挂载 | ✅ | `%TEMP%\oblivion-vimc\host-mount.json`（DSH 宿主自身写入，pid 24220） |
| AC-6 | 客户端半边在**真实页面**运行 | ✅ | `client-beat.json`：`clientVersion 0.2.0`、UA 含 `@deepseek-ai/dsh-desktop/0.2.0-rc.2 … Electron/44.0.0` |
| AC-7 | 真实页面里锚点解析得到 | ✅ | 渲染后自检：`div[data-conversation-scroll]`、`div[data-composer-input]`（via `[data-composer-input]`） |
| AC-8 | 挂载无需重启应用 | ✅ | 写完插入行同一秒出现 AC-5 的证据；每次图重算都新增一条 `mounted` |
| AC-9 | 卸载干净、可回滚 | ✅ | 单元测试覆盖卸载自证、路由 dispose、提示浮层清理；操作层留 `disabled: true` 墓碑与 `remove` |
| AC-10 | 不动 DSH 官方源码/产物 | ✅ | 改动只在 `oblivion-vimc/` 与用户 profile（依赖 + 用户补丁层）内 |
| AC-11 | REQ-5：真实 Vimium-C 导出可导入且语义对上 | ✅ | `npm test` 的导入断言：`linkHintCharacters=dsavewrqcxz`、`scrollStepSize=90`、`keyLayout=0`→按字符匹配、排除规则、`o.prefer` 合并到默认选择器之后、`w/s/a/d/W/S/f/i/q` 全部解析出命令、未支持命令逐条有理由 |
| AC-12 | REQ-5：设置页真的出现在 DSH 设置里 | ✅ | 线上 `Slots` 只读查询：`settings.section` 占用者 `{ registrant: "@oblivion/vimc-client", id: "oblivion-vimc", order: 46, active: true }` |
| AC-13 | REQ-6：`f` 提示行为（1↔2 字母、触发、取消、前缀） | ✅ | 5 条提示测试：3 个候选→`d/s/a` 单字母；15 个候选→全部 2 字母且前缀不误触发；输入触发合成点击；`Esc` 取消；未命中字母退出且不触发 |
| AC-14 | REQ-7：`i` 进入、`Esc` 退出 | ✅ | 测试断言 `Esc` 触发 blur 且 `preventDefault`；菜单打开时让位；关掉选项后不接管 |
| AC-15 | 真实按键在活跃页面里被处理过 | ✅ | 宿主计数器：`scrollPageUp 9 · scrollPageDown 7 · focusInput 2 · scrollToTop 1 · scrollToBottom 1` |
| AC-16 | 测试总数与覆盖 | ✅ | `npm test` → **34/34**（client · vimium · host 三组） |
| AC-17 | REQ-8：轮次跳转语义与边界 | ✅ | 测试：读到轮 2 中间按 `[` → 回到轮 2 顶（898）；再按 → 轮 1 顶（98）；再按 → **不吞键不滚动**；`]` → 轮 2；描边用完还原 |
| AC-18 | REQ-8：与右侧导航同源 | ✅ | 线上自检 `probe.turns.count = 3`（来自 `[data-chat-turn]`） |
| AC-19 | REQ-10：开销可测且有量级改善 | ✅ | 真机：候选扫描 **111.8ms → 11.2ms**（命中 1220 → 候选 42）；按键平均 1.825ms / 峰值 3ms（重排前样本）；打字路径重排后不做 DOM 查询 |
| AC-20 | REQ-9：版本规则生效 | ✅ | 默认 `version:bump` → `0.2.0 → 0.2.1`；位置参数 `minor` 被拒绝；`--check` 一致 |
| AC-21 | 真实使用证据 | ✅ | 宿主计数器：`scrollPageUp 20 · scrollPageDown 22 · linkHints 7 · focusInput 2 · scrollToTop 2 · scrollToBottom 6 · escapeToPage 1`（`f` 与 `i`→`Esc` 都在真实页面里被用过） |
| AC-22 | REQ-11：查找行为（开关、边打边找、回绕、Esc 后继续、正则） | ✅ | 3 条测试：`/` 打开且焦点在框内（插件快捷键自动让位）；`alpha` 命中 3（智能大小写）；`Enter`/`Shift+Enter` 前后跳并回绕；`Esc` 关闭但保留查询，`.`/`,` 继续；`regexFindMode` 下 `\d{3}` 命中 1、非法正则 0 |
| AC-23 | REQ-11：不侵入 DOM | ✅ | 高亮走 `CSS.highlights`（`Range`，不包 `<mark>`）；不支持时只滚动；测试断言插件不注入常驻节点 |
| AC-24 | REQ-12：翻页距离 | ✅ | 默认 `pageRatioVertical = 0.7`；测试断言 v0.1 的旧默认 0.9 被迁移、用户自定义值（0.5）保留 |
| AC-25 | 查找条形态与「回车后失焦」 | ✅ | 测试：计数写作 `(3 处)`；`Enter` 后 `find.committed = true`、输入框 `display:none`、`activeElement` 不再是输入框、HUD 文本显示查询；随后 `.`/`,` 直接前后跳；再按 `/` 回到编辑态且查询被全选；HUD 形态下 `Esc` 也能关闭 |
| AC-26 | 查找落点「一定看得见」 | ✅ | 测试：每次跳转 `find.pings` 递增、关闭时标记清零；命中在折叠 `<details>` 内时跳转前先把该组 `open` 置真。真机自检：`find.highlight = custom`（高亮可用）、`find.pings` 随跳转增长 |
| AC-27 | REQ-13：候选优先级与短提示 | ✅ | 测试：正文链接 → 正文按钮 → 外部按钮（外部即使更靠上/靠左也排最后，`hints.tiers = {links:1,content:1,outer:1}`）；15 个候选时前 10 个单字母、其余 `zd…`，且**任意提示串都不是另一个的前缀**；单字母一按即触发，两字母需两段 |
| AC-28 | REQ-14：落点比例 | ✅ | `LANDING_RATIO = 1/4`；行为在真机由落点标记与滚动位置体现 |
| AC-29 | REQ-12：翻页 0.6 + 迁移 | ✅ | 测试：默认 0.6；无 `regexFindMode` 的旧配置里 0.9/0.7 都迁到 0.6；带 `regexFindMode` 的 0.7 视为用户选择而保留；0.5 保留 |
| AC-30 | 落点标记跟随滚动（不再错位） | ✅ | 测试：初始位置 = 矩形 top − 2；模拟滚动 40px 后标记 top 同步变化、`find.repositions` 增加；关闭后标记清零。真机自检回报 `find.repositions` |
| AC-31 | 内联引用独立成档（判据紧） | ✅ | 测试：`title="oblivion-vimc/README.md"` 与 `aria-label="@oblivion/brand"` 判为引用（信号 `path`/`at`/`ext`）、排在消息操作按钮之前；`aria-label="复制"` 与带版本号的 `"deepseek-v4.1"` **不算**引用。真机：`references 1 / content 25 / outer 20`、信号 `path` |
| AC-32 | 上游署名与许可正确 | ✅ | README 更正 vimium-c 为 **Apache-2.0**，并逐文件登记「复用什么 / 哪里不一样」；`find.ts`、`hints.ts` 文件头写明上游文件与「未复制代码」 |

---

## 4. 环境事实（本轮实测，已同步到 `WORKSPACE.md`）

1. **DSHX 的 MCP 工具面在本机全废**：`dshx_check` / `activate_new_client` / `activation_plan` /
   `scaffold` / `browser_open` 都先跑 `dshx creator claim`，claim 依赖 POSIX `ps -o lstart=`，
   恒报 `Creator+ Host identity is incomplete`。**但 `dshx` CLI 的 `check` 子命令可用**（AC-1 即来自它）。
2. **宿主半边改动需重启 DSH App**（Host 复用 ESM 缓存里的模块命名空间）；浏览器半边不受此限。
3. `http://127.0.0.1:19387/` 需认证且本机无浏览器绑定文件 → Agent 侧读不到 `__DSH_BOOT__`（DEC-6 的动因）。
4. **`exclusionRules` 在导出里是数组**（`[{ passKeys, pattern }]`）—— 注意 PowerShell 的
   `ConvertTo-Json` 会把单元素数组显示成对象，据此判断类型会踩坑（本轮踩过）。

---

## 5. 未决 / 后续

| 项 | 说明 |
| --- | --- |
| **宿主侧能力缺口**（建议反馈上游） | 若能注册「页面级、不被原生层拦截」的命令，本插件就能既保留裸字母语义、又出现在 DSH 快捷键设置页 |
| 多键序列 | `Xx` / `Gg` / `Fq` 这类 Vimium 序列键未实现（当前逐条列为未接管） |
| 更多 Vimium 命令 | 查找（`/`、`n`）、Marks、可视模式、剪贴板类；`reload`/`goUp` 因会破坏应用外壳而**故意不做** |
| 链接提示的遮挡过滤 | 当前只判可见性，未判「被浮层/其他元素遮挡」 |
| 提示候选收敛 | DSH 会话页实测一次 1200+ 选择器命中（`<summary>`/`<button>`/`[tabindex]`），可考虑按「可操作性」再过滤 |
| 轮次跳转跨分页 | 只覆盖已加载轮次；跨分页需要 DSH 的分页接口（当前无公开客户端服务，见 §6 备注） |
| 设置页国际化 | 目前中文硬编码（与 `oblivion-brand` 同策略） |

---

## 6. 与设计书的关系

本插件**不在** [`.design/ARCHITECTURE.MD`](ARCHITECTURE.MD) §9.1 的 8 项能力清单内，
而是所有者直接指定的**交互工具类**插件（与 `@oblivion/brand` 同层：只改 UI/交互，不碰知识域）。
若后续要并入主线，需要在设计书里补 REQ 与 DEC，再更新 §9.1 的清单与计数（README 的「8 个插件」口径同步改）。
