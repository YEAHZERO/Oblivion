# dsh-weknora 是 WeKnora · 轮 10

- 来源会话: `session-3fc0a659-0b43-4f19-8e5d-463bd5915e0f`

## 问题

这个下面的是什么？然后让本插件也能被选择/成为「可嵌入的面板提供方」
同时桌面版的图标是不是也可以接管替换显示 ？

## 回答

三个问题我逐个查。第一个尤其重要 —— 那是我发现逻辑的**误报**，得先搞清楚它到底是什么。

第一个问题查清了，而且**这是我的一个严重误报**：

```
officeToPdf  →  _render_decorators = [Remote];  name: "render"
                async render(workspaceFileScope, path, priority, signal)
```

`remote.officeToPdf.render(...)` 是**被 `@Remote` 装饰的 RPC 方法，作用是把 Office 文档转成 PDF** —— 参数是文件路径和优先级，跟 React 毫无关系。我的发现逻辑只判断「有没有 `render` 函数」，把它误判成了可渲染面板。如果你勾上它，我的面板会去调 `render()`，那是**真的在触发文档转换**。

先查清楚第三条，再一起修。

确认了：应用图标是安装目录里的**文件资源** `resources\icon.png` + `tray.ico`，加上 exe 内嵌的 PE 图标 —— 客户端插件跑在渲染进程里，触达不到；而覆盖安装目录文件属于改官方产物，是红线。这条我最后统一说。

先修那个误报，这是有实际风险的缺陷。

现在让本插件也成为提供方。

三个问题都有结论了，其中一个是我必须认的缺陷。

## ① `remote.officeToPdf` 是什么 —— **它是我的误报，而且有实际风险**

它不是面板，是 **RPC 远端方法**：

```js
_render_decorators = [Remote];
name: "render",
async render(workspaceFileScope, path, priority, signal) { … renderFile(…) }
```

`@Remote` 装饰的业务方法，作用是**把 Office 文档转成 PDF** —— 参数是文件作用域、路径、优先级。跟 React 毫无关系。

我原来的判据只有「有没有 `render` 函数」，所以把它当成了可渲染面板。**如果你勾上它，我的面板会真的去调 `render()`，那是在触发一次文档转换。**

已修，改成两道防线：

| 防线 | 做法 |
|---|---|
| 形状判据 | 必须同时满足 DSH 控制面的约定形状：`render` 是函数 **且**（`version` 是数字 **或** `settingsVisible` 是函数）。`remote.officeToPdf` 两者皆无，被排除 |
| 命名空间排除 | `remote.*` / `api.*` 整片跳过 —— 那是 RPC 面，不参与 UI 发现 |
| 返回值校验 | 渲染时用 `isValidElement()` 确认拿到的真是 React 元素，不是就回退到提示面板 |

动态注册那条路径我上一轮说过没实测过 —— 这次它反倒先暴露了一个**逻辑层**的缺陷，比注册失败更值得警惕。

## ② 本插件现在是可嵌入提供方

按 `dshmarket` 的同一套约定注册了服务：

```js
ctx.provide('oblivionBrand', {
  version: 1,
  settingsVisible: () => true,
  render: () => createElement(settingsPanel),
})
```

两个效果：它**会出现在自己的「左侧栏面板」列表里**（显示为「Oblivion 品牌」），可以把自己挂到侧栏；同时**别的宿主插件也能通过 `ctx.get('oblivionBrand').render()` 内嵌本插件**。`version` 字段不是装饰 —— 正是它让发现逻辑能把 UI 控制面和 `remote.*` 那类 RPC 服务区分开。

## ③ 桌面版图标 —— **接管不了**，这条做不到

先说清楚那个图标是什么：它来自安装目录里的**文件资源**，不是应用内槽位。

| 图标 | 来源 |
|---|---|
| 窗口 / 任务栏图标 | `C:\Programs\AITech\DeepSeekHarness\resources\icon.png`（128,820 B） |
| 托盘图标 | `resources\tray.ico`（15,698 B） |
| exe 自身图标 | 编译进 `DeepSeek Harness.exe` 的 Windows PE 资源 |

**为什么插件碰不到**：

1. **客户端插件跑在渲染进程**（浏览器环境）。我 grep 过 `dsh-client-modules`，里面**零处**触达 `electron` / `ipcRenderer` / `nativeImage` —— 没有通往主进程的通道。
2. **宿主没暴露任何图标 API**。我 grep 了 `dsh-desktop-host` 全部 18 个文件，`setIcon` / `nativeImage` / `icon:` **一处都没有**。
3. 图标是 Electron **主进程启动时**读取并设置的，插件加载时窗口早就建好了。
4. 退一步说，就算去覆盖 `resources\icon.png` —— 那是**改官方安装产物**，属于我明确声明不碰的红线。

**应用内的品牌面我确实已经全覆盖了**。我把整个 asar 里 `FishLogo`（官方鲸鱼）的用法都找出来了，只有三处：

```
dsh-client-ui-brand-official/lib/client.js:16        官方品牌组件本身  → 已被我 -10 遮蔽
dsh-client-ui-sidebar/lib/client.js:279 / :315       sidebar.brand.mark 的 fallback（展开行 + 收起轨道）→ 同一槽位，已覆盖
```

所以：**只要「接管 DSH 品牌」是开着的，应用内不该再出现鲸鱼**。如果你在界面某处还看到鲸鱼，那说明还有我没找到的渲染面 —— 麻烦截个图并说明是在哪个位置（侧栏？设置里？某个弹窗？），我接着查。

---

产物已重新构建（30.6 KB），profile 侧的 junction 直接指向新版本，**重启 App 即可**。重启后请重点看两件事：

1. 「左侧栏面板」列表里**应该不再有 `remote.officeToPdf`**，但**应该多出「Oblivion 品牌 (oblivionBrand)」**
2. 勾选「Oblivion 品牌」→ 侧栏出现该条目，点进去是品牌设置面板本身

如果 `remote.officeToPdf` 还在，说明反射枚举路径跟我预期不同，把控制台报错贴我。另外还欠一次 push（`3312af4`、`1a2f47e`、`71dfff4` 都在本地待推）。

- 涉及工具: `edit`, `pwsh`, `write`

---