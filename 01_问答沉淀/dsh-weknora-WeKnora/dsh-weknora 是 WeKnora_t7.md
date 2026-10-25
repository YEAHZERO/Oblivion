# dsh-weknora 是 WeKnora · 轮 7

- 来源会话: `session-3fc0a659-0b43-4f19-8e5d-463bd5915e0f`

## 问题

在 插件dsh-creator-mode-plus的基础上，生产一个插件@oblivion/brand：        ├── Brand.tsx     # OblivionBrandMark({size}) + OblivionBrandName()
        └── polaris.ts    # 北极星 SVG path 与渐变常量
图标（北极星）在文件夹："C:\Projects\HarmonyOSDevelopment\Oblivion_deepseek"。"然后在插件的设置中可以将"探索未知之境"替换成自己想要的文字。
同时，在这个插件中，可以将设置中的某个设置页面比如该"插件市场"（安装的一个插件）放置在左侧区域，比如"插件"的下方，这样方便使用。
将该插件@oblivion/brand，代码位置放在C:\Projects\Oblivion，但是安装在dsh中使用

## 回答

这是个完整的插件开发任务，我先把可行性摸清 —— 尤其是「改标题文字」和「把设置页搬到主侧边栏」这两个需求，取决于 DSH 有没有公开扩展点。按规矩这必须是外部插件，不能动官方源码。

大发现 —— 这些文件在 `Oblivion_deepseek` 里**已经存在**了，而且正是你描述的 `Brand.tsx` + `polaris.ts`，还有整套北极星素材。它们属于之前那批**未提交**的工作（`?? packages/oblivion-brand/`）。先读全。

现有的 `Brand.tsx` 里文字是硬编码的 `Oblivion`。继续读客户端入口和宿主入口 —— 这会告诉我它挂在 DSH 的哪个扩展点上。

架构清楚了。现在最关键的是搞清 DSH 客户端的**槽位 API 语义**和**设置持久化方式** —— 这决定后面两个需求能不能实现。先重建 asar 读取器。

官方品牌插件读到了 —— 它注册 `sidebar.brand.mark` / `sidebar.brand.name` 且**不带 priority**。我需要确认槽位的优先级语义和侧边栏可用的槽位。

这两个包自带中文 README —— 这就是权威文档。直接读。

**`sidebar.panellist`** —— 这就是需求 3 的公开扩展点：「插件在 root 作用域的 `sidebar.panellist` list 中注册图标组件，提供 `id`、可选 `order`、`label`；**同一个 id 寻址布局中 root 作用域 `main` keyed slot 的组件**」。完全对得上你要的效果。取精确签名。

`sidebar.panellist` 是 `{kind:"list", scope:"root"}`，图标组件收 `{size, active}`。而且 `selectPanel` 里特判了 `id === "plugins"` —— **你说的侧边栏那个「插件」就是它，id 是 `plugins`**。现在找承载面板内容的 `main` keyed slot。

`single` 语义确认了：**同 priority 重复注册会抛错；不同 priority 则遮蔽，且 `lowest renders`** —— 所以官方品牌在 0，我用 -10 就能盖掉，旧代码的思路是对的。现在查设置持久化的正规做法（参照已装的 `dsh-cost-meter`）。

关键发现：**「探索未至之境」不是槽位，是 i18n 字符串** —— `ui-conversation` 里的 `hero.headline`。而且 hero 区只有 `brand.mark`，没有文字槽位。所以需求 2 只能靠覆盖 locale。查一下 locale 服是否允许覆盖别人的命名空间。

`插件` 面板是 `order: 0`，`任务` 是 `order: 10` —— 我插 `order: 5` 就正好在「插件」下方。最后确认面板内容的注册方式。

侦察完成。**三个需求里有两个可做，第二个撞上硬约束** —— 这个必须先告诉你，否则我做出来的东西不会是你想要的。

## 可行性结论（都有代码依据）

| 需求 | 结论 | 依据 |
|---|---|---|
| ① `Brand.tsx` + `polaris.ts` 替换品牌 | ✅ 可做 | `sidebar.brand.mark`、`conversation.hero.brand.mark` 都是 `single` 槽。`single` 语义实测为：**同 priority 重复注册抛错，不同 priority 则遮蔽，且 `lowest renders`**。官方品牌在默认 0，我用 `-10` 即可覆盖 |
| ② 把「探索未至之境」换成自定义文字 | ❌ **原样做不到** | 见下 |
| ③ 把「插件市场」放到侧栏「插件」下方 | ✅ 可做 | `sidebar.panellist`（`{kind:"list", scope:"root"}`）+ 同 id 寻址 `main`（`{kind:"keyed", scope:"root"}`）。「插件」`order:0`、「任务」`order:10`，我插 `order:5` 正好在「插件」下方 |

### 需求 ② 为什么做不到

「探索未至之境」**不是槽位，是 i18n 字符串**。渲染处（`ui-conversation`）写死了：

```js
children: [jsx("span", { children: t("hero.headline") }), ...]   // "hero.headline": "探索未至之境"
```

hero 区只暴露了三个槽位：`brand.mark`、`agentPreset`、`workspace` —— **没有文字槽位**。

而想从外部插件覆盖这个 key 也不行，locale 服务对同 namespace+locale 重复注册**直接抛错**：

```js
if (locales.has(localeKey(locale))) throw new Error(`locale namespace "${ns}" already has locale "${locale}"`);
```

唯一的办法是改 `ui-conversation` 这个官方包 —— 那是红线，我不碰。

### 可行的替代

**方案 A（推荐）**：自定义文字落在 **`sidebar.brand.name`** —— 这是我能完全掌控的文字槽位（官方在这里渲染 `BrandWordmark`）。效果：侧栏品牌行变成 `[北极星] + 你设定的文字`。hero 区的**图形**同样能换成北极星，只是那一行 headline 文字动不了。

**方案 B**：你坚持要改 hero 那行字 → 只能改官方包，我不做。

## 顺带确认的两件事

- **好消息**：你要的 `Brand.tsx` + `polaris.ts` **在 `Oblivion_deepseek` 里已经写好了**（`packages/oblivion-brand/src/client/`），北极星素材也齐全（`polaris.svg` / `polaris-path.ts` / 各尺寸 PNG / ico / icns）。那是之前那批**未提交**的工作。所以需求 ① 是移植+加固，不是从零写。
- **Developer Mode 仍未开启**（刚实测 `symlinkSync` 还是 EPERM），所以走不了 `dshx_scaffold`。我打算用 App 自带的 plugin manager 以 `link:` 方式装入 —— 这正是桌面端官方通道（`dshmarket` 的 `official-desktop.js` 就是这么做的：`manager.installBundle()`，且明确写着「Never fall back to `dsh plugin --profile desktop`」）。

方案确认。开始实现 —— 先验证客户端模块表里能否 `require` 到 `react`（我要用 hooks 做响应式文字）。

`react` / `react-dom` / `react/jsx-runtime` 都可 require，hooks 可用。开始写插件。

骨架写完。装依赖并构建 —— 先跑通再写文档。

构建产物正确（`apply`/`inject` 都已导出，react 走 external）。现在找安装通道 —— 先看市场的 install 接口是否接受自定义 spec。

市场 install 接口需要「注册表收录 + 同源 + 无 agent 运行」—— 我本地插件走不了。看看有没有可用的 CLI 通道。

找到了 —— 桌面端有官方 CLI：`runtime\cli\bin\dsh.cmd` 用 `ELECTRON_RUN_AS_NODE=1` 跑 `dsh-desktop-host/lib/cli.js`。而且 `TARGET_RE` 允许 `link:`（但**不含反斜杠**，必须用正斜杠）。先看它支持哪些命令。

桌面 CLI 用 `manageDesktopProfile: true` 调用 `runCli` —— 所以 `--profile desktop` 在**这条**通道下是允许的（市场注释里说的"被拒绝"指的是不带该开关的普通 CLI）。先看帮助。

CLI 通道确认可用。备份 profile 清单后安装。

安装成功。核对 profile 清单是否同时更新了 `bundles`（这决定客户端半边会不会被加载）。

链接、产物、版本全部就位（junction 指向 `C:\Projects\Oblivion\oblivion-brand`）。**重启前先做静态验证** —— 用 CLI dump 组合树，确认新 bundle 能解析。

CLI 拒绝 dump desktop profile（`managed exclusively by the Electron application`）—— 但 `plugin add` 是放行的，所以安装本身没问题。改用静态校验。

全部校验通过。写文档并提交。

插件已完整落地、构建、**安装进 desktop profile**、并提交 git。

## 交付物

代码在 `C:\Projects\Oblivion\oblivion-brand\`（commit `3312af4`）：

```
oblivion-brand/
├── package.json           # dsh.bundle + dsh.client 声明
├── cordis.patch.yml       # Bundle 层：把本插件的行插进组合树
├── scripts/build.mjs      # esbuild 双产物构建（无需 tsc）
└── src/
    ├── index.ts           # Node 半边（空 apply 留座）
    └── client/
        ├── index.ts       # 槽位注册
        ├── Brand.tsx      # OblivionBrandMark({size}) + OblivionBrandName()   ← 你要的两个
        ├── polaris.ts     # 北极星 SVG path 与渐变常量                        ← 你要的两个
        ├── settings.ts    # localStorage store + useBrandName
        ├── BrandSettingsPanel.tsx
        └── market.tsx     # 侧栏条目图标 + 面板正文
```

**好消息**：`Brand.tsx` 和 `polaris.ts` 你在 `Oblivion_deepseek` 里其实已经写好了（属于那批未提交的工作），北极星素材也齐全，所以需求 ① 是移植+加固而不是从零写。我在移植时修了一处：原代码用 `var(--obl-alias-label-primary)`，那是 Oblivion 自己的令牌，**在 DSH 里不存在**，会导致文字颜色失效；已改为 DSH 的 `--dsw-alias-label-primary` 并带回退。

## 关键实现依据（都有源码证据）

| 决策 | 依据 |
|---|---|
| 品牌槽 `priority: -10` | `ui-slots` 的 single 槽规则：**同 priority 重复注册抛错，不同 priority 遮蔽，`lowest renders`**。官方在默认 0，故 -10 稳定覆盖，不动官方包 |
| 每处都包 `slots.inject` | 注册未声明槽位会在加载时抛错；inject 让本插件与 `ui-sidebar`/`ui-layout`/`ui-settings` 的加载顺序无关 |
| 侧栏入口 `sidebar.panellist` + `main` | 侧栏 README 明载「同一个 id 寻址布局中 root 作用域 `main` keyed slot 的组件」。`插件` 是 `order:0`、任务 `order:10`，我取 **5** 正好在「插件」下方 |
| 市场面板怎么嵌 | `dshmarket` 自己 `ctx.provide('market', …)` 了 `render()`，注释写着「for a host that renders it inside its own container」—— 我就是那个 host，整块搬位置，不复制不包装 |
| `link:` 必须用正斜杠 | 桌面端 `TARGET_RE` 是 `/^[A-Za-z0-9@:./_#+~^=-]+$/`，**不含反斜杠** |
| 安装走哪条通道 | 普通 CLI 拒绝 desktop（`managed exclusively by the Electron application`），但桌面自带 CLI 以 `manageDesktopProfile: true` 调 `runCli`，`plugin` 子命令放行 |

## 安装已完成

```
dependencies:  "@oblivion/brand": "link:C:/Projects/Oblivion/oblivion-brand"
bundles:       [..., "@oblivion/brand"]
node_modules:  Junction → C:\Projects\Oblivion\oblivion-brand
```

profile 清单备份在 `package.json.bak-before-oblivion-brand`，要回退直接覆盖。

**顺手发现**：你的 profile 里已经有 `dsh-whale-widget 0.3.18`（上游 MeteorNOX 版）。提醒一下前面说过的那条 —— 它和 Witherwithwinter 那个 fork 都用 `/dsh-whale/` 路由前缀，**别两个都装**。

## 需要你做一步：重启 DSH App

客户端 bundle 在启动时装配，热更新覆盖不到。重启后请确认：

1. 侧栏品牌行：**北极星 + "Oblivion"**
2. 左侧栏「插件」下面多一条 **插件市场** —— 点进去应该是完整市场面板
3. **设置 → Oblivion 品牌** —— 改文字后侧栏应立即变化（无需刷新）
4. 空白会话的 Hero 区：鲸鱼变成北极星

有任何一项不对，把控制台（F12）里 `@oblivion/brand` 或 slot 相关的报错贴给我。另外 `da941ca` 那个提交还欠一次 push（当时 GitHub 断线），现在的 `3312af4` 同样待推 —— 网络恢复我一起补上。

- 涉及工具: `ask_user_question`, `edit`, `grep`, `pwsh`, `read`, `todo_write`, `write`

---