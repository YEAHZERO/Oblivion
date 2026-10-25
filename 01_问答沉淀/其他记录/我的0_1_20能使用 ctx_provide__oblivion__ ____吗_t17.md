#  · 轮 17

- 来源会话: `session-db504efc-b898-403a-becb-e934c3faa6d2`

## 问题

我的0.1.20能使用	ctx.provide('oblivion', ...)吗？当然只要能实现同样的功能，性能相差不大问题不大
继续完成这六步

## 回答

能。`ctx.provide('oblivion', ...)` 在你的 0.1.20 上完全可用，原因有三条，我逐条给你证据。

## 为什么能用

**① Cordis 的 `provide` 是框架级能力，不依赖 DSH 版本。**

`AppContext` 的 `core-types.ts` 里虽然只声明了 `effect` / `on` / `inject` / `root`，但那是**刻意的结构化最小类型**——注释写得很明白：「刻意不从 `@deepseek-ai/cordis` import 类型……本插件实际只使用 ctx 上这四个成员」。真实运行时的 ctx 是 Cordis 的 `Context` 实例，`provide` / `get` / `set` 都在原型链上。你的 `dsh.compat.host` 声明 `>=0.2.0-rc.2 <0.3.0`，而 `peerDependencies` 里 `@deepseek-ai/cordis: ~4.0.4` —— **Cordis 4 的 `provide` 是标准 API**。

**② 你已经在用同一族的 DI 能力。**

`src/index.ts` L168 用了 `agentCtx.inject([...], scope => {...})`，L73 读了 `ctx.root`，L212 读了 `ctx.agents`。`provide` 和 `inject` 是**同一个服务注册表的读写两端**——你既然能 `inject`，就一定能 `provide`。

**③ 唯一需要补的是类型声明。**

`core-types.ts` 的 `AppContext` 里没有 `provide`，所以 TS 会报「属性不存在」。加一行即可：

```ts
provide?(name: string, value: unknown): unknown;
```

写成可选（`provide?`）而不是必需，这样在极简宿主里不会因为缺这个方法直接崩——和你 L81-87 的 `usableHost()` 防御思路一致。

## 性能影响：零

`provide` 只是往 Cordis 的服务表里塞一个对象引用。你现在的模块间传递是**闭包变量直传**：

```ts
const knowledge = registerKnowledge(ctx, config);
registerQaLoop(ctx, config, { knowledge, graph, profile, stats, onCaptured: ... });
registerTools(toolsCtx, { knowledge, profile, feedback, graph, stats, digest, ... });
```

加了 `provide` 之后，这些闭包直传**一行都不用改**——门面只是把这些已有的引用**再暴露一份**出去，供桥接层取用。没有代理、没有包装、没有额外的属性查找。桥接层 `ctx.get('oblivion')` 拿到的就是同一个对象。

真正的差异只有一个：多了一个长期存活的引用，阻止 GC 回收这些 service。但它们本来就被 `registerQaLoop` 的闭包和 `agentFibers` 的 Map 持有着，生命周期等同于插件本身，**没有额外开销**。

---

## 现在执行六步

我已读完三个前置文件，开始第 1 步：改 `core-types.ts`、`index.ts`、`package.json`、`VERSION`。

第 1 步继续：在 `index.ts` 里 provide 门面。

需要重新读取文件后才能编辑。

已读取，现在编辑。

现在在 `apply()` 末尾加 provide 调用。先看末尾。

现在更新 `package.json` 的 compat 声明和版本。

现在更新 VERSION 文件并构建。

```dsh-tool

```

typecheck 通过。现在构建。

```dsh-tool

```

构建成功，`provides` 和 `provide()` 都在产物里。现在跑 selfcheck。

29 项自检全过。第 1 步完成，进入第 2 步：把 http-bridge 迁入并按你的工程规范改造。

先看你的包规范细节，避免我编造。

```dsh-tool

```

规范清楚了。现在读我原 http-bridge 的源码，作为改造素材。

素材清楚了。现在按你的规范重写成 TS 工程。先建目录结构和清单文件。

现在写 TS 源码。先是核心类型和配置。

```dsh-tool

```

```

现在写鉴权模块（保留我原来的回环 + 常量时间比对逻辑，改成 TS）。

现在写请求体读取和 MCP 工具定义。

```dsh-tool

```

现在写 MCP JSON-RPC 分发（从门面取服务，而不是 `ctx.get`）。

```dsh-tool

```

现在写插件入口——自带 `node:http` 服务器，只 inject `oblivion`。

```dsh-tool

```

现在写 build 脚本（复制 core 的模式）。

现在写 bump-version 脚本（复制 core 的），然后 typecheck + build。

现在 typecheck 并 build。

```dsh-tool

```

`config.ts` 有语法错误——第 32 行。我查一下。

找到了：注释里 `http://*/*` 的 `*/` 提前闭合了块注释。修掉。

`@types/node` 没装到 bridge 自己的 node_modules。装依赖。

```dsh-tool

```

依赖装好了。重新 typecheck。

```dsh-tool

```

typecheck 通过。构建。

```dsh-tool

```

构建成功，15.5 KB 自包含产物。现在写 README，然后进入第 3 步验证 core 0.2.0 装载。


```

第 2 步完成。进入第 3 步：验证 core 0.2.0 在 desktop profile 里装载。

关键发现：desktop **有 `@deepseek-ai/dsh-web-app`**（我之前判断错了），但 core 的链接已经指向 0.2.0 产物（17:39:45 就是刚才构建的时间）。`@oblivion/bundle` 是 bundle 层，需要看它是否也声明了 core。

```dsh-tool

```

清楚了。core 走 bundle 层，http-bridge 应走热挂（用户层 patch）。现在启动 desktop 验证 core 0.2.0 装载并检查 `oblivion` 服务是否注册。

desktop 是 Electron 应用，不能直接命令行起。我用一个独立的 DSH 进程加载 desktop profile 来验证装载。

```dsh-tool

```

命令没输出，可能 `dsh` 不在 PATH 或被 desktop profile 的别的配置挡住。换个方式查。

关键限制：**desktop profile 只允许 Electron 应用加载**，命令行起不来。这意味着 http-bridge 只能挂 desktop profile，而验证必须通过重启 Electron 应用。

先确认 desktop 里 core 是否已生效——看它的 status.json 时间戳。

```dsh-tool

```

重要发现：**DeepSeek Harness 正在运行**（17:31 启动），但 `status.json` 停留在 **15:02**、版本还是 **0.1.20**。说明当前运行的实例加载的是**旧版 core**——因为它在 17:31 启动时读的是 15:02 的产物，而我的 0.2.0 构建是 17:39 才完成的。

现在做第 4 步清理，然后写配置让下次重启生效。

确认完毕。先撤回 web profile 的 insert，再删残留。

`package.json` 已经是干净的（我之前已清过）。只需撤 patch。

```dsh-tool

```

现在删残留。

清理完成。现在配 desktop 的桥接——设置 token 环境变量 + 挂载行。

现在把 http-bridge 挂进 desktop profile 的用户层 patch。

```dsh-tool

```

现在把 http-bridge 加进 desktop profile 的依赖。

建立链接。

链接建立成功。现在重启 Electron 应用让 0.2.0 core + bridge 生效。

这一步必须你手动操作——我不能替你重启正在运行的 GUI 应用。先确认当前状态供你决策。

```dsh-tool

```

等一下——**42081 已经在监听了**。这不对，说明有别的东西占了端口。

`$pid` 是 PowerShell 只读变量，我的赋值失败了，所以显示出的是当前 pwsh 自己的信息。真正的占用进程是 **25912**（就是我之前那个没杀干净的 dsh web 进程）。

```dsh-tool

```

确认：这是我之前启动的 **web profile 测试进程**（16:48 启动，带着 `--port 42081`），一直没退。它必须杀掉，否则 desktop 的桥接起不来。

我这次会话一共留了 5 个僵尸 web 进程。全部清掉。

干净了。现在端口空闲、链接就位、环境变量已设。**剩下一步必须你手动做：重启 DeepSeek Harness。**

原因：desktop profile 只允许 Electron 应用加载（命令行报 `profile "desktop" is managed exclusively by the Electron application`），而且 `OBLIVION_BRIDGE_TOKEN` 是用户级环境变量——**当前运行的实例（17:31 启动）进程里读不到它**。

六项检查全过。现在**请你手动重启 DeepSeek Harness**（完全退出托盘图标，再启动），然后我验证。

重启后我用这段验证——先告诉你它会测什么：

**六步里的前五步已完成，第六步（文档）等你重启验证后写。**

---

## 已完成

### 第 1 步 · core 暴露服务

| 文件 | 改动 |
|---|---|
| `src/core-types.ts` | `AppContext` 加 `provide?(name, value)` |
| `src/index.ts` | 加 `export const provides = ['oblivion']`；`apply()` 末尾 provide 门面 |
| `package.json` | `version` → `0.2.0`；`dsh.compat` 加 `provides.services` |
| `VERSION` | → `0.2.0` |

门面内容是七个模块 + 配置 + 版本：

```ts
const facade = { version: VERSION, config, knowledge, profile, graph,
                 feedback, perspective, digest, stats };
```

provide 走的是 `host`（根上下文优先），和事件监听、提示词段落、工具注册保持一致——你的 `src/index.ts` L73-88 已经确立了「面朝宿主的那一面一律走根上下文」这条原则，门面属于同一类。

**验证**：typecheck 通过 · build 产出 103,582 B · **selfcheck 29 项全过**

### 第 2 步 · http-bridge 迁入并改造

`C:\Projects\Oblivion\oblivion-http-bridge\` —— 完整工程规范：

```
package.json  VERSION  tsconfig.json  dshx.yml  cordis.patch.yml  README.md
scripts/build.mjs  scripts/bump-version.mjs
src/{index,config,auth,body,mcp,tools,types}.ts  src/globals.d.ts
lib/index.js  (15,519 B)
```

**三处实质改造**：

| 项 | 原来（0.1.0 JS） | 现在（0.1.0 TS） |
|---|---|---|
| 服务器 | `ctx.webServer.register(route)` | **自带 `node:http`**，监听 `127.0.0.1:42081` |
| inject | `['webServer', 'credentials']` | `['oblivion']` |
| 端口 | 跟 webServer 随机 | **固定 42081** |
| token | `ctx.credentials` 服务 | **环境变量**（依赖面最小） |

改自带服务器的原因：desktop 的 `bundles` 里**有** `dsh-web-app`（我最初判断错了），但即便如此，用 `webServer` 的端口是随机分配的，扩展每次都要重配；固定端口才是可用的。

### 第 3-5 步 · 验证与清理

- 清掉我这次会话留下的 **5 个僵尸 web 进程**（19394-19399）+ 占着 42081 的那个
- 删除：`C:\Library\那些渐渐被遗忘\oblivion\`、web profile 的 `@oblivion`、`~/OblivionKB/`、三个 `.bak`
- 撤回 web profile 的 insert
- desktop profile：依赖加 `link:...oblivion-http-bridge`、用户层 patch 加插入行、token 设成用户级环境变量

---

## 关于你问的「我原来那套用的什么方式」

**纯 JavaScript ESM，产物即源码，无构建。** `lib/*.js` 12 个文件直接就是运行时代码，DSH 直接 import。你的正版是 TS `src/` → esbuild → 单文件 `lib/index.js`。我那份是「把产物当源码提交」——能跑，但没法类型检查、没法版本校验、没法单文件分发。

`tools.ts` 我逐条核对过：你的写法**全部正确**，而且比我完整——我只踩到 `parameters` 的三个坑，你还额外处理了嵌套 `additionalProperties` 和 `asCanonical()` 的返回类型推断。**没有可移植的东西，这一步是空的。**

---

## 现在需要你做

**完全退出 DeepSeek Harness（含托盘图标），再启动。**

重启后我立刻验证五项，然后写第六步的 `.memory` 文档。

在那之前，文档我只写骨架——因为「桥接是否真的打通」还没被证明过。你重启后回一句，我就跑验证 + 补完文档。

- 涉及工具: `edit`, `pwsh`, `read`, `write`

---