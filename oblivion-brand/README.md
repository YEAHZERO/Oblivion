# @oblivion/brand

Oblivion 品牌插件：把 DSH 侧栏与会话 Hero 的品牌换成**北极星**，品牌名文字可在设置里自定义，并把**插件市场**面板挂到左侧栏「插件」下方。

## 它注册了什么

全部走 DSH 的公开槽位 API，没有改任何官方包。

| 槽位 | 组件 | 效果 |
| --- | --- | --- |
| `sidebar.brand.mark` | `OblivionBrandMark` | 侧栏品牌图形 → 北极星八芒星 |
| `sidebar.brand.name` | `OblivionBrandName` | 侧栏品牌名 → 设置里可改的文字 |
| `conversation.hero.brand.mark` | `OblivionBrandMark` | 会话 Hero 区图形 → 北极星 |
| `settings.section` | `BrandSettingsPanel` | 「设置 → Oblivion 品牌」 |
| `sidebar.panellist` + `main` | `MarketPanelIcon` / 市场面板 | 左侧栏「插件」下方的插件市场 |

### priority 为什么是 -10

官方 `@deepseek-ai/dsh-client-ui-brand-official` 在默认 priority(0) 占了 `sidebar.brand.mark` / `sidebar.brand.name`。`ui-slots` 对 `single` 槽的规则是：

```
同 priority 重复注册 → 抛错
不同 priority       → 遮蔽，且 lowest renders
```

所以 `-10` 稳定覆盖官方，无需改动官方包。若将来官方改用更低的值，把这里的 `BRAND_PRIORITY` 再调低即可。

### 为什么每处都包 `slots.inject`

注册未声明过的槽位会在加载时抛错。用 `ctx.slots.inject(name, cb)` 等声明方就位，于是本插件无论先于还是后于 `ui-sidebar` / `ui-layout` / `ui-conversation` / `ui-settings` 加载都成立。

## 已知边界：「探索未至之境」改不了

会话 Hero 区那行 headline 文字**不是槽位，是 i18n 字符串**。`ui-conversation` 的渲染处写死了：

```js
children: [jsx("span", { children: t("hero.headline") }), ...]   // "hero.headline": "探索未至之境"
```

hero 区只暴露 `brand.mark` / `agentPreset` / `workspace` 三个槽位，**没有文字槽位**。想从外部覆盖这个 key 也不行 —— locale 服务对同 namespace+locale 重复注册**直接抛错**：

```js
if (locales.has(localeKey(locale))) throw new Error(`locale namespace "${ns}" already has locale "${locale}"`);
```

因此本插件把可自定义的文字落在 **`sidebar.brand.name`**（我们能完全掌控的文字槽位）；hero 区只换图形。改那行 headline 只能改官方包，本插件不做。

## 插件市场面板

DSH 的公开扩展点是 `sidebar.panellist`（`{kind:"list", scope:"root"}`）：注册一个图标组件 + `id`/`order`/`label`，**同一个 id 再寻址布局中 root 作用域 `main` keyed slot 的组件**，后者就是面板正文。

`dshmarket` 通过 `ctx.provide('market', …)` 暴露了 `render()`，其源码注释明确写着「for a host that renders it inside its own container」—— 本插件正是那个 host，只把整块面板搬个位置，不复制也不包装市场 UI。

顺序：`插件` 面板 `order:0`、任务面板 `order:10`，本插件取 `5`，因此落在「插件」正下方。市场未安装或晚于本插件就绪时，面板显示可读提示而不是空白（服务是每次渲染惰性查的）。

## 配置持久化

品牌名文字存在浏览器 `localStorage`（键 `oblivion-brand:name`）。桌面端只有一个持久化浏览器配置，因此不需要宿主半边与 HTTP 路由。所有读写都包了 try/catch：存储不可用时退化为内存态，绝不让品牌槽位因存储失败而崩掉。

## 构建

```powershell
cd C:\Projects\Oblivion\oblivion-brand
npm install
npm run build
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

该命令会同时更新 `dependencies` 与 `dsh.profile.bundles`。装完**重启 DSH App**（客户端 bundle 在启动时装配）。

## 目录

```
oblivion-brand/
├── package.json           # dsh.bundle + dsh.client 声明
├── cordis.patch.yml       # Bundle 层：把本插件的行插进组合树
├── tsconfig.json          # 仅供编辑器/typecheck，构建走 esbuild
├── scripts/build.mjs      # esbuild 双产物构建
└── src/
    ├── index.ts           # Node 半边（空 apply）
    └── client/
        ├── index.ts       # 槽位注册
        ├── Brand.tsx      # OblivionBrandMark({size}) + OblivionBrandName()
        ├── polaris.ts     # 北极星 SVG path 与渐变常量
        ├── settings.ts    # localStorage store + useBrandName 钩子
        ├── BrandSettingsPanel.tsx
        └── market.tsx     # 侧栏条目图标 + 面板正文
```

## 来源

北极星几何与素材来自 `Oblivion_deepseek/assets/brand/`（`polaris-path.ts` / `polaris.svg` 同源）。`src/client/polaris.ts` 是该 path 的副本，两边更新时需同步。
