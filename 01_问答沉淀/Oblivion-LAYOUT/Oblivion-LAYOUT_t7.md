# Oblivion-LAYOUT · 轮 7

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

一、直接回答：DSH 的 web 通道是双通道分工，SSE 不用于 UI
通道	归属包	用途	证据
HTTP /api	dsh-client-connection	单元 RPC（请求/响应信封），强制 application/json，否则 415	src/dsh-client-connection/lib/index.js:14 API_PATH="/api"、:679 415 判定；src/dsh-api-gateway/lib/index.js:624 connection.rpc.intercept("/api", …)
WebSocket /api/remote.mux	dsh-api-gateway	全部实时流，一条精确路由多路复用，双向	src/dsh-api-gateway/lib/index.js:11-12 注释「Exact WebSocket route carrying every Typert Remote stream」+ 常量；:179 new WebSocketServer({ noServer: true })；:631-642 注册
SSE	—	与 UI 无关	src/dsh-client-hmr/lib/index.js:126（开发热更）、src/dsh-llm-deepseek/lib/index.js:2196（出站调 DeepSeek 上游）
api/dsh-api-gateway/index.d.ts 把分工写死了：
Unary transport and response envelopes belong to Connection; live Remote streams use the Gateway-owned WebSocket mux.
两个容易踩的点
1. REMOTE_STREAM_MUX_PATH = "/api/remote.mux" 是唯一的（:12），事件流是它内部的逻辑流 REMOTE_EVENT_STREAM_ENDPOINT = "$events"（:14），不是第二条 socket。
2. $events/result 走 HTTP 回执（:18 注释）—— 所以 DSH 自己也是混合的，不是「一条 WS 包打天下」。
你的「Electron 走 IPC」顾虑可以解除
notes/04-deployment-profiles.md:105：
renderer/（13 文件）仅欢迎页与更新弹窗 —— 聊天 UI 不在这里，由 dsh-client-* 62 包经 web 服务提供
DSH 桌面形态没有为 UI 单开 IPC，与你 architecture.md §5.3 的「Desktop 也走这条 web 服务」完全一致 —— 这不是你的偏离，是上游同款。
二、webserver 那一行的真实形状（你要补的第 2 步）
versions/0.2.0-rc.2/dump-config-web.yaml:479-497：
- id: webserver
  name: '@deepseek-ai/dsh-host-webserver'
  inject: [ webStartup ]
  config:
    host:      !!js ctx.webStartup.host ?? '127.0.0.1'
    port:      !!js ctx.webStartup.port ?? 3080
    compression: gzip
    compressionLevel: 1
    compressionThresholdBytes: 1024
    trustedHosts: !!js ctx.webStartup.trustedHosts
注意 !!js ctx.webStartup.host —— host/port 是启动器注入的，不是配置文件写死。你的 CLI 静态服务改成宿主编时照这个形状，那条常驻警告自然消失。
api/dsh-host-webserver/index.d.ts 的 schema 就是你 §14.4 第①层：
export interface Config {
  host: '127.0.0.1' | '0.0.0.0';   // ← 字面量联合，schema 层收口
  port: number;                     // 0 = OS 分配
  compression?: 'none' | 'gzip';
  ...
}
static Config: z<Config>;
webserver 还是一张三

> （已截断，原长 5074 字符；问题全文见会话原始日志）

## 回答

Let me verify your evidence locally and find every IPC claim in the design docs.

`dsh-ref/src/` isn't at the top level — but the snapshot has its own `src/`. Let me locate your cited files properly.

Every citation checks out exactly — including line numbers. Let me pull the remaining shapes I'll implement against.

This task matches the DSH reference skill — let me load it before acting.

The skill confirms the store layout and the citation discipline. Let me verify the remaining claims at their real paths.

All citations verify. Let me read the exact regions I need to edit, plus one remaining claim.

All verified — including one discrepancy I'll flag. Let me apply the design-book correction.

The diagram replacement silently no-op'd (off-by-one in my span math). Let me redo it properly.

Diagram fixed with width conservation. Now the ERRATA entry and the memory records.

Same closing-marker mistake — `»` was never mapped. Let me fix it in the inserted ranges only.

Two problems: the footer line landed in a summary table, and my range check was backwards. Let me fix both.

你的纠正我逐条核过了 —— **全部命中，包括行号**。

## 一、核对结果：引文与快照逐行吻合

| 你的引用 | 快照实际 |
|---|---|
| `API_PATH="/api"` :14、415 :679 | ✅ `src/dsh-client-connection/lib/index.js:14`、`:679` |
| `isLoopbackHostname` :110-123 / `parseAuthority` :148 / `assertTrustedAuthority` :169 / `isTrustedAuthority` :192 / `admit` :591 | ✅ :121 / :148 / :169 / :192 / :591 |
| Host 是 rebinding 唯一无法伪造的头" :130-138 | ✅ :128-140，原文一字不差 |
| `REMOTE_STREAM_MUX_PATH` :12、`$events` :14 | ✅ `src/dsh-api-gateway/lib/index.js:12`、`:14` |
| `noServer` :179、升级时 `admit` :634 | ✅ :179、`:634` |
| `register` :177 / `registerUpgrade` :191 / 未注册 upgrade :280-283 | ✅ 另发现 fallback 是 `registerFallback`（:206-208），座席三张 |
| `streamInboxBytes` 262144 / `gateway/uplink-overflow` | ✅ `api/dsh-api-gateway/index.d.ts:23-24` |
| `notes/04:105` 聊天 UI 由 62 个 client 包经 web 服务提供 | ✅ 原文一致 |
| SSE 仅 HMR + 出站 LLM | ✅ `dsh-client-hmr` / `dsh-llm-deepseek:11,1775` |

**顺带一条有用的资产**：源码在 `dsh-ref/versions/0.2.0-rc.2/src/`，**不在**仓库根的 `src/`（根目录只有 `notes/ releases/ tools/ versions/`）。以后可以直接读实现，不必只读 `.d.ts`。

## 二、一处必须报告的偏差（快照胜）

你引的 `webserver` 行把 `trustedHosts` 也写进去了，但快照里它在**另一行**：

```yaml
# versions/0.2.0-rc.2/dump-config-web.yaml:479-497
- id: webserver
  name: '@deepseek-ai/dsh-host-webserver'
  config: { host, port, compression, compressionLevel, compressionThresholdBytes }   # 无 trustedHosts
- id: web-runtime
  name: '@deepseek-ai/dsh-web-app'
  config: { openBrowser, printUrl, surfaceContext, trustedHosts }                    # 在这里
```

含义：**监听参数归 webserver，信任名单归启动器**（后者经 `webStartup` 传给连接层）。照引文实现会把两者塞进同一个插件，围栏就拿不到名单。已按参考库纪律「快照胜」记入 ERRATA-48。

## 三、设计书已按裁定改完

| 动作 | 结果 |
|---|---|
| 删 §3.1 图的 IPC 表述 | 改为双通道事实（§5.3 成为唯一说法）；**ASCII 框行宽守恒**已断言，框未破 |
| §20 变更日志 | 追加 **v4.0.4** |
| §25 决策表 | **DEC-014**（通道形状）/ **DEC-015**（webserver 宿主编 + 三席位）/ **DEC-016**（唯一说法） |
| ERRATA 台账 | 新增 **`## O.` 章节 + ERRATA-48**，含逐条引用表（版本 + 路径 + 行号）与上述偏差 |

**我保留了 §5.6 的 IPC 表述**（`oblivion-app://` + MessageChannel），因为上游 `dsh-host-webserver` 头注释明写「Electron uses file:// plus IPC instead」—— 指的是**壳页**，不是业务 UI 的数据通道。所以 `apps/electron/src/ipc.ts` 也保留。这与你「让 §5.3 成为唯一说法」不冲突：唯一说法约束的是**业务 UI 的交付通道**。若你要连壳页那套也去掉，说一声。

安全围栏按实证**重新分级**：③④ 在 DSH 里是同一个 `admit()`，且同一道 fence 也拦 WS 升级 —— 覆盖两条通道。原先记的「③④各半天」作废，**工作量并入宿主编落地**。

## 四、记录落盘（`.memory` 按三步表）

- [每日日志](.memory/daily/2026-10-03.md) —— 新增「设计书校准 —— Web 交付通道裁定」小节；「遇到的问题」新增第 8 条（引文与快照不一致的活例），原第 8 条顺延为第 9 条；进行中/明日计划改为「先落宿主编 + 围栏」
- [web通道与webserver形态.md](.memory/design/web通道与webserver形态.md) —— 124 行决策记录，含**通道分工表 / 三席位表 / 四层围栏映射 / 测试策略 / 风险**，测试策略里写明「同一组围栏用例对 HTTP 与 WS 各跑一遍」以证明一处覆盖两条
- [TODO.md](.memory/TODO.md) —— 顶部记录裁定与依据

三份文件的 markdown 代码跨度已校验反引号成对（本轮我在这上面栽了两次，第二次是 `»` 没映射）。

## 五、门禁

```
lint 0 · typecheck 0 · npm test 645/645 绿
git status 52 条，其中 .design/.memory 出现 0 次（符合「本目录不入库」）
```

## 六、下一步（第 2 步已可开工）

按裁定形状落地 **Web 宿主编**：

1. 新包（宿主编）：`host`/`port`/`compression*` 入 schema（字面量联合收口第①层）、`register`/`registerUpgrade`/`registerFallback` 三席位、未注册 upgrade 直接 `socket.destroy()`
2. `trustedHosts` 留在启动器侧（CLI 的 `webStartup`），由它传给连接层
3. 实现 `admit()` 一族（`isLoopbackHostname` / `parseAuthority` / `assertTrustedAuthority` / `isTrustedAuthority` + Origin 同源），**HTTP 与 WS 共用**
4. 把现有 `serve.ts` 的静态服务改注到 **fallback 席**，顺手消掉 `webserver` 那条常驻告警
5. 测试：415、席位互斥抛错、Host 伪造（`0x7f.0.0.1`／百分号编码／非 punycode IDN）双通道各跑

要我现在开始第 1–5 步吗？还是先只做 1–3（宿主编 + 围栏，不含搬静态服务），把搬迁移到下一步？

- 涉及工具: `run_code`

---