# Oblivion-LAYOUT · 轮 13

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

按这些意见落实，ERRATA-49和DEC-020 按建议执行

## 回答

Let me verify the actual state before implementing.

Verified — and **one premise of ERRATA-49 is wrong**: `ctx.provide(SERVICE_NAME, server)` is at `webserver/index.ts:341`, so `provide` count is 1, not 0. I'll correct the ledger and still implement the Service refactor you approved.

All gates green. Now correcting the ledger record and restarting the server for the CSP change.

**The live run caught a real bug** the unit tests couldn't: Cordis wraps services in a tracing proxy, and `#impl` private fields fail the brand check through a proxy.

Fixed — running at **http://127.0.0.1:39537**. Final verification:

已按意见落实。**服务在 http://127.0.0.1:39537**（`pwsh-5`），657/657 绿。

## 一、你指定的两条

**ERRATA-49 → 按建议 (a)：`WebServer` 改成真正的 Cordis Service**

```ts
export class WebServer extends Service<never> implements WebServerService {
  readonly implementation: WebServerService;   // ← 见下方「真 bug」
  constructor(ctx, config = {}) {
    super(ctx, SERVICE_NAME);                  // 走基类的 ctx.reflect.provide(...)
    this.implementation = createWebServer(resolveConfig(config));
    ctx.effect(() => () => this.implementation.close());
  }
  // config / address / trustedHosts / ready / register / registerUpgrade / registerFallback / admit / stats / close 全部委托
}
export function apply(ctx, config = {}) { new WebServer(ctx, config); }
```

内部仍委托纯工厂 `createWebServer()`（测试与无 DI 场景照旧直用），与上游 `dsh-host-webserver/lib/index.js:139` 同形。

**但我必须纠正这条的前提** —— 你说「全仓 `provide(` = 0」，复核后不成立：

> `ctx.provide(SERVICE_NAME, server)` 就在 `webserver/index.ts:341`。**服务名是变量而不是字面量**，所以按「服务名字面量」grep 会漏掉它。服务确实注册在 fiber 上，`declare module` 的 `inject: ['webServer']` 类型也成立。

真实缺口只剩两条：①**没有任何消费者用 `inject:`**（CLI 走 `ctx.get(name, false)`，绕过可用性语义）；②未走 `Service` 基类，拿不到 `Service.check`。我把 ERRATA-49 的原文改成了正确前提 + 已落实，**没有把一句假事实留在台账里**。

**DEC-020 → 停止铺包 + 账本去硬编码（RISK-125 的应对）**

- `structure-contract.test.mjs` **不再断言包数**（硬编码数量每加一个包就要改，防住的 bug 是零），改为 **`packages/` 目录 ↔ `registry.plugins[].name` 交叉核对** —— 数量只在 registry 里说一次；
- `registry.json` 每个插件新增 **`implemented`** 标记（当前 **2 / 26**：core 与 web-ui）。账本从此能区分「契约骨架」与「已实现」，这是 RISK-125 的直接应对。

## 二、顺带落地的两条（同属这批意见）

- **DEC-019 / ERRATA-50**：白名单从测试代码挪进数据 —— `registry.foreignRowIds.ids`，`yaml-validity.test.mjs` 不再写死 `['webserver','web-app']`。
- **DEC-021**：静态响应加 CSP。实机已生效：
  ```
  default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:*
  ```
  顺手把 `connect-src` 的本机 WS 位留给了将来的 `/api/remote.mux`。

## 三、实机运行抓到一个单测永远碰不到的 bug

**这是本轮最有价值的产出**，也恰好印证了你第 1 条的另一面：

```
web 服务启动失败：Cannot read private member #impl from an object whose class did not declare it
```

根因：Cordis 把服务实例包进**追踪代理**（`ReflectService.trace/bind`），消费者拿到的 `ctx.webServer` 是代理，方法调用时 `this` 也是代理；而 `#impl` 这类**私有字段有品牌检查**，经代理访问直接抛错。

**为什么单测抓不到**：测试要么直接 `new`、要么直用纯工厂 `createWebServer()`，**从不经过 DI 代理**。换句话说 —— **服务从没被一个真实消费者取用过**。改成公开字段 `implementation` 后正常（公开字段经代理读是安全的），原因已写在字段注释上。

这一条我记进了 daily，没往 ERRATA 里塞（它是实现陷阱，不是文档矛盾）。

## 四、门禁与实机

```
test 657/657 · typecheck 0 · lint 0
GET /         200  text/html   CSP ✓  nosniff ✓  no-cache ✓  令牌 CSS 在脚本前 ✓
/healthz 200 ok      /metrics 200
/../package.json  404（穿越被挡）
Host: evil.example    → 403   Host: 0x7f.0.0.1:39537 → 400
```

## 五、这批里我**没做**的（各自需要一个完整回合）

| 项 | 状态 |
|---|---|
| **R1 一条 `/api` 业务路由 + UI 一次 `fetch`** | ❌ 未做 —— **这是下一步的起点**，判据是「让已有围栏拦到真实流量」。需要先定 API 形状（我倾向最小一元面：`GET /api/status` 返回 `{profile, version, rows, fence}`，UI 侧一次 `fetch` 显示内核状态） |
| **R2 六类服务各定最小 provider** | ❌ 未做（13 pending 的根治） |
| **R5 通道落地同批带 e2e**、**R6 WS mux**、**R8 index 注入形状** | ❌ 未做（R6 是第二阶段） |

架构书 §5.7 / §25（DEC-017~022）/ §20 v4.0.5、ERRATA 的 P 节、TODO 的 R 节都已就位，并标明 R 节**优先于** §C 路线图的 Phase 2/3。

要我下一轮直接开 **R1**（含 API 形状提案），还是先把 **R2** 的六类 provider 一起做了让 pending 归零？

- 涉及工具: `run_code`

---