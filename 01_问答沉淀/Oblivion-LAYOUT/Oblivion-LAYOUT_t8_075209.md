# Oblivion-LAYOUT · 轮 8

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

开始1-5，然后给出哪些需要我去查看dsh的源码的，哪些需要我做决定的，我需要能看到web的效果

## 回答

Starting 1–5. First I need the house style for a plugin package and how services are provided.

Now the critical API surface — how Cordis provides services and how rows get mounted.

The API is `ctx.provide(name, value)`. Now let me write the webserver plugin (fence + seats + static fallback).

Backtick in a doc comment broke the template. Let me use a placeholder and write all three modules.

My guard checked post-replacement content. Let me fix it and write both modules.

Now the plugin itself — seats, service registration, and the server.

Now I need the exact current wiring to replace it.

Now the metrics module, barrel wiring, and the profile row.

Now rewiring the CLI to drive the plugin (the ⑤ `--patch` layer carries the flags).

Build is clean. Now the version-constant move needs the bump script and test updated.

Now the test suite for the new plugin.

One bad assertion in my own test. Let me fix it and run the full gates.

Five expected fallout failures — and one real bug: `<pkg>/<subpath>` plugin names aren't resolvable. Let me fix the resolver and the tests.

All gates green (657/657). Now let me start it so you can look at it.

Running at **http://127.0.0.1:18128** (3080 was occupied; the pre-flight probe fell back). Let me verify the whole path.

全部做完，服务已在跑 —— **http://127.0.0.1:18128**（3080 被占用，预检自动退避到随机端口）。

## 一、1–5 落地情况

| 步 | 结果 |
|---|---|
| ① 宿主编 + 三席位 + schema | `packages/oblivion-core/src/webserver/index.ts`（345 行）：`register` / `registerUpgrade` / `registerFallback` 三席，重复注册**抛错**；未注册的 upgrade 直接 `socket.destroy()`；`host` 是 `'127.0.0.1' \| '0.0.0.0'` 字面量联合（§14.4 第①层） |
| ② `trustedHosts` 归启动器 | 落在 Config 里但**由 CLI 注入**，插件只消费 —— 与快照 `dump-config-web.yaml:493-497` 的归属一致（我上一轮报的偏差） |
| ③④ `admit()` 一族 | `src/webserver/fence.ts`（183 行）：`isLoopbackHostname` / `parseAuthority` / `assertTrustedAuthority` / `isTrustedAuthority` / `resolveLanTrust` + Origin 同源。**HTTP 与 WS 升级共用同一道 fence** |
| ④ 静态投送到 fallback 席 | `src/webserver/static.ts`（153 行）：路径穿越防御、MIME、预压缩缓存；`serve.ts` **删除**，指标移到 `src/metrics.ts`，版本常量移到 `src/version.ts`（避开 `cli↔index` 循环引用） |
| ⑤ 测试 | 新增 `tests/unit/webserver.test.mjs` **11 条**（三席位互斥、围栏 6 种伪造写法、Origin 同源、WS 升级被围栏拦、gzip 协商、端口释放）；测试总数 **645 → 657** |

**实机验证**（在跑的 18128 端口上）：

```
/              200  令牌 CSS 在 <script> 之前 ✅  427 令牌 ✅
/app.js        200
/healthz       200  ok
/metrics       200  web_ready 1 · requests_total{status="2xx"} 4 → 7（计数在涨）
/../package    404
Host: evil.example        403  Host 不在信任列表：evil.example
Host: 0x7f.0.0.1:18128    400  Host 头非法
Origin: http://evil...    403       Origin 同源 → 200
```

启动横幅也变了：`组合行 27（层数 29）· 已激活 11 · 失败 0`，而且**那两条常驻警告消失了**（profile 现在自己 insert，不再改写不存在的 id）。

门禁：`build 0 · typecheck 0 · lint 0 · npm test 657/657 绿`。

**你现在能看到的**：三栏帧（栏宽每帧由 `computeColumns()` 求解 —— 拖窄窗口就能看见让步顺序）、亮/暗主题、以及 Modal + RiskConfirmation 的演示。⚠️ 内容仍是**样例数据**，不是真会话 —— 这一步补的是「送达 + 围栏」，UI 内容要等 Phase 2/3。

服务在后台任务 `pwsh-1` 里跑着，不看了就让我 kill。

## 二、需要你去查 DSH 源码的地方（我做了判断，但值不值得照抄由你定）

每条都给出快照路径，方便你直接核：

1. **`admit()` 的完整职责 —— 这是最大的一处**。我只实现了围栏；DSH 的 `admit()` 是 `requestRejection(request)` **加上浏览器认证**（`:588` 的 `browserAuth.isAuthenticated → 401`，以及 `authorizeIndex` :596、`authenticatedUrl` :600、进程 token 交换 / cookie）。
   → 查 `src/dsh-client-connection/lib/index.js:580-610` 与 `browserAuth` 的来源包。
2. **路由匹配细节**。我实现的是 exact + 最长前缀优先；`WebRoute.kind` 只有两种（已核对 `api/dsh-host-webserver/index.d.ts:30-39`），但**同长度前缀的冲突规则**我是自己定的。
   → 查 `dsh-host-webserver/lib/index.js` 里 `register` 之后的匹配顺序。
3. **gzip 中间件**。DSH 对「socket-backed HTTP 请求」统一压缩（`:258` 的 `this.gzip(req,res,next)`）；我只对 fallback 静态资源做了启动前预压缩，**注册路由的响应没有压缩**。
   → 查 `dsh-host-webserver/lib/index.js` 里 `gzip` 的来源与 header 过滤条件。
4. **index 注入表**（`webserver/index-inject` 事件 + `renderIndexInjections`）。DSH 让各插件往 `index.html` 注入片段；我们是构建期内联令牌，静态文件不做注入。将来多插件要注入 `<head>` 就得走这套。
   → 查 `api/dsh-host-webserver/lib/types/injections.d.ts` 与 `:19-27` 的事件声明。
5. **流式那块我先没做**：`$events/result` 走 HTTP 回执的混合路径、心跳 `websocketHeartbeatIntervalMs`、`streamInboxBytes` 溢出（`gateway/uplink-overflow`）的实现点。
   → 查 `src/dsh-api-gateway/lib/index.js:600-700`。上一步定的形状（unary `/api` + 单条 mux）不变，但要实现流式前值得先读。

## 三、需要你做决定的

| # | 决定 | 影响 |
|---|---|---|
| 1 | **要不要浏览器认证（browserAuth）** | 现在是「围栏 + 无认证」。围栏挡住浏览器侧的两条混淆代理路径（rebinding / 跨站），但**同机任何进程**都能直接连。若接受（单机自用 §0.5），就不做；若要做，就得引入进程 token + cookie，`admit()` 也会补齐 401 分支 |
| 2 | **路由级 gzip 要不要补** | 现在只有 fallback 有压缩。补成中间件约 60 行 + 一组 header 过滤用例 |
| 3 | **webserver 的包粒度** | 现在是 `oblivion-core/webserver` 子路径（第 27 行、层数 29）。若你要独立成 `oblivion-host-webserver`，会牵动 registry / 结构契约 / 版本一致性 / 文档**四类计数**（我可以做，但这是一次可见的改动） |
| 4 | **要不要引入 `webStartup` 服务** | 我用 CLI 写的**临时 ⑤ 层 patch** 注入 host/port/trustedHosts（顺带演示了「patch 替换整段 config」）。DSH 用 `ctx.webStartup` + `!!js` 注入。前者简单、后者更贴上游 |
| 5 | **默认端口** | 你机器上 **3080 已被占用**。要不要把默认改成别的（例如 3170），还是保持「占用即退避」 |
| 6 | **CSP** | 我按上游一致地降级（无文档级 CSP）。上游只在**媒体响应**上加 `sandbox; default-src 'none'` —— 知识库要落盘媒体，建议抄那条 |
| 7 | 设计书 §9.1「26 个能力包」口径 | 我选择**不新增包**，所以设计书没动。选 3 的话需要同步设计书 + v4.0.5 + DEC 记录 |

## 四、这轮记进台账的偏离（不静默改写）

1. **围栏位置**：DSH 在连接层（那层持有浏览器认证），我们在 webserver —— 已在 `fence.ts` 头注释写明「等 `oblivion-client-connection` 出现，本模块整体平移」。
2. **包粒度**：核心子路径而非独立包（同 §三.3）。
3. **压缩范围**：只覆盖 fallback（同 §三.2）。
4. **`resolvePluginEntry` 增强**：现在支持 `<包>/<子路径>` 解析（原先只按「包名 = 目录名」拼路径，`oblivion-core/webserver` 会以「找不到模块」失败 —— 这个 bug 是被 cli 集成测试抓出来的，已修）。

变更清单：新增 5 个源文件 + 1 个测试文件，删除 `serve.ts`，改动 `cli.ts` / `index.ts` / `boot.ts` / `package.json` / `profiles/web` / `bump-version.ps1` 与 4 个既有测试。**尚未提交**。

要我现在把这轮也写进 `.memory`（daily + alpha 增量 + 设计文档补充）并 kill 掉服务吗？还是先留着 18128 让你看？

- 涉及工具: `run_code`

---