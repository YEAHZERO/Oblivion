# Oblivion-LAYOUT · 轮 14

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

直接开 R1（含 API 形状提案）
三处判断对、一处偏保守、一处漏了一条比认证更值钱的东西。
Part A · DSH 源码核对
基路径 C:\Users\liveu\dev\dsh-ref\versions\0.2.0-rc.2\
① admit() 的完整职责
快照：src\dsh-client-connection\lib\index.js
// :586-589
requestRejection(request) {
    if (!isTrustedApiRequest(request, this.trustedHosts)) return 403;
    return this.browserAuth.isAuthenticated(request) ? void 0 : 401;
}
// :591-594
admit(request) {
    const rejection = this.requestRejection(request);
    return rejection === void 0 ? { peer: this.operator } : { rejection };
}
调用点 :646-655：HTTP 路由 handler 里 admit → rejection → writeHead + 401?"unauthorized":"forbidden"；通过 → bridge(req,res,fetchHandler)。
1a. browserAuth 来源：不是 dsh-authorization
BrowserAuth 类就在同文件 :348-451。
dsh-authorization/lib/index.js:58 是 AuthorizationService —— 那是交互式授权流程（registerFlow/begin/attempt/settle + AuthorizationDeclinedError），跟 cookie 认证两码事，别照错包。
BrowserAuth 形状（:343-451）：
方法	行	行为
authenticatedUrl(baseUrl)	:374-378	url.searchParams.set(TOKEN_QUERY, this.launchToken)
authorizeIndex(req,res)	:388-427	带 token + GET / + authority 合法 + tokenMatches → 303 → ./ + set-cookie（authority-bound）；已有合法 cookie 也 303；否则 401
isAuthenticated(request)	:433-443	decodeCookie(value, secret) → payload.authority !== authority 拒 → 时间窗 issuedAt <= now < expiresAt 且跨度 ≤ maxAge
writeUnauthorized	:444-450	401 + "dsh web authentication required; reopen the URL printed by dsh web.\n"
secret：initializeSecret(credentials) :366-368，持久 credential provider，首启创建
launchToken：processLaunchToken(processOwner) :354，跨 Connection reload 不变
cookie 名按 authority 分（cookieName(authority) :407）→ hostname 一变 cookie 名也变
303 跳 ./ 的作用是把 token 从 URL 上抹掉（刷新不会重复换）
1b. ⚠️ 你漏的：admit() 返回的 peer 不是围栏事实，是身份
{ peer: this.operator } —— OperatorPeer（:519-544）：
/** The operator Peer: the one party this Host answers to. Connection owns it
* for its own lifetime, admits every request as it, and hands it to each
* Remote call as `invocation.peer`. */
var OperatorPeer = class { id = randomU

> （已截断，原长 14915 字符；问题全文见会话原始日志）

## 回答

收到全部核对意见。先建账本，然后按「最优先 = 1c `sec-fetch-site`」开 R1。

**Progress: 0/6**

| # | 验收项 | 文件 | 验收证据 |
|---|---|---|---|
| R1-a | 围栏补第三条 `sec-fetch-site` | `webserver/fence.ts` | 新用例：跨站 GET（**无 Origin**）→ 403；`same-origin`/`none` → 200 |
| R1-b | `peer` 语义注释改为「身份占位」 | `webserver/fence.ts` | 代码注释 + 0 消费方说明 |
| R1-c | API 形状提案 | `ARCHITECTURE.MD` §5.8 | 信封 / 端点 / 415 / e2e 口径 |
| R1-d | ERRATA：gzip filter 四条、index 注入形状、同长度前缀、包粒度、sec-fetch-site | ERRATA 台账 | 五条登记 |
| R1-e | 实现 `/api` 一元端点 + UI 一次 `fetch` | core + App | 实机 `POST /api` 往返 + e2e |
| R1-f | 决策 4：`webStartup` 服务替掉临时 ⑤ 层 patch | core + profile | 层账目恢复稳定 |

Parse error (a stray backtick). Let me write the ERRATA block with plain quoted strings instead.

明白 —— 与 DSH 的 3080 区分开。改默认端口为 **42081**。

`git grep` can't see untracked files — let me scan the working tree directly and apply the change.

**改端口暴露了一个潜伏 bug**：`keepAlive=false` 时插件仍在监听 —— 以前默认 3080 被占、listen 失败所以没暴露；42081 空闲后它真的监听起来，测试进程就永不退出。

Port confirmed on **42081**, but the build broke. Let me see the error.

Two servers ended up running (the kill hadn't released the port). Let me collapse to one on 42081.

Windows kills the pwsh job but not its child node process — orphan servers still hold 42081. Let me clean those up.

端口已设为 **42081**，服务单实例运行：**http://127.0.0.1:42081**（后台任务 `pwsh-11`）。

## 一、端口改动（DEC-023）

`3080` → `42081`，共 15 个文件（配置 / CLI 默认值 / profile / 监控 / 文档 / 环境变量样例 / CHANGELOG 未发布段）。

**刻意保留 3080 的地方**：`.design/` 与 ERRATA 里所有**引用上游**的位置 —— 那些 3080 是「DSH 的事实证据」，改成 42081 就是伪造证据。profile 里加了注释写明这个区分：

```yaml
# 端口 42081 是**本项目自己的选择**，与上游 DSH 的 3080 区分开：
# DSH 默认 3080（dump-config-web.yaml 的 `?? 3080`），那是它生态的事实标准；
# 我们与它同机共存时要避免撞端口，所以不沿用。引用里的 3080 一律仍指上游。
```

裁定写入 §25：**DEC-023 | web 默认端口 | Confirmed（42081）**。

## 二、改端口时**暴露了一个潜伏 bug**（值得单独说）

改完后 `npm test` 卡死。根因：

> `keepAlive=false` 时，webserver 的**行仍在组合树里**，插件照常 `listen` —— 我把进程按住了。**以前默认 3080 被你的常驻 node 进程占用**，`listen` 失败所以「看起来正常」；**改成空闲的 42081 后，它真的监听起来**，`node --test` 就再也不退出。

我上一轮写的「只在 keepAlive 时开服务」只守住了 CLI 注册 fallback 那一段，**没守住插件本身**。真实修法（已实施）：CLI **总是**写 ⑤ 层覆盖，`keepAlive=false` 时把 `webserver` 行 **`disabled: true`** —— 而不是「不写覆盖」，因为那样**层账目会随 CLI 路径变化**，违背 §11.1「层构成不携带加载语义」的契约。

这是一类典型：**端口被占反而是保护色**。已写进 daily。

## 三、R1 进展（Progress: 4/6）

| # | 验收项 | 状态 | 证据 |
|---|---|---|---|
| R1-a | 围栏补 `sec-fetch-site` | **done** | 单测 4 条新断言全过；**实机** `cross-site` → **403**（修复前 200）、`same-origin`/`none` → 200 |
| R1-b | `peer` 语义改为身份占位 | **done** | 类型注释改写 + 注明「全仓 0 消费方」；约定做 `/api` 前不再改签名 |
| R1-c | API 形状提案 | **done** | `ARCHITECTURE.MD` **§5.8**：单端点 `/api` + `{id,endpoint,payload}` 信封 + 强制 `application/json`（否则 415，顺带挡 `<form>` 跨站简单请求）+ `claimsEndpoint`（恰好 2 段 / `$events/result` 恒真）+ 最小端点 `core/status` + UI 一次 `fetch` + e2e 口径 |
| R1-d | ERRATA-51~56 登记 | **done** | `ERRATA-51` sec-fetch-site（已修）· `52` gzip filter 四条（**`text/event-stream` 不压**是将来硬需求）· `53` index 注入形状（抄数据形状不抄事件时机，6 row / 2 placement / 双渲染器 / `READY_MARKUP`）· `54` 同长度前缀（上游靠注册序隐式决胜、未做冲突检测）· `55` 包粒度（拆包触发条件）· `56` `peer` 语义 |
| R1-e | `/api` 一元端点 + UI 一次 `fetch` | **pending** | 形状已定，实装未做 |
| R1-f | 决策 4：`webStartup` 服务替掉临时 ⑤ 层 patch | **pending** | 需先核 `!!js` 的求值作用域能否拿到 `ctx` |

**你的核对里我采纳的四条判断**：`sec-fetch-site` 是第三条（已修，最优先）· 路由边界的 `prefix + '/'` 我**本来就是对的**（`pathname === prefix \|\| startsWith(prefix + '/')`）· gzip 延后但 filter 四条登记 · 包粒度不独立 · 端口不沿用 DSH。

**一处我要坚持的更正**：`provide(` **不是 0** —— `ctx.provide(SERVICE_NAME, server)` 在 `webserver/index.ts:341`，**服务名是变量**，按字面量 grep 会漏。上一轮 ERRATA-49 我已改正并标注。**这个更正对你后面的判断有影响**：你说「mux 装不上（provide = 0）必须先解决」—— 实际上 `ctx.inject(['connection','webServer'])` 里的 `webServer` **已经能注入了**，mux 缺的只是 `connection`。

另外你观察到的 `#impl` 报错**不是并发半成品**，是**真 bug**：Cordis 把服务实例包进追踪代理，私有字段有品牌检查 → 经代理访问必抛。已改为公开字段 `implementation`（注释写明原因）。你的怀疑方向对（「服务从没被真实消费者取用过」），只是结论不同。

## 四、门禁

```
build 0 · typecheck 0 · lint 0 · npm test 658/658 绿
42081：GET / 200（令牌 CSS 在脚本前 ✓）· CSP ✓ · /healthz 200 · /metrics 200
       Sec-Fetch-Site: cross-site 403 · Host: evil.example 403 · /../package.json 404
```

顺带清掉了**三个孤儿 node 进程**（Windows 上 kill pwsh 任务不会杀掉它的子进程，导致 42081 一直被占、新实例反复退避到随机端口）。

## 五、下一步

**R1-e/f** 就是最后两块：`/api` 一元端点（按 §5.8 的形状）+ UI 一次 `fetch` + e2e（DEC-022 要求同批带）。要我现在接着做完，把 R1 收口吗？

- 涉及工具: `run_code`

---