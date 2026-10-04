# @oblivion/brand

Oblivion 品牌插件：把 DSH 侧栏与会话 Hero 的品牌换成**北极星**（或你自己的图片），品牌名文字与图形都可在设置里改；可以把**可嵌入的插件面板**挂到左侧栏；随时可以**关闭接管**让 DSH 恢复原生外观。

全部走 DSH 的公开槽位 API，没有改任何官方包。

## 设置项

入口：**设置 → Oblivion 品牌**

| 设置 | 作用 |
| --- | --- |
| **接管 DSH 品牌** | 关闭即 **dispose** 本插件的品牌槽位注册，官方鲸鱼图标与 wordmark **立即恢复**（无需卸载插件、无需刷新） |
| **品牌图形** | 上传任意浏览器可解码的图片（PNG / JPEG / WebP / GIF / SVG / AVIF / BMP / ICO）。>256px 的位图自动缩放，SVG 保持矢量；也可一键「恢复北极星」 |
| **品牌名文字** | 侧栏品牌行的文字，留空则只显示图形 |
| **面板显示** | 内容是否居中限宽。同一面板会出现在两个宽度差异极大的容器里（设置弹窗很窄、挂到左侧栏后是整窗宽），居中时限宽 620px 并水平居中，关闭则贴左。**只作用于本面板**，不影响其它插件的面板 |
| **左侧栏面板** | **多选**：勾选的插件面板以独立条目出现在左侧栏「插件」下方 |

设置存在浏览器 `localStorage`（键 `oblivion-brand:settings:v1`）。0.1.0 的裸字符串键 `oblivion-brand:name` 会在首次读取时自动迁移。

## 槽位

| 槽位 | 组件 | 何时注册 |
| --- | --- | --- |
| `sidebar.brand.mark` | `OblivionBrandMark` | 「接管 DSH 品牌」为开 |
| `sidebar.brand.name` | `OblivionBrandName` | 同上 |
| `conversation.hero.brand.mark` | `OblivionBrandMark` | 同上 |
| `settings.section` | 设置分节 | **永远**（否则关掉接管后无法再打开） |
| `sidebar.panellist` + `main` | 面板条目 / 正文 | 勾选了对应提供方 |

### priority 为什么是 -10

官方 `@deepseek-ai/dsh-client-ui-brand-official` 在默认 priority(0) 占了 `sidebar.brand.mark` / `sidebar.brand.name`。`ui-slots` 对 `single` 槽的规则是：

```
同 priority 重复注册 → 抛错
不同 priority       → 遮蔽，且 lowest renders
```

所以 `-10` 稳定覆盖官方；而**关闭接管只要 dispose 本插件的注册**，官方那条立刻重新成为渲染者 —— 这正是槽位系统设计好的机制，不需要改官方包。

### 为什么每处都包 `slots.inject`

注册未声明过的槽位会在加载时抛错。用 `ctx.slots.inject(name, cb)` 等声明方就位，再在 `sync()` 里统一对账（按需 register / dispose）。因此本插件无论先于还是后于 `ui-sidebar` / `ui-layout` / `ui-conversation` 都成立。

## 两条已知边界

### 1. 会话 Hero 的 headline 文字改不了

那行「探索未至之境」**不是槽位，是 i18n 字符串**。`ui-conversation` 的渲染处写死：

```js
children: [jsx("span", { children: t("hero.headline") }), ...]   // "hero.headline": "探索未至之境"
```

hero 区只暴露 `brand.mark` / `agentPreset` / `workspace` 三个槽位，没有文字槽位。从外部覆盖这个 key 也不行 —— locale 服务对同 namespace+locale 重复注册**直接抛错**：

```js
if (locales.has(localeKey(locale))) throw new Error(`locale namespace "${ns}" already has locale "${locale}"`);
```

所以可自定义的文字落在 **`sidebar.brand.name`**（我们能完全掌控的文字槽位）；hero 区只换图形。

### 2. 侧栏只能放「可嵌入的提供方」，不是任意设置页

`sidebar.panellist`（`{kind:"list", scope:"root"}`）的机制是：注册图标 + `id`/`order`/`label`，**同一个 id 再寻址布局中 root 作用域 `main` keyed slot 的组件**，后者是面板正文。

但设置页正文是由设置弹窗用它**自己那个窄化过的 `renderSlot`** 渲染的，而 `main` 声明为 `{kind:"keyed", scope:"root"}` 且**没有 children** —— 从 `main` 或 `sidebar.panellist` 里没有任何公开途径去渲染别的设置分节正文。

因此能搬进侧栏的，是那些**主动暴露可渲染控制面**的插件。`dshmarket` 就是：

```js
ctx.provide('market', { render: (props = {}) => buildMarketElement(props) })
// 其注释：「for a host that renders it inside its own container」
```

本插件**自动发现**这类提供方：cordis 的 `ctx.reflect.provide()` 把服务登记在 `ctx.reflect.store`，枚举它、筛出带 `render()` 的服务即可（反射不可用时退回已知名单探测）。装了更多这类插件，候选列表会自动变长 —— 无需改本插件。

顺序：`插件` 面板 `order:0`、任务面板 `order:10`，本插件从 `5` 起递增，因此落在「插件」正下方。

> 布局约束（内边距、限宽、居中）写在**本面板自己**身上，不写进通用的嵌入容器 ——
> 那个容器是所有提供方共用的，在那里加约束会把插件市场这类需要撑满宽度的面板挤成窄列。

## 构建

```powershell
cd C:\Projects\Oblivion\oblivion-brand
npm install
npm run build        # esbuild 双产物
npm run typecheck    # tsc --noEmit
```

产出：

- `lib/index.js` —— Node 半边，ESM，给 Cordis Loader 留座
- `lib/client.js` —— 浏览器半边，包成 `window.__ModuleLoader__.load({ id, factory })` 工厂闭包

浏览器半边用 esbuild 打包，把 `react` / `react-dom` / `react/jsx-runtime` / `ui-primitives` 标为 **external** —— 它们由宿主客户端模块表提供（官方品牌插件同样是 `require("react/jsx-runtime")`）。

## 安装

桌面端的 profile 由 Electron 应用独占管理，普通 CLI 会拒绝：

```
error: profile "desktop" is managed exclusively by the Electron application
```

但桌面自带的 CLI 以 `manageDesktopProfile: true` 调 `runCli`，**`plugin` 子命令是放行的**：

```powershell
$dsh = 'C:\Programs\AITech\DeepSeekHarness\resources\runtime\cli\bin\dsh.cmd'
& $dsh plugin --profile desktop add 'link:C:/Projects/Oblivion/oblivion-brand'
```

> `link:` 的路径必须用**正斜杠**：桌面包管理器的目标校验正则不含反斜杠，写 `link:C:\...` 会被拒。

该命令会同时更新 `dependencies` 与 `dsh.profile.bundles`。因为是 `link:` 安装（junction 指向源码目录），**改完源码只要重跑 `npm run build` 再重启 App**，不需要重新安装。

## 目录

```
oblivion-brand/
├── package.json           # dsh.bundle + dsh.client 声明
├── cordis.patch.yml       # Bundle 层：把本插件的行插进组合树
├── tsconfig.json
├── scripts/build.mjs      # esbuild 双产物构建
└── src/
    ├── index.ts           # Node 半边（空 apply）
    └── client/
        ├── index.ts       # 槽位注册 + 设置驱动的 register/dispose 对账
        ├── Brand.tsx      # OblivionBrandMark({size}) + OblivionBrandName()
        ├── polaris.ts     # 北极星 SVG path 与渐变常量
        ├── settings.ts    # 设置存储 + 迁移 + useBrandSettings 钩子
        ├── BrandSettingsPanel.tsx
        └── panels.tsx     # 提供方发现 + 面板条目/正文
```

## 来源

北极星几何与素材来自 `Oblivion_deepseek/assets/brand/`（`polaris-path.ts` / `polaris.svg` 同源）。`src/client/polaris.ts` 是该 path 的副本，两边更新时需同步。
