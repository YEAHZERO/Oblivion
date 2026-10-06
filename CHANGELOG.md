# 变更日志

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)，版本单一真源是仓库根的
[`VERSION`](VERSION) 文件，由 [`scripts/bump-version.ps1`](scripts/bump-version.ps1) 写入。
发布流水（三级分层：alpha / rc / patch）记在 `.memory/release/`（本机目录，不入库）。

> **版本递增规则（2026-10-05 所有者裁定）**：任何新版本线从 **`0.0.1`** 起步；**已有版本号不回改**；
> 此后**每次只加第三位**（patch，例如 `0.2.0 → 0.2.1`）；第二位/第一位**只在明确要求时**才动
> （`--minor` / `--major`），不再由提交类型自动推断。规则同时记在 [`.action/AGENTS.MD`](.action/AGENTS.MD)。
>
> 注：`oblivion-brand/scripts/bump-version.mjs` 的注释里仍写着旧映射（`feat → minor`），
> 该插件下次改动时一并同步；`oblivion-vimc` 的脚本已按新规则实现（`--minor` / `--major` 需显式开关）。

---

---

## [未发布] — `@oblivion/core` v0.1.4：知识库位置可自定义 + 装载即自动建分类目录

### 变更

- **`mdRoot` 可自由自定义**（任何绝对路径或 `~/` 写法），不再只有默认那一个知识库
- **装载即建目录**：`mdRoot` 一经配置，插件装载时就把知识库根与全部分类目录一次性创建出来 ——
  `01_问答沉淀\`、`00_导入文件\`、`02_Wiki页面\`、`03_创作产物\`、`99_其他\`（**不必等第一次落盘**）。
  幂等（`recursive: true`）、非阻塞（失败只记日志，不影响装载与问答链路）、只创建不删除
- **目录名消毒**：`mdClassify` 的值会去掉 `..` 片段、盘符与非法字符 → 配置里的目录名**不可能逃出 `mdRoot`**
- 新增 `ensureMdDirs()` / `mdDirNames()` / `safeDirName()`（经 `@oblivion/core/testkit` 导出，可测）

### 验证

- 单元测试 12 → **13**（新增：自定义 `mdRoot` 后 `01_问答沉淀` 等 5 个目录在 `apply()` 后即存在 + 消毒规则）
- 自检 19 → **22**（新增：装载即建目录、自定义知识库位置后落盘跟着走、分类目录消毒）
- `build` ✅ v0.1.4 / `typecheck` ✅ / `check:version` `0.1.4` ✅ / `verify:dsh` core 8/8 ✅

---

## [未发布] — `@oblivion/core` v0.1.3：知识库落盘位置与分类按所有者裁定落地 + 两份决策记录

### 决策（设计书 §33.6）

| ID | 决策 |
| --- | --- |
| **DEC-028** | `@oblivion/core` **走热挂**（用户层 `cordis.patch.yml` insert 行，落盘即装载、不重启），**不声明 `dsh.bundle`**。代价（换机器/重置 profile 静默失效，DSH-COMPAT R1）由所有者接受，缓解措施随包提交 |
| **DEC-029** | 知识库**根 = `C:/Library/那些渐渐被遗忘`**（既有知识库，不再单开 `oblivion_docs/`），**内部按 `01_问答沉淀/` 分类**（`00_导入文件/` `02_Wiki页面/` `03_创作产物/` `99_其他/` 兜底） |

### 变更

- `config.mdRoot` 默认 `~/OblivionKB` → **`C:/Library/那些渐渐被遗忘`**；新增 **`config.mdClassify`**（来源类型 → 子目录，§25.3）
- `qa-loop/md-writer` 落盘路径由硬编码 `10-Topics/` 改为 **按 `mdClassify` 分类**；未命中规则落 `99_其他/`
- **共用知识库防误伤**：目标文件若不含 `oblivion:` 标记（= 用户自有笔记）则改写 `<topic>-oblivion.md`，**绝不覆盖**同名笔记
- 新增两份决策记录与设计书同步：`.design/ARCHITECTURE.MD` §33.5（①② 标记已裁定）+ **§33.6 决策记录**；§12.12 / §25.3 标注 `oblivion_docs/` 已被取代
- **新增 `.design/core-认知内核.md`**：所有者提供的 `@oblivion/core` 最新设计书入库，文末附「现状对账」（已落地 / 10 条偏差 / 3 项未做）
- 同步更新：`oblivion-core/README.md`（路径、版本、19 项自检、verify:dsh 8/8）、`oblivion-core/cordis.patch.yml`（调参注释 + DEC-028 说明）、`HANDOFF.md`（验证命令）、`.design/DSH-COMPAT.md`（R1 与 core 行）

### 验收

`build` ✅（v0.1.3）/ `typecheck` ✅ / `test` 12/12 ✅ / `selfcheck` **19/19** ✅（新增：§25.3 分类落盘、共用知识库防误伤）/ `check:version` `0.1.3` ✅ / `verify:dsh` core **8/8** ✅。

---



### 修复：`turn/end` 捕获恒为空（插件首版的致命 bug）

**症状**：插件装好了、自检全绿，但 `~/.oblivion/data` 与 `~/OblivionKB/10-Topics` **永远是空的**，且不报错。

**根因**（实测 `@deepseek-ai/dsh-session` 产物）：
`session.eventsSnapshot` 是 **private** 字段，且只在标着 `deprecated`（"new calls are prohibited"）的
`snapshotEvents()` 里 `??=` 懒加载 → 插件直读它**恒为 `undefined`** → 每轮提取不到问答 → 静默不落盘。

**修法**：订阅公开的 `session/event`，**在事件流里自累积本轮事件**
（`turn/start` → `user/message`/`assistant/message` → `turn/end`）；`eventsSnapshot` 只作兜底并打一次告警。
同时按实测的 `source.kind` **只把真人提问当问题**（`agent.inject()` 注入的上下文不再被沉淀）。

> **教训（已写进 README 第五节）**：旧自检也用 `eventsSnapshot` 造数据 → 「自检 11/11 全绿」与
> 「真实知识库永远为空」同时成立。现在自检走真实事件流（`emitTurn()`），不再绕过真实链路。

### 补齐：设计书 4 个遗留差距

| # | 差距 | 设计书 | 0.1.2 |
| --- | --- | --- | --- |
| 1 | L3 只判长度 | §25.1 | 四条规则全实现（<5 字 / 仅无意义词 / 开头 40 字内「不知道」/ 纯寒暄），每条带 reason |
| 2 | F3 深度触发降级 | §25.4 | 连续同维度计数：≥3 次 → **≥3 个候选视角**；闸门单会话 ≤5 次 |
| 3 | F5 无保留期 | §25.7 | **90 天保留期 + 读取时惰性裁剪**（不引入定时任务），裁剪结果落盘，`feedback.stats()` 可查 |
| 4 | F2 闸门与设计不同 | §25.4 | 三通道：主动（会话 ≤3 + 问题 ≥10 字 + 有来源）/ 深度 / 陪伴期；共用置信度 ≥0.3 与「被拒 ≥2 次不再提」 |

### 修正：设计书里不存在的钩子

- `.design/ARCHITECTURE.MD` 4 处、`.memory/TODO.md` 1 处：`session:complete` → **`turn/end`**
  （实测 `session:complete` / `session/complete` 在官方 287 个包里 **0 命中**；`turn` 类只有 `turn/start` / `turn/end`）
- 保留「⚠️ 此处原写 `session:complete`，实测不存在」的注记，防止后来者照旧写法实现

### 其它

- 补 `oblivion-core/scripts/bump-version.mjs` + `version:bump` / `check:version` 脚本项（此前该插件缺递增器）
- 修一条过期测试：`dsh.compat` 是**兼容声明**（宿主范围 + 依赖服务/事件），不是 `dsh.bundle`；断言收紧到 bundle 本身
- 自检 11 → **17 项**（新增：真实事件流端到端、注入上下文过滤、兜底路径、L3 四规则、F3 深度候选、F2/F3 闸门、F5 保留期）

**验收**：`build` ✅ / `typecheck` ✅ / `test` **12/12** ✅ / `selfcheck` **17/17** ✅ / `check:version` `0.1.2` ✅ / `dshx check` ✅。
真实 Host 装载待**重启 App** 后验证（Host 侧改码不会靠禁用再启用重新导入）。

---

## [未发布] — 仓库工程化：依赖改用 pnpm workspace（与 DSH Profile 同一模型）

### 变更：npm 单包 → pnpm workspace

所有者要求「本 oblivion 也使用同样的 pnpm，不然反复出现不同文件夹的 node_modules」。落地：

| 文件 | 作用 |
| --- | --- |
| `package.json`（根，private） | `packageManager: pnpm@11.7.0`；`-r` 聚合脚本（`build`/`typecheck`/`test`/`check:version`/`check`） |
| `pnpm-workspace.yaml` | `packages: ['oblivion-*']` + `allowBuilds: { esbuild: true }`（依赖安装脚本**显式审批**） |
| `.npmrc` | `auto-install-peers=false`（框架包只放 peer）、`strict-peer-dependencies=false`、`hoist=false` |
| `pnpm-lock.yaml` | 工作区唯一 lockfile（入库）；删除两个 `package-lock.json` |

**实测收益（同机迁移前后）**

| 指标 | npm | pnpm workspace |
| --- | --- | --- |
| `oblivion-brand/node_modules` | 38.0 MB / 313 文件 | **0.02 MB / 12 项（5 个符号链接）** |
| `oblivion-vimc/node_modules` | 54.7 MB / 3626 文件 | **0.02 MB / 12 项（9 个符号链接）** |
| 实体依赖 | 两处各一份（~92.7 MB） | 根 `node_modules/.pnpm` 一份（~55 MB，两插件共享） |

### 与 DSH 一致的铁律（写进 `.action/AGENTS.MD` 的《包管理器规范》）

1. **框架包 `@deepseek-ai/*` 只放 `peerDependencies`**，绝不放 `dependencies`（否则运行时两个模块实例、symbol 分裂）。
2. 依赖的 install/postinstall **默认不执行**，只在 `allowBuilds` 里逐包放行（当前仅 esbuild）。
3. `hoist=false`：未声明的依赖一律解析失败。
4. 依赖安装/脚本执行走 **DSH 分发的受控 pnpm 11.7.0**（不要求系统装 Node/pnpm）；
   **禁止**在插件目录里 `npm install`。

### 新增：工作区统一入口 `tools/check-workspace.ps1`

- 本机 `pnpm` **不在 PATH**（DSH 只把 `pnpm.mjs` 作为受控运行时分发），所以根 `package.json` 里
  **不能**写嵌套的 `pnpm run xxx`（实测 `'pnpm' is not recognized`）
- 入口脚本在**运行时**解析运行时位置（可用 `DSH_RUNTIME_ROOT` / `DSH_NODE` / `DSH_PNPM` 覆盖），
  按 `install → typecheck → test → build → check:version` 顺序执行并在任一环失败时中止
- 两个坑记下来：① 脚本必须兼容 **Windows PowerShell 5.1**（`$x = if (...) {...}` 是 pwsh 7 语法，5.1 直接解析失败）；
  ② `.ps1` **必须带 UTF-8 BOM**，否则 5.1 按 ANSI 读、中文变乱码导致 `UnexpectedToken`
- 根脚本 `check`/`build`/`test`/`typecheck`/`check:version` 全部指向它；实测 `pnpm run build|test|check:version`
  与 `powershell -File tools/check-workspace.ps1` 全部 **exit 0**

### 验收

- `pnpm install` 退出 0（esbuild 的 postinstall 经审批执行，`esbuild.transform` 实测可用）
- `pnpm run check`：`typecheck` ✅（brand + vimc）、`test` ✅（vimc **42/42**）、`build` ✅（两插件产物正常）
- `pnpm -r run check:version`：`oblivion-brand 0.1.0` / `oblivion-vimc 0.2.8` 一致
- `dshx check oblivion-vimc` 仍全绿（源码契约不受包管理器影响）

### 顺带更正

- `CONTRIBUTING.md`《第三方复用登记》第 1 行：vimium-c 的许可证由误记的「MIT」更正为 **Apache-2.0**
  （`LICENSE.txt`：Copyright 2023-present Gong Dahan），并补上本地源码版本（2.12.3）与被参考的具体文件；
  其余行「package-lock 锁定」改为「pnpm-lock 锁定」。
- `README.md` / `WORKSPACE.md` / `CONTRIBUTING.md` / `.action/AGENTS.MD` / `.action/GUIDE.MD` / 两个插件 README：
  命令与结构说明统一改成 pnpm workspace。

---

## [未发布] — `@oblivion/vimc` v0.2.8：落点标记跟随滚动 + 内联引用独立一档 + 上游署名修正

### 修复：落点标记错位（所有者实测「搜『高亮』，黄框出现在『结果』旁边」）

- 根因：标记用**视口坐标**，而 `present()` 是**先画后滚**，滚动（尤其 `smooth` 平滑滚动动画）之后坐标就过期了
- 修法：改成**先滚再画**，并在标记存活期间监听 `scroll`/`resize`（捕获 + rAF 节流）**持续重摆**；
  标记寿命 900ms → 1200ms（覆盖平滑滚动动画）；自检新增 `find.repositions`（重摆次数）
- 参考上游 `dom_ui.ts` 的 `flash_()`：单个活动标记 + 寿命 + 淡出；差别是它把矩形换算成页面坐标
  （`.AbsF`），而 DSH 正文是嵌套滚动容器、不能假定宿主定位上下文，所以用「跟随重摆」替代

### 变更：内联引用单独提一档（排在消息操作按钮之前）

- 三档改为：**① 内联引用 → ② 正文其它（含消息操作按钮）→ ③ 外部按钮**
- 引用的判据（依据所有者截图：悬停内联引用会显示它指向的文件路径）：真链接，或 `title`/`aria-label`
  含 `/`、以 `@` 开头、或以**已知文件扩展名**结尾
- 判据刻意收紧：`aria-label` 带版本号（`v4.1`）的按钮**不会**被误判（曾用「点 + 短串」的宽泛规则，实测误判）
- 自检新增 `hints.referenceSignals`（`link`/`path`/`at`/`ext`，只报信号名、不报属性值）；
  **真机实测**：某一时刻 `references 1 / content 25 / outer 20`、信号 `path` —— 引用确实被提到最前

### 修正：上游许可证写错了

- README「参考与许可」原写 vimium-c 是 MIT —— **实际是 Apache-2.0**（`LICENSE.txt`：Copyright 2023-present Gong Dahan）
- 补上「读了哪个文件、复用了什么理念、哪里故意不一样」的对照表（提示串短在前、`flash_` 落点、
  查找的大小写/`postOnEsc`/反向查找），并注明：本插件是独立实现、**未复制上游代码**；
  若将来直接拷贝上游代码，必须保留 Apache-2.0 声明

验收：`npm test` **42/42**（新增：三条优先级/判据用例 + 滚动跟随重摆用例）；
`dshx check` 全绿；版本 `0.2.6 → 0.2.8`。

---

## [未发布] — `@oblivion/vimc` v0.2.6：`f` 候选优先级 + 查找落点靠上 + 翻页 0.6

### 变更：`f` 的候选按优先级排序，前面的拿单字母（所有者要求）

- 三档：**会话正文里的链接 → 正文里其它元素 → 正文之外（外部按钮，排最后）**，档内仍按「行 → 左」
- 提示串改为**短提示优先**：候选 ≤ 字母表长度时全单字母；更多时前面的拿单字母，其余用
  **被保留首字母**的两位串（`15 个候选 → 10 个单字母 + zd zs za zv ze`），因此**前缀依然无歧义**：
  按 `d` 立即触发，按 `z` 才需要第二个字母；两级放不下时退回统一长度
- 自检新增 `hints.tiers`（三档数量）与 `hints.sampleAttrs`（前几个候选的**属性名**，不含值）
- **实测发现**：DSH 的内联引用是 `button[data-variant]`，**不是 `<a href>`** —— 所以真实页面上
  「正文链接」档为 0、正文元素落在第二档（实测 `content 28 / outer 20`），整体仍排在外部按钮之前

### 变更：查找落点从居中改为「靠上留一点距离」

- 所有者反馈「太靠中了不好看」→ 落点比例由 1/2 改回 **1/4**（像自己那条提问的位置）

### 变更：翻页距离默认 0.6

- 理由（所有者）：输入框占掉一部分可视高度，比例要小一点
- 历史默认（0.9 → 0.7 →）0.6 的**定向迁移**：判据是存储里有没有 v0.2.2 才引入的 `regexFindMode`
  字段；没有 = 那份配置只可能带历史默认值 → 迁移；用户自己改过的值不动

验收：`npm test` **40/40**（新增：多候选时前 10 个单字母 + 前缀无歧义 + 两字母两段触发；
正文链接/正文按钮/外部按钮的优先级与 `hints.tiers`）；`dshx check` 全绿；版本 `0.2.4 → 0.2.6`
（0.2.5 为优先级实现、0.2.6 加 `sampleAttrs` 诊断）。
线上实测：`tiers { links: 0, content: 28, outer: 20 }`、`config.pageRatioVertical 0.6`、
前几个候选全来自正文档。

---

## [未发布] — `@oblivion/vimc` v0.2.4：查找落点「一定看得见」

所有者反馈：`/点击 (1 处)` 跳过去之后**没有高亮该词，不知道落在哪**。逐项查证后改了四处：

- **`::highlight()` 只认长写属性**：原来的 `background:` 简写在某些构建里会被整条丢弃（＝完全没有高亮），
  改为 `background-color:`（`color` 保留）
- **新增落点标记（ping）**：每次跳转在当前命中四周画一圈会淡出的琥珀色框（900ms，`position: fixed` 覆盖层）。
  它**不依赖 Custom Highlight**，所以「高亮不可用 / 命中在折叠内容里」时也一定看得见落点
- **落点从容器 1/3 改到 1/2（居中）**：长回答里更醒目
- **折叠分组里的命中**：DSH 把工具调用收进 `<details>`，文字在 DOM 里但不可见。
  现在跳转先找已渲染的命中；都不渲染就**点开 `<summary>`**（官方开关，React 状态跟着变）展开该组，
  重新定位后再跳 —— 与浏览器原生查找一致（此前会「跳到一个看不见的地方」，正是反馈的现象）
- 自检新增 `find.highlight`（`custom`/`none`）与 `find.pings`（累计标记数），这类问题以后能直接从证据文件判断

验收：`npm test` **39/39**（新增两条：每次跳转都画标记 + 关闭时清理；折叠区命中跳转前先展开）；
`dshx check` 全绿；版本 `0.2.3 → 0.2.4`。
线上实测：`find.highlight = custom`（页面里 Custom Highlight 可用）、`keys.active 17 / turns 3`。

---

## [未发布] — `@oblivion/vimc` v0.2.3：查找条对齐 Vimium 形态（回车后失焦）

按所有者给出的参照（浏览器/Vimium-C 的查找条 `基础 (3 处)`）：

- **紧凑形态**：查找条改为 `[/] 查询 (N 处)`，去掉原来那行长帮助文字（键位改在设置页/README 说明）；
  全部命中浅琥珀、当前命中深琥珀（图四那种橙色高亮）
- **`Enter` = 提交**：跳到下一个之后**收起输入框、焦点回到页面** —— 这样 `,` / `.` 能**立刻**前后跳
  （此前输入框一直持有焦点，`,`/`.` 会被当成普通字符吞掉，这是本轮要修的核心手感）
- **HUD 形态**：提交后查找条变成只读文本（不聚焦），仍显示查询与 `(N 处)`；
  再按 `/` 回到编辑态并**全选**查询；`Esc` 在编辑态与 HUD 形态下都能关闭（查询与命中保留）
- 自检新增 `find.committed`，便于在证据文件里看出当前处于哪种形态

验收：`npm test` **37/37**（查找用例按新形态重写：计数写法、回车后失焦、HUD 只读、`/` 重新编辑并全选、
HUD 形态下 Esc 关闭、`.`/`,` 直接前后跳）；`dshx check` 全绿；版本 `0.2.2 → 0.2.3`（按新规则加第三位）。
线上实测：`openFind=2 · findPrevious=1`（已在真实页面里用过），`keys.active 17 / turns 3`。

---

## [未发布] — `@oblivion/vimc` v0.2.2：页面内查找（`/` `.` `,`）+ 翻页距离 0.7

### 新增：页面内查找（对应 Vimium-C 的 `enterFindMode` / `performFind` / `performBackwardsFind`）

- `/` 打开查找框（带上次查询），**边打边找**并显示 `当前/总数`；`Enter` / `Shift+Enter` 前后跳；
  `Esc` 关闭并把焦点还给打开前的元素（**查询与命中保留**）；关掉后 `.` / `,` 继续前后跳（到端回绕）
- **不侵入 DOM**：命中用 `Range` + **CSS Custom Highlight API**（`::highlight(vimc-find)`），
  不包 `<mark>`、不改文本节点 —— DSH 输入框是 Lexical 宿主，外部动选区会导致状态不同步；
  浏览器不支持该 API 时退化为「只滚动、不高亮」
- 落点放在容器高度的 1/3；查找范围 = 会话正文滚动容器（不搜侧栏）
- 大小写按 Vimium 的**智能大小写**；`regexFindMode`（已从「不采纳」改为**采纳**，所有者那份为 `true`）
  打开时按正则解释，非法正则按无命中处理
- 查找框本身是 `<input>`，插件其它快捷键在框内靠**可编辑区守卫**自动让位（无需额外状态机）

### 变更：翻页距离默认 0.7（0.6–0.8 区间）

- 所有者要求把「平滑滚动的距离」设在 0.6–0.8 之间；Vimium-C 导出里**没有**这一项
  （它只有 `scrollStepSize = 90` 像素步长，本插件已沿用），所以这是本插件自己的选项
- 取值 **0.7**（区间中点）；v0.1 那个「从没被用户改过」的 0.9 会**自动迁移**到 0.7，
  用户真正改过的值原样保留

### 验收证据（本机实测，2026-10-05）

| 项 | 结果 |
| --- | --- |
| `npm test` | **37/37**（新增：查找开关/边打边找/回绕/Esc 后继续/正则/非法正则、翻页比例默认与旧值迁移；原有 34 条在 0.7 口径下全绿） |
| `dshx check`（CLI） / 类型 / 版本一致 | 全绿 / ✅ / `0.2.2` |
| 真实页面自检 | `keys.active 17 / unsupported 0 / errors 0`、`turns 2`、`hints.candidates 46`（命中 605）`/ scanMs 7.5`、`find` 计数与耗时字段就位 |
| 真实使用 | 宿主计数器（截至本轮）：`scrollPageUp 20 · scrollPageDown 22 · linkHints 7 · focusInput 2 · scrollToTop 2 · scrollToBottom 6 · escapeToPage 1` |
| 版本规则 | 本轮按新规则加第三位：`0.2.1 → 0.2.2`（不是 `0.3.0`） |

---

## [未发布] — `@oblivion/vimc` v0.2.1：轮次跳转 + 性能自证与优化 + 版本规则变更

### 新增：轮次跳转（`[` / `]`）

- 按 `[` 跳到**上一条提问**、`]` 跳到**下一条提问**，落点与 DSH 右侧轮次导航条一致 ——
  用的是**同一批官方锚点** `ui-chat` 的 `[data-chat-turn]`（不依赖任何 class 名或组件内部结构）
- 语义照所有者描述：**读到回答中间按一次回到本轮提问；已在提问顶部再按一次继续往上**；
  已在最上面那条时**不动作也不吞键**（往上滚仍交给 `w`/`W`）
- 落点贴容器顶 + 2px，并对目标做 700ms 描边（用完还原行内样式）
- 边界：DSH 会话分页加载，跳转只覆盖已加载轮次（滚到顶会触发它自己的分页，再按即可继续）

### 新增：插件自身开销的**可观测**证据

- `oblivionVimc.probe().perf` / `hints.{matched,candidates,scanMs,sessions}`：按键处理耗时与候选扫描漏斗
- **每条命令心跳都带 `perf`**：真实页面里按几下就能看到实测延迟（设置页也直接列成表格）
- 设置页「运行只读自检」新增：已加载轮次数、选择器命中数、扫描耗时、按键耗时（平均/峰值/采样数）

### 变更：性能（实测 111.8ms → 11.2ms）

第一版在真机上量到候选扫描 **111.8ms**，逐项拆开后修掉四处：

| 优化 | 原因 |
| --- | --- |
| `checkVisibility()` 快路径替代 `getComputedStyle` | DSH 样式表极大，逐元素读计算样式在真机上是毫秒级；`checkVisibility()` 是引擎内部一次判定 |
| 一次 `closest()` 替代两次祖先遍历 | 排除浮层与 `aria-hidden` 子树 |
| 每个元素只读一次矩形，样式只给幸存者 | 筛序改成「便宜的在前」 |
| 挂载自检跳过扫描 | 挂载那刻外壳未渲染完，扫描没用且白花时间（交给 1.5s 后的自检） |

另外把按键路径**按开销重排**：先做纯计算（比对 ≤14 条键位），**没命中就立刻返回**，
只有命中命令时才问 DOM 焦点 —— 于是最常见的「在输入框里打字」一次 DOM 查询都不做。
宿主侧心跳落盘也从「每条一次同步写」改为**750ms 合并窗口**（该项需重启 App 生效）。

### 变更：版本规则（所有者 2026-10-05 裁定）

- 任何新版本线从 **`0.0.1`** 起步；**已有版本号不回改**；此后**每次只加第三位**（patch）
- 第二位/第一位**只在明确要求时**动：`--minor` / `--major`；位置参数写 `minor` 会被脚本拒绝
- 规则落点：[`.action/AGENTS.MD`](.action/AGENTS.MD)（规范）+ 本文件开头 + 插件 `scripts/bump-version.mjs`
- 本轮按新规则：`@oblivion/vimc` `0.2.0 → 0.2.1`（不是 `0.3.0`）

### 验收证据（本机实测，2026-10-05）

| 项 | 结果 |
| --- | --- |
| `npm test` | **34/34**（新增：轮次跳转 4 条语义/边界、性能字段 1 条、快捷路径重排后原有用例全绿） |
| `dshx check`（CLI） / 类型 / 版本一致 | 全绿 / ✅ / `0.2.1` |
| 扫描耗时（真机） | **11.2ms**（选择器命中 1220 → 视口候选 42）；优化前同页 **111.8ms** |
| 按键耗时（真机，重排前样本） | 平均 **1.825ms** / 峰值 **3ms**（4 次采样）；重排后打字路径不再做 DOM 查询 |
| 真实使用 | 宿主计数器：`scrollPageUp 18 · scrollPageDown 21 · linkHints 7 · focusInput 2 · scrollToTop 2 · scrollToBottom 5 · escapeToPage 1` |
| 真实页面锚点 | 竖向容器 `div[data-conversation-scroll]`、输入框 `div[data-composer-input]`、已加载轮次 **3**、`keys.active 14` |

---



按所有者要求，把插件从「几个固定快捷键」升级为「Vimium-C 语义的可配置层」，并提供设置页面。

### 新增：链接提示（`f` → `LinkHints.activate`）

- 视口内可点击元素浮出琥珀色字母标签；候选 ≤ 字母表长度时**每个 1 个字母**，更多时**全部 2 个字母**
  （统一长度，避免「`d` 与 `da` 并存」的前缀歧义）
- 字母表取 `linkHintCharacters`（默认 `dsavewrqcxz`），按「行 → 左」分配（顺序即优先级）
- 触发时依次派发 `pointerdown → mousedown → pointerup → mouseup → click`（React `onMouseDown`/`onClick`
  与 `<a href>` 默认跳转都能生效）；`Esc` 或字母表之外的键取消；浮层随滚动/缩放重排；不注入常驻 DOM

### 新增：DSH 设置页（`settings.section`，id `oblivion-vimc`，order 46）

七块：启用与版本 / 键位文本（Vimium `map`·`run` 语法，含生效键位与**未接管命令逐条理由**）/ 滚动
（平滑、翻页比例、`scrollStepSize`）/ 输入框（`Esc` 退出、编辑中允许翻页、选区模式、优先选择器）/
链接提示（字母表、就地试跑）/ 兼容导入（选文件或粘贴 JSON，显示已采纳·未采纳报告）/ 排除规则与只读自检。

### 新增：Vimium-C 兼容层（`src/client/vimium.ts`）

- **键位解析**：`map` / `run` 文本（含续行 `\`、`#` 注释、`unmapAll`）、修饰键写法 `<a-t>`/`<c-up>`、
  命名键 `<backspace>`/`<left>`/`<f1>`、标点键、`run <键> <另一个键>` 的单层别名（`run q i` → `focusInput`）
- **命令映射**：`scrollPageUp/Down`、`scrollUp/Down/Left/Right`、`scrollPx*`、`scrollToTop/Bottom`、`focusInput`、
  `LinkHints.activate`、`goBack`/`goForward`；其余（标签页 / Vomnibar / 查找 / Marks / 剪贴板 / 下载 /
  序列键 / `reload` / `goUp`…）**逐条列出并给出不适用理由**，绝不静默忽略
- **选项导入**：`keyMappings`、`linkHintCharacters`、`scrollStepSize`、`keyLayout`→`ignoreKeyboardLayout`、
  `smoothScroll`、`exclusionRules[].pattern`→`exclusions`、`focusInput` 的 `o.select`/`o.prefer`
  （`o.prefer` 追加在本插件默认 `[data-composer-input]` 之后）；导入报告含「已采纳 / 未采纳 / 源信息」
- 键位文本进入设置页后**内置默认不再硬编码**：`DEFAULT_KEY_MAPPINGS` 就是一段 `map` 文本，与用户文本走同一条解析路径

### 变更（破坏性：键位语义）

- **`a`/`d` 改为像素步进**（Vimium 语义：`scrollLeft`/`scrollRight` = `scrollStepSize` 像素，实测导出值 90），
  不再是「一屏」；要一屏请调大 `scrollStepSize`
- **`Esc` 退出输入框默认开启**（`i` 进去之后必须能原路退出）；有菜单/弹窗打开时让位
- 新增 `Ctrl+↑↓←→` → 像素级竖向/横向步进（与导出配置一致）

### 验收证据（本机实测，2026-10-05）

| 项 | 结果 |
| --- | --- |
| `dshx check`（CLI） | **全绿**（新增 `client-inject` 检查通过） |
| 构建 / 类型 / 版本一致 | ✅ / ✅ / `0.2.0` |
| `npm test` | **31/31**（含**真实 `vimium_c-20251214_001720.json` 的导入断言**：`linkHintCharacters=dsavewrqcxz`、`scrollStepSize=90`、`keyLayout=0`→按字符匹配、排除规则、`o.prefer` 合并、`w/s/a/d/W/S/f/i/q` 全部解析出命令、未支持命令逐条有理由） |
| 客户端半边在真实页面运行 | `client-beat.json`：`clientVersion 0.2.0`、UA `@deepseek-ai/dsh-desktop/0.2.0-rc.2 … Electron/44.0.0` |
| **真实按键已被处理** | 宿主计数器：`scrollPageUp 9 · scrollPageDown 7 · focusInput 2 · scrollToTop 1 · scrollToBottom 1` |
| 真实页面自检 | `keys.active 12 / unsupported 0 / errors 0`、`hints.characters dsavewrqcxz`、视口内可点击元素 155 个、竖向容器 `div[data-conversation-scroll]` |
| 设置页在线 | `Slots` 只读查询：`settings.section` 占用者含 `{ registrant: "@oblivion/vimc-client", id: "oblivion-vimc", order: 46, active: true }` |

---



### 新增：`@oblivion/vimc` v0.1.0（`oblivion-vimc/`）

第二个已落地的 `@oblivion/*` 插件（不在设计书 §9.1 的 8 项能力清单内，是按所有者需求新增的**交互工具类**插件）。

- **键位**（照搬需求里给出的 Vimium-C 自定义配置）：`w/s` 上/下翻页、`a/d` 左/右移屏、
  `W/S` 到顶/到底、`i` 聚焦输入框；`Esc` 退出输入框（默认关）。
- **核心约束**：焦点在输入框 / 终端里时**一个键都不接管**（`contenteditable` 的 Lexical 宿主、
  `input`、`textarea`、`select`、`[role=textbox]`、`.xterm` 全部识别）；`Ctrl/Alt/Meta`、
  IME 组合期、已被 `preventDefault` 的事件一律放行；**没找到可滚容器时不吞键**。
- **滚动目标发现**：视口中心探测 → DSH 正文滚动区 `[data-conversation-scroll]` → 上次容器 → 根滚动元素。
  弹窗打开时自然滚弹窗；横向轴会先滚宽代码块/表格/终端块自己的横向条。
- **为什么不走 `ctx.shortcuts`**：桌面端 Windows/macOS 的原生键盘桥会**先于**本地处理拦截已接受的组合键，
  且 `ShortcutRegistry.dispatch()` 在 priority 为真时跳过 region 判定 —— 注册裸字母会让用户在输入框里
  打不出 `w/s/a/d/i`。故改为页面级 keydown + 自判焦点区域（与 Vimium 同类做法）。详见插件 README 第三节。
- **宿主半边**：启动标记、卸载自证、`POST /oblivion-vimc/beat` 诊断路由（限长 8 KiB + 来源校验）。

### 验收证据（本机实测，2026-10-05）

| 项 | 结果 |
| --- | --- |
| `dshx check`（CLI） | **全绿**（manifest / `export apply` / 无默认导出 / boot-marker / cordis overlay 可移植 / `dsh.client.platform=web` / 构建产物存在） |
| 构建与类型 | `npm run build` ✅、`npm run typecheck` ✅ |
| 行为测试 | `npm test` → **20/20**（对构建产物 `lib/client.js` 派发真实 `KeyboardEvent`） |
| 宿主半边挂载 | `%TEMP%\oblivion-vimc\host-mount.json`（DSH 宿主自身写入，pid 24220 / node 24.18.1） |
| 客户端半边挂载 | `client-beat.json`：UA 为 `@deepseek-ai/dsh-desktop/0.2.0-rc.2 …Electron/44.0.0` |
| 真实页面锚点自检 | `div[data-conversation-scroll]`（可滚 range 随会话增长，实测 1824 → 2157px）、`div[data-composer-input]`（命中优先选择器） |
| 挂载方式 | profile `link:` 依赖 + `cordis.patch.yml` 插入行，**无需重启应用**（补丁落盘同一秒宿主即装载） |

### 记录：两条本机环境事实（已写入 `WORKSPACE.md`）

- **DSHX 的 MCP 工具面在本机全废**：`dshx check` / `activate-new-client` / `verify-boot` / `browser open`
  都先跑 `dshx creator claim`，而 claim 依赖 POSIX `ps -o lstart=` → 恒报
  `Creator+ Host identity is incomplete`。**但 `dshx` CLI 的 `check` 子命令可用**（本轮即用它取得源码契约证据）。
- **宿主半边的代码改动需要重启 DSH App**：Host 复用 ESM 缓存里的同一模块命名空间，禁用再启用不会重新导入；
  浏览器半边不受此限（改完 `npm run build` + 触发一次补丁重算即可自动重挂）。

### 记录：产品版本递增工具缺失

本轮**未改动根 `VERSION`（0.0.2）**：本文件与 `.action/AGENTS.MD` 都引用 `scripts/bump-version.ps1`，
但仓库根**没有** `scripts/` 目录（只有 `oblivion-brand/scripts/bump-version.mjs`）。产品版本的递增工具待补，
补上之前产品版本无法按规范递增。

---

## [0.0.2] — Phase 5 问答闭环落地 + README 三条主线

### 新增：问答闭环（`oblivion-qa-loop`）

- **四层筛选**（L1–L4）：
  - L1 精确去重：`SHA256(question+answer)`，in-memory `Set` 跨会话去重
  - L2 语义去重：首版无向量后端，跳过（配置字段留位）
  - L3 规则过滤：答案 <5 字 / 拒绝模式（`不知道`等）/ 纯寒暄多词匹配
  - L4 价值评估：`^好的?$` `^收到?$` `^嗯+$`（防御性保险，实际被 L3 先拦截）
- **事件链路**：`chat/send` → `session:complete` → qa-loop → `knowledge:created`
- **RISK-117 防回灌**：注入条目打 `source_type: qa_loop` 标记，已在知识层过滤链里消费

### 新增：核心认知·思维激荡（`oblivion-perspective`）

- `elaborate()` 服务：主动触发（每次回答末尾追加视角）与深度触发（用户明确要求）
- 闸门逻辑：深度触发在「思考中」状态时不阻塞主对话；主动触发由调用方驱动

### 变更：`oblivion-core` 通信增强

- `web-handlers.ts` 的 `createChatHandlers` 新增可选 `emit` 参数，`chat/send` 完成后发射 `session:complete`
- `cli.ts` 透传 `booted.ctx.events.emit` 到 handler 工厂

### 变更：README 重写概览节

- 插入三条主线（知识自动生长 / 可编程组合 / 长期可维护）
- 一行概括：一个内核 + 三种部署形态 + 五项核心认知能力 + 三层 UI 设计 + 一套发布工程学
- 「现状」节补充 Phase 5 落地状态说明

### 门禁

- 测试 **901 → 912**（+11 条 qa-loop 专项测试：沉淀路径、L1 去重、L3 短答案、拒绝模式、寒暄、异常隔离、非空引用、标题截断）

---

## [未发布] — Web 形态可构建可服务 + 188 图标 + 退役 .alpha

### 新增：Web 形态（pnpm/npm 之外的第一个「可交付产物」）

- **`scripts/build-web.mjs`**：用 **esbuild** 把 `oblivion-web-ui/src/app/main.tsx` 打成
  `.build/web/{index.html,app.js,app.js.map,build-manifest.json}`
  - **令牌 CSS 在构建期内联进 `index.html` 的 `<head>`，且在 `<script>` 之前** ——
    这是 §3.4 的无闪烁要求：先亮后暗/先大后小都源于把令牌放到运行时注入
  - CSS 从**构建产物**（`lib/index.js` 的 `renderEarlyInjectionCss`）取，
    因此页面上的令牌与 `--dump-config`、测试看到的令牌**同源**
  - `build-manifest.json` 记录版本、文件与字节数、**令牌数（427）**、入口
  - `--build/` 已在 `.gitignore`（与 `/build/` 分开：一个是要交付的产物，一个是临时目录）
  - ⚠️ **生成产物必须同时进 `.prettierignore`**：否则 `prettier --write .` 会改写它，
    让 `tokens:check` / `icons:check` 立刻报「产物已过期」—— 同一个坑在令牌表上踩过一次，图标表上又踩了一次
- **`oblivion-core/src/serve.ts`**：静态服务 + `/healthz` + `/metrics`
  - 这补上了 TODO 里记的缺口：「prometheus.yml 抓 127.0.0.1:42081/metrics，但该端点尚不存在」
  - **路径穿越防御**（原始与百分号编码两种写法），默认只绑 127.0.0.1
  - `close()` 里同时调用 `closeIdleConnections()` —— 否则 keep-alive 会让进程关不掉
  - 指标：`oblivion_web_ready` / `oblivion_web_build_info` / `oblivion_http_requests_total`
    （**服务自身**指标；§26.2 的业务指标由各自的插件提供）
- **CLI**：`web` 新增 `--port`（默认 42081，占用时自动改随机端口）与 `--web-dir`；
  服务在**内核就绪之后**启动，并与内核共享同一条退出链（`RunProfileOptions.shutdownTargets`）
- **帧层的真 bug（React 接入才暴露）**：`createLayoutStore()` 的快照每次调用都新建对象 ——
  `useSyncExternalStore` 会判定「一直在变」并无限重渲染。已改为**变更时才重建的快照**

### 新增：188 个图标字形（Phase 4c）

- **`scripts/generate-ui-icons.mjs`**：从证据包
  `@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2` 的 `lib/index.js` **机械提取几何**，
  并与 `lib/types/icons/index.d.ts` 的导出清单**交叉核对**；对不上就拒绝产出
- 实测：**94 字形 / 188 导出 / 95 条声明**（多出的 `ChatLinesOutline` 是不被直接导出的共享基座，
  被 `QueueOutline` 转发，产出时已内联）；`ICON_REGULAR_STROKE 1` / `ICON_MEDIUM_STROKE 1.3`
- 提取过程踩到并修好的四个坑（都由对账或测试抓出）：
  1. **五种声明形态**（常规/纯填充/两种转发/块体）—— 只认一种会静默少 4 个字形；
  2. **默认尺寸不止 16**（还有 10 / 14 / 20）—— 写死 16 会让一票图标偏大偏小；
  3. **节点必须递归**：94 个里 **75 个**含嵌套 `children`（mask / g），拍平会让 mask 变空、
     子节点跑到根上 —— 不报错，只是画错；
  4. **模板字符串要跳过**：其中的花括号会打乱括号配对计数
- `Icon.ts` 手写渲染器：两档共用几何、`useId()` **无条件调用**（遮罩 id 必须每实例唯一）、
  运行期解析 `{id}` 与 `{strokeWidth+N}` 占位符（静态数据表达不了）

### 变更：`.alpha/` 退役，结构契约入库

- **删除 `.alpha/`**（alphα 模板的本机元数据：`manifest.json` + sources + templates + alpha-init 工具）——
  产品侧对它**零依赖**；唯一的实际用途是给 `structure-contract.test.mjs` 提供结构契约
- **新增入库的 `structure.contract.json`** 取代那份本机 manifest。这是一次**加强**而不是妥协：
  原契约在本机目录缺失时**整段跳过**（新克隆/无模板环境下守卫自行消失），
  迁入入库契约后那条检查在任何环境都必然运行（34 条断言）
- `.gitignore` 保留 `/.alpha/` 并注明退役原因：模板目录若再次出现，仍然不该入库

### 门禁

- 测试 **638 → 645**；新增 `tests/integration/web-build.test.mjs`（6 条：无闪烁、令牌同源、
  产物清单、服务可用性、穿越防御、附加指标）与 `tests/unit/ui-icons.test.mjs`（11 条）
- CI 增补 `Build web bundle` 步骤 —— 否则「带界面的 Web 版本」会一直只是本机能跑的东西

---

## [未发布] — Phase 4c · UI 组件层（第一批）

> Phase 4 的第三个子阶段。本批交付**组件层的基础设施 + 29 个组件**，
> 并把 COMPONENTS.MD 的四条纪律变成**机器检查**而不是自觉。

### 新增：React 接线

- **React 19 接入**：`react` / `react-dom` / `@types/react` / `@types/react-dom` 进根 `devDependencies`；
  `oblivion-web-ui` 把它们声明为 **`peerDependencies`** —— 宿主提供**单实例** React，
  这与 §9.2「跨包依赖走 peerDependencies」同一条口径
- **依赖本体不入库**：`node_modules/` 继续整体忽略（含 React 源码），仓库只保留
  `package.json`（依赖是什么）与 `package-lock.json`（确切版本与完整性哈希）。
  新克隆 `npm ci` 即自动安装 React；`.gitignore` 里记下了这条决策
- 该包 `tsconfig` 增补 `jsx: react-jsx` 与 `lib: ES2022 + DOM` —— DOM 只给这一个
  **浏览器侧**包，其余包仍是纯 Node

### 新增：29 个组件

| 分组           | 组件                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 基础控件（12） | `Button` `Input` `Checkbox` `Switch` `SegmentedControl` `SegmentedTabs` `Pill` `Tag` `DisclosureRow` `PathLabel` `StateDot` `TextShimmer` |
| 浮层（8）      | `Tooltip` `Modal` `RiskConfirmation` `Toast` `ShortcutKeys` `MenuSurface` `MenuItemButton` `MenuGroup`                                    |
| 反馈（1）      | `ConnectionIndicator`                                                                                                                     |
| 品牌（2）      | `PolarisLogo`（+ `POLARIS_PATH`）、`BrandWordmark`                                                                                        |
| 内容块（6）    | `CodeBlock` `ReadBlock` `DiffBlock` `SearchBlock` `TerminalBlock` `JsonBlock`                                                             |

- **`lib/contracts.ts`**：§7 的全部固化常量集中一处（16 行截断 ×4、Toast 3000ms、Button 36/12 与 28/8、
  24px 过程行、Tooltip gap 8 与延迟 0/0、HoverCard 500ms、StateDot 五态默认尺寸、图标描边 1 / 1.3），
  外加五个命名字段的**封闭集合**
- **`lib/tokens.ts`**：`tok()` / `px()` / `ms()` —— 刻意**不提供带兜底值的 tok**，
  否则硬编码会以「兜底」的名义回来
- **可访问性写在契约里**：`Modal` 的 `headless` 可辨识联合（非 headless 必须给 `closeLabel`）、
  `data-modal-autofocus` 代替 `autoFocus`、`SegmentedControl` 的 `id` → `id-value` / `id-value-panel` 映射、
  `StateDot` 的 `aria-hidden`、`RiskConfirmation` 的「未确认则锁住确认按钮」

### 新增：把纪律变成断言（38 条测试）

- **机械守卫**：Cordis-free、只用 `--obl-*` 令牌（注释与品牌资产除外）、文案不写死（CJK 扫描）、不 import `oblivion-*`
- **固化常量**：逐条与 §7 对账；`StateDot` 里 `ongoing=14` 而其余为 10 的不对称被显式断言
- **渲染契约**：用 `react-dom/server` 做**无头**渲染（仓库没有浏览器，组件是纯展示原语，
  其契约本来就该在标记层可断言），覆盖像素尺寸、a11y 属性、**16 行截断**、**无文案席位时不渲染截断说明**
- **品牌几何防漂移**：`src/brand/polaris.ts` 与 `assets/brand/polaris-path.ts` 逐字比对

### 测试抓到的一类真 bug

过渡时长最初被写成 `px(120)`。**这类错误不会报错**——浏览器直接丢掉非法声明，
动画静默失效。现在 `ms()` 与 `px()` 是两个函数，7 个组件里的时长全部改走 `ms()`，
并加了「慢脉冲 1.5s」这一共享常量（TextShimmer / DisclosureRow running / StateDot 都是它）。

### 两处刻意的实现偏离

1. **内联 `style` + `var(--obl-*)`，而非参考实现的 CSS Modules** —— 后者需要打包器，
   而仓库目前没有；迁移时变的是样式承载方式，**令牌契约不变**。
2. **浮层只做呈现、不做定位** —— 锚点定位需要 DOM 与滚动观测，属后续批次。

---

## [未发布] — Phase 4a · UI 令牌层

> 设计书 §18 Phase 4 的第二个子阶段。产出是 `oblivion-web-ui` 的样式基础：
> **427 个令牌**、2 个用户旋钮、8 档排版刻度与无闪烁早期注入。

### 新增

- **`scripts/generate-ui-tokens.mjs`**：从证据快照（`versions/<ver>/ui-tokens.md`，
  36290 B / SHA256 记录在产物头部）**生成** 427 个令牌的逐值表，并把旧前缀族
  （`--dsw-` / `--dsh-` / `--ds-` / `--shiki-`）统一改名到 `--obl-*`。
  `npm run tokens:generate` / `tokens:check`
- **`theme/tokens.generated.ts`**：机械解析结果与文档账目**逐节吻合** ——
  11 节 / 427 行 / ① 77 + ② 107 + ③ 243，含 `Component level` 8 个属 ③ 子集的澄清（`ERRATA-16`）
- **`theme/settings.ts`**：`THEME_PREFERENCES` / `FONT_SIZE_MIN 10` / `MAX 22` / `DEFAULT 14` /
  `DEFAULT_PREFERENCE 'system'` / 命名空间 `ui-theme`，以及**同时充当持久化 schema、wire 校验与默认值来源**的
  `ThemeSettingsSchema`（按 Standard Schema 形状实现，不引入依赖）
- **`theme/scale.ts`**：8 档刻度（`48 + 30 + 2 + 102 = 182` 的账目落成断言）、
  `fontDeltaExpression()`、`secondarySizeExpression()`（`ERRATA-19` 的修正公式）、
  markdown 17 个样式位、`strongTokenOf()`（`-strong` 在数字之前，`ERRATA-47`）
- **`theme/css.ts`**：令牌 → CSS。调色板落 `:root`、参与主题切换的落 `body`、
  深色落 `body[data-ob-dark-theme]`、darwin 落 `html[data-platform='darwin'] body`（权重更高）；
  外加 §6.1 焦点环、§7 的 `@supports` 超椭圆圆角，以及 `renderEarlyInjectionCss()` 的**无闪烁**载荷
- **两处显式偏离机制**：`TOKEN_CORRECTIONS`（`ERRATA-19`）与 `SCOPED_TOKENS`（`ERRATA-46`）——
  生成产物保持对证据的忠实，修正集中在一处，可分别核对
- **测试 579 → 599**：账目闭合、改名彻底、`m-18` 陷阱、`ERRATA-19` 公式、深色/darwin 结构、
  限定作用域、无闪烁三态、宿主属性解析

### 发现并登记（`.design/ERRATA-v4.0.1-draft.md` §N）

| ID          | 发现                                                                                                                             | 影响                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `ERRATA-45` | §2.1 称调色板「明暗主题完全相同」，但 77 个里有 **1 个**不同（`static-neutral-bluish-60`）                                       | 「新主题只需动 alias 层」不是无条件成立；实现侧把反例清单**算出来**而非写死     |
| `ERRATA-46` | §6.1 的焦点环规则依赖 `--obl-focus-ring-color` **未被定义**才回落到 business-primary，而逐值表把它记在基值层且值是 `transparent` | 按「全量注入基值层」实现会让**键盘焦点环永远不可见**且无报错 → 改为指针模态覆盖 |
| `ERRATA-47` | strong 变体命名是 `--obl-font-<name>-strong-<n>`（`-strong` 在数字**之前**）                                                     | 按「基础名 + `-strong`」拼接会得到不存在的令牌，CSS 拼错静默失效                |

> 三条都是**把令牌真正渲染成 CSS 才会暴露**的问题：纸面上读不出来。

---

## [未发布] — Phase 4b · UI 帧层

> 设计书 §18 的 Phase 4 已按裁定拆成 **4a 令牌层 / 4b 帧层 / 4c 组件层**。
> 先做 4b 的理由：它是**纯 TypeScript**（几何、偏好、槽位、tab 注册），不依赖 React，
> 因此可以不引入新依赖就落地，并被测试逐条钉死。

### 新增

- **`layout/columns.ts`**：九个几何常量（`CENTER_MIN 400` / `SIDEBAR_* 264·420·280·56·1024` /
  `RIGHTBAR_MIN 300` / `RIGHTBAR_MAX_RATIO 0.7` / `RIGHTBAR_DEFAULT_RATIO 0.45`）、
  `clampWidth()`、`defaultRightbarWidth()` 与 `computeColumns()`
- **让步顺序照字面实现**：右栏先收缩 → 再丢轨道 → 中央才允许低于 `CENTER_MIN`；**左栏不让步**。
  响应式折叠（<1024 自动塌成 56px 图标轨、窄屏覆盖位展开）并入同一个纯函数，
  因此「几何」只有一处真源
- **`layout/stores.ts`**：`createLayoutStore()` —— `LayoutInfo` 8 个既有字段 + **新增偏好 `rightbarOpen`**
  （`OPEN-LAYOUT-03` ② 的落地前提；原 `LayoutInfo` 不含它）。两条语义相反的偏好规则各有一条回归用例：
  **左栏关闭即遗忘拖拽宽度**、**右栏跨 resize / close 保留 px 偏好**
- **`layout/service.ts`**：`ILayout` 服务面，含 `beginNavigation()` 的 AbortSignal 纪律
  （下一次导航 abort 上一次，layout 卸载也 abort），并补上 §4.2 明记的缺口 `setRightbarOpen`
- **`slots.ts`**：槽位地图 root 5 + 左栏 7 + 右栏 5 = **17**，配一个最小注册器
  （声明即独占渲染权、`single` 重复即抛、`keyed`/`list` 按键去重）
- **`tab-registry.ts`**：右栏 tab 类型注册 —— 三优先级带（`extension` > `builtin` > `fallback`）、
  glob 地址识别（含 `:` 的模式匹配整个地址，这是对 VS Code 规则的唯一本地改动）、
  `canOpen` 否决权、**thunk 标题每次重读**
- **测试 537 → 579**：几何常量与让步顺序、两条相反的偏好规则、
  「响应式让步不回写偏好」、§7「先折叠左栏右栏才开得出来」、槽位账目与注册器、tab 解析优先级

### 刻意不做

- **不实现完整的 `ctx.slots` 注入机制**：`.memory/TODO.md` §E④ 把它列为 Phase 4 的关键未知，
  本包只承诺有证据支撑的那部分语义（声明表 + 注册器）
- **不接 React**：4c 组件层需要它；帧层不碰 DOM 是设计约束（COMPONENTS.MD §1 的四条纪律）

---

## [未发布] — Phase 1 · 内核可加载插件

> 设计书 §18 的 **Phase 1**：`oblivion-core` 从契约骨架变为真正的内核。
> 交付门禁是「`--dump-config` 能导出组合树」，且 `typecheck` / `lint` / 测试全绿。

### 新增

- **六层 Patch 引擎**（`src/patch/`）：① 空根 → ② Bundle → ③ 用户层 → ④ Home 层 →
  ⑤′ 项目层 → ⑤ `--patch` 覆盖。实现的两条关键语义来自 §13.3：
  **`patch` 替换整段 `config`（不是深合并）**、**行顺序不携带加载语义**
- **`!!js` 条件加载与 `${env:...}` 插值**：自定义 js-yaml Type，把 `!!js` 解析成
  **未求值的表达式对象**而不是立刻执行 —— 这样 `--dump-config` 能在不启动插件的前提下
  求值 `disabled` 并把表达式原样打印回去（可再次作为输入）。求值失败时保守地「不加载」并留警告
- **来源链**（§13.4）：每行记录「谁插入了它、后来哪几层改写过它」，`--dump-config` 输出可直接回答
  「这个值是哪来的」
- **启动链**（`src/profile/`）：`composeProfile()` → 重写空根 `cordis.yml` → `boot()` → 有界退出。
  「有界」= 正常卸载与 5 秒超时赛跑，超时强制结束
- **配置导出**（`src/dump/`）：`--dump-config` / `--dump-config-schema` / `--dump-config-default`，
  `--json` 可切换格式。**schema 不完整时降级为组合树并以 0 退出**（§7.3 / RISK-109；参考架构此处是 exit=1）
- **CLI**（`apps/cli/oblivion.mjs` + `oblivion-core/src/cli.ts`）：`web` / `init` / 三个 dump 命令 /
  `--profile` / `--patch` / `--home` / `--root` / `--version` / `--help`
- **网络暴露护栏**：`--host 0.0.0.0` 默认被 CLI 拒绝，必须显式 `--allow-network-exposure`，
  且必须同时给出至少一个 `--trusted-host`（§14.4 / PF-19 / RISK-118 应对③）
- **`oblivion.profile.bundles`**：根 `package.json` 显式声明 26 个 bundle 的叠加顺序；
  未声明时按目录名字典序兜底并告警（兜底是猜测，不该长期依赖）
- **测试 478 → 536**：patch 引擎（层序 / 替换语义 / `!!js` / 来源链 / 降级）、有界退出、
  CLI 端到端、真实仓库组合集成

### 变更

- `oblivion-core` 的 `dependencies` 从空变为 `{ "js-yaml": "^4.3.2" }` —— 按 §9.2 的口径，
  **跨包（插件间）依赖走 `peerDependencies`，第三方库才进 `dependencies`**。
  对应的结构测试从「dependencies 必须为空」改为「白名单 + 禁止 `oblivion-*`」
- `npm test` 增加 `pretest`（先 `npm run build`），使测试始终跑在最新构建产物上
- `README.md` / `packages/oblivion-core/README.md` / `docs/快速开始.md` 同步 Phase 1 现状

### 已知遗留（不属于 Phase 1 的验收范围）

- `profiles/web/cordis.patch.yml` 改写的 `webserver` / `web-app` 两行**在 Oblivion 里不存在**
  （它们是参考架构的行）。合成时被记为**警告**而不是崩溃 —— 这正是降级姿态要暴露的事实
- 26 个行里 13 个处于 `pending`（`inject` 的服务尚无提供者），属预期：服务由后续阶段引入
- 右栏内容清单、Profile 的行集合仍待产品裁定（`OPEN-111` / §11.2）

---

## [0.0.1] — 2026-10-02 · 起点基线

> **这是 Oblivion 的真正起点。** 孤儿分支 `alpha-init` 的根提交 `e6289d525` 是模板骨架，
> `0.0.1` 把目录结构对齐到设计书 §10，让 26 个能力包的契约就位，并把仓库边界划清。

### 新增

- **版本基线**：`VERSION` = `0.0.1`（单一真源）；根 `package.json`、26 个能力包、
  `registry.json` 与 `oblivion-core` 源码常量全部同步，由测试钉死一致性
- **25 个能力包**（与既有 `oblivion-core` 合计 26 个）—— 每个含
  `package.json` / `tsconfig.json` / `src/index.ts` / `cordis.patch.yml` / `README.md`：
  `oblivion-desktop-host`、`oblivion-adapter-{obsidian,dsh}`、
  `oblivion-llm-{deepseek,openai,ollama}`、`oblivion-session{,-sqlite}`、
  `oblivion-knowledge{,-sqlite,-vector}`、`oblivion-tool-{web-search,file,doc-parse}`、
  `oblivion-{qa-loop,perspective,graph-growth,feedback,content-creator}`、
  `oblivion-web-ui`、`oblivion-tray`、`oblivion-plugin-manager`、`oblivion-updater`、
  `oblivion-dump-config`、`oblivion-telemetry`
- **`apps/electron/`**：Electron 宿主壳骨架 —— `src/{main,preload,ipc}.ts`、
  `renderer/`（欢迎页 + 强制更新页）、`resources/runtime/`、`electron-builder.yml`。
  `renderer/` **不含业务 UI**：主界面归 `oblivion-web-ui`，否则 CLI 形态永远拿不到界面
- **`assets/brand/`**：北极星资产。**几何真源是 `generate-brand-assets.py`**，
  一次产出 `polaris-path.ts` / `polaris.svg` / 5 档 PNG / `.ico` / `.icns` / 品牌规范
- **`registry.json`**：插件清单（26 条），npm 内嵌，零托管成本
- **`pnpm-workspace.yaml`**：对齐设计书 §10 的目录契约
- **`.design/`**：设计书 Baseline 与勘误清单（Draft）—— 架构决策与使用说明分家，且**不入库**
- **`docs/`**：新增《快速开始》《插件开发指南》《目录结构说明》，删除模板残留
- **`CHANGELOG.md`**（本文件）、`VERSION`、`npm run version:bump` / `npm run brand:generate`

### 移除

- **`.docs/` 目录**：alphα 模板本就标注它「已废弃」（`.action/GUIDE.MD`：全项目只保留
  `docs/` 一个文档目录）。其唯一文件 `DESIGN.MD` 并入 `.design/`，空目录删除
- **`docs/README.md`**：与顶层 `README.md` 重复。`docs/` 不再有索引文件 ——
  入口只有一个，两边不会不同步
- **Docker 支持**：`docker/`、`.dockerignore`、`profiles/docker/`、CI 的 docker job。
  首版范围是**单机自用**（设计书 §0.5），且 §22 自己就指出「`-p 42081:42081` 单独使用不成立」——
  在没有真实容器部署需求前，维护一套跑不通的配置只会误导人。需要时按 §22 两条路径重做
- **本机协作层移出版本控制**：`.action/` `.alpha/` `.memory/` `.skills/` `.cache/` `.design/`
  改为 `.gitignore` 忽略（**磁盘保留**）。它们随个人与机器而异，入库只制造冲突。
  ⚠️ **`.github/` 明确保留入库** —— 忽略它会让 CI 静默失效（设计书 RISK-120）
- **weknora 痕迹**：移除 `weknora` remote 与 `legacy/weknora-main` 备份分支
  （其提交 `887e64920` 仍可从 `feature/sync-md` 到达，无信息丢失）。
  不再在 WeKnora 基础上 fork 修改

### 变更

- **`tsconfig.base.json`**：把 `declarationDir` 下放到各包 `tsconfig.json`。
  写在 base 里会按 base 所在目录解析，`.d.ts` 全落到仓库根 `lib/`，
  与各包 `exports.types` 指向的 `lib/types/` 完全不符（ERRATA-09）
- **根 `tsconfig.json`** references 从 1 项扩到 26 项
- **`docs/design/` → `.design/`**：使用说明与架构决策分家，`docs/` 只留「怎么用」。
  随后 `.design/` 一并划入本地协作层（不入库）—— 设计文档是**决策依据**而非**项目产物**。
  `.docs/DESIGN.MD`（UI 设计）**已并入** `.design/`，设计文档不再分散在两处
- **`.alpha/manifest.json`**：移除 `docker/`，新增 `apps/` `assets/` `.design/` `monitoring/`
- **`.gitignore`**：本地协作层段（6 个目录）；`/logs/` `/data/` 改为 `/logs/*` `/data/*`；
  新增 `/apps/*/lib/`
- **`.prettierignore`**：忽略本机协作层与生成的品牌资产；移除 Docker 相关条目
- **`README.md`**、**`packages/README.md`**、**`profiles/README.md`**、
  **`docs/目录结构说明.md`**：按新边界重写
- **`.env.example`**：从 Python Web（Postgres/Redis/SMTP）模板重写为 Oblivion 变量集
- **`monitoring/`**：重写为 Oblivion 指标（设计书 §26.2）
- **`.github/workflows/ci.yml`**：恢复 `npm ci`（补了 lockfile），移除 docker job

### 修复

- **`monitoring/grafana-dashboard.json` 是非法 JSON**（含 `#` 注释），
  `prettier --check` 直接抛 SyntaxError，`npm run lint` 必然失败 → 注释移入 panel 的 `description`
- **各包 `exports.types` 指向不存在的文件** → 修正 `declarationDir`
- **`.gitignore` 的 `!/logs/.gitkeep` 是死规则**（Git 不能重新包含被排除父目录下的文件）
  → 改为 `/logs/*` + `!/logs/.gitkeep`
- **CI 首次运行即红**：`setup-node` 的 `cache: npm` 与 `npm ci` 都需要 lockfile，
  而仓库没有 → 补 `package-lock.json`（工作区 + 10 个外部依赖，integrity 完整），CI 5/5 转绿
- **品牌生成器在 Windows 写出 CRLF**，导致工作区与索引永久不一致 → 改为强制写 LF

### 发现（设计书勘误，详见 `.design/ERRATA-v4.0.1-draft.md`）

- §9.2 的 `cordis` / `cordis-plugin-loader` **缺 npm scope**，且 `cordis@4.0.4`
  在 npm 上不存在（`cordis` 的 latest 是 `4.0.0-rc.10`）；真实包名是 `@deepseek-ai/*`，
  且参考架构把 loader 放 `devDependencies` 而非 `peerDependencies`
- §11.3 的 telemetry `disabled` 表达式**语义取反** —— 变量未设置时遥测反而开启，
  与 §2.2「默认关闭」冲突
- §1.2 的「四道菱形光晕」在 70–80% 主体占比下**几何不可行** → 改为径向光晕并留痕

### 已知遗留

- 26 个包均为**契约骨架**，运行时实现按设计书 §18 路线图推进
- `apps/electron` **未纳入构建**（需 Electron 二进制，Phase 7 接入）
- `scripts/bump-version.ps1` 只同步根 `package.json`，不同步各能力包与 `registry.json`
  （漏改由测试兜底）
- `.design/ERRATA-v4.0.1-draft.md` 为 **Draft** 且**不入库**，待批准后并入 Baseline v4.0.1
- **仓库里没有架构文档**：设计书在 `.design/`（本机）。对外只有 README 与 `docs/` 的使用说明。
  要对外开放协作时，需把设计书重新并回仓库
