# Oblivion-LAYOUT · 轮 3

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

继续，接入react依赖（但是这个可以.gitignore，然后在用户下载的时候自动安装依赖）

## 回答

Let me check whether React can actually be installed here, and map the component spec.

Network works. Let me wire React in and install it.

JSX pipeline verified. Let me check the brand asset, then write the component foundation.

Now the component foundation — contracts, tokens helper, and line utilities.

Backticks inside the raw templates broke parsing. Let me write these without them.

Now the base controls (12 件里的 9 件).

Build is clean. Now the component test suite, including mechanical discipline guards.

Excellent — the tests caught real bugs (`px()` used for time values). Let me fix the source and tighten the guards.

All 38 component tests pass. Let me make the React dependency failure-mode explicit, then run the full gates.

638 tests pass. Let me record the dependency decision and update docs.

React 已接入，组件层第一批落地，全部门禁绿。

## 一、React 接线（按你的要求：依赖本体不入库）

| 位置 | 内容 |
|---|---|
| 根 `package.json` | `react` / `react-dom` / `@types/react` / `@types/react-dom` → `devDependencies`（实装 **19.3.0**） |
| [package-lock.json](package-lock.json) | 已更新，含 4 个 react 条目 —— **必须入库**，否则 `npm ci` 无法复现 |
| [package.json](packages/oblivion-web-ui/package.json) | 本包声明为 **`peerDependencies`** —— 宿主提供**单实例** React（与 §9.2「跨包依赖走 peerDependencies」同一条口径） |
| [tsconfig.json](packages/oblivion-web-ui/tsconfig.json) | `jsx: react-jsx` + `lib: ES2022/DOM/DOM.Iterable`（DOM 只给这一个**浏览器侧**包） |
| [.gitignore](.gitignore) | 记下决策：`node_modules/` 整体忽略（**仓库里没有 React 源码**），只留 `package.json` + `package-lock.json` |

新克隆后 **`npm ci` 一句就够**，React 自动装上，仓库体积不随依赖增长。另外在测试里留了可读的跳过路径：缺 React 时提示「先 `npm ci`」，而不是抛 `MODULE_NOT_FOUND`。

## 二、Phase 4c 第一批：29 个组件

| 分组 | 组件 |
|---|---|
| 基础控件（12） | `Button` `Input` `Checkbox` `Switch` `SegmentedControl` `SegmentedTabs` `Pill` `Tag` `DisclosureRow` `PathLabel` `StateDot` `TextShimmer` |
| 浮层（8） | `Tooltip` `Modal` `RiskConfirmation` `Toast` `ShortcutKeys` `MenuSurface` `MenuItemButton` `MenuGroup` |
| 反馈 / 品牌 / 内容块 | `ConnectionIndicator` · `PolarisLogo`(+`POLARIS_PATH`) `BrandWordmark` · `CodeBlock` `ReadBlock` `DiffBlock` `SearchBlock` `TerminalBlock` `JsonBlock` |

核心是 [lib/contracts.ts](packages/oblivion-web-ui/src/lib/contracts.ts)（§7 全部固化常量 + 五个命名字段的封闭集合）与 [lib/tokens.ts](packages/oblivion-web-ui/src/lib/tokens.ts)。

## 三、把四条纪律交给机器

[ui-components.test.mjs](tests/unit/ui-components.test.mjs) 机械扫描组件源码，违反即红：

```
Cordis-free     组件层不得出现 @deepseek-ai/cordis 或 inject(   （唯一例外：插件入口 src/index.ts）
只用令牌        代码里不得出现 #hex / rgb()（注释除外；品牌几何作为资产副本单独放行）
文案走 props     字符串里不得出现 CJK 句子（throw 的开发期错误信息除外）
不感知宿主       不得 import 'oblivion-*'
```

再加两组断言：**固化常量对账**（16 行 ×4、3000ms、36/12、28/8、24px、gap 8、延迟 0/0、500ms、`StateDot` 的 **10/10/14/10/10**）与**无头渲染契约**（用 `react-dom/server` —— 仓库没有浏览器，而组件是纯展示原语，契约本就该在标记层可断言）。品牌几何还有一条防漂移检查：`src/brand/polaris.ts` 与 `assets/brand/polaris-path.ts` 逐字比对。

## 四、测试抓到的一类真 bug

过渡时长最初写成 `px(120)`。**这不报错** —— 浏览器直接丢掉非法声明，动画静默失效。现在 `ms()` 与 `px()` 是两个函数，7 个组件的时长全部改过来，并抽了「慢脉冲 1.5s」共享常量。这正是把纪律做成断言的价值：纸面评审看不出这类问题。

## 五、门禁

```
typecheck 0   ·   lint 0   ·   npm test 638/638 绿（600 → 638）
tokens:check 0（427 令牌与证据一致）
```

## 六、两处刻意的实现偏离（已写进文档）

1. **样式用内联 `style` 引用 `var(--obl-*)`，而非参考实现的 38 个 CSS Modules** —— 后者需要打包器，仓库目前没有；迁移时变的是样式承载方式，**令牌契约不变**。
2. **浮层只做呈现、不做定位** —— 锚点定位（`useAnchoredPosition` 一族）需要 DOM 与滚动观测，属后续批次，`side`/`align`/`gap` 先落到 `data-*` 交给宿主 CSS。

## 七、下一步

**4c 剩余**：锚点定位类浮层（`Menu` / `HoverCard` / `ImageLightbox`）、**188 个 `Icon*` 字形**、`MarkdownText` + 102 个 markdown 令牌的消费、设置表单族（`SettingsForm` + `SettingsFormModel`）、21 个工具函数里的 DOM 部分（剪贴板 / 输入法组合期抑制快捷键 / 粘性头观测）。

改动**尚未提交**（工作区含 `package-lock.json` 与 52 个 `web-ui` 源文件），需要你过目后提交。文档已同步：[CHANGELOG.md](CHANGELOG.md)、[web-ui README](packages/oblivion-web-ui/README.md)、[README.md](README.md)、[docs/快速开始.md](<docs/快速开始.md>)、`.memory/TODO.md`。

- 涉及工具: `run_code`

---