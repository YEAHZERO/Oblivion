# 变更日志

本项目遵循[语义化版本](https://semver.org/lang/zh-CN/)，版本单一真源是仓库根的
[`VERSION`](VERSION) 文件，由 [`scripts/bump-version.ps1`](scripts/bump-version.ps1) 写入。
发布流水（三级分层：alpha / rc / patch）记在 `.memory/release/`（本机目录，不入库）。

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
