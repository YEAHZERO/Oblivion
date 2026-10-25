# Oblivion-LAYOUT · 轮 12

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

先看这些意见，剩下的问题回复稍等，先按如下进行修改架构书和TODO：意见（按对齐 DSH 的优先级）
1. 最大的洞不是安全，是「有壳无信道」
register() 生产环境只被调用 3 次：/healthz、/metrics、static fallback（cli.ts:465/473/498）。registerUpgrade() 生产调用 0 次（只有测试里调）。UI 侧 fetch( = 0、WebSocket = 0、EventSource = 0。→ /api 探测 404。
三席位、围栏、profile 行、dump-config 全齐，唯独没有任何业务流量穿过它们。意见：下一步不要再扩包或补安全，先把一条 /api 业务路由 + UI 一次 fetch 打通，让已有围栏真的拦截到真实流量。DSH 的 registerUpgrade 全仓也只有 1 个调用方（dsh-api-gateway → /api/remote.mux），说明这层本就该薄——但薄不等于零。
2. 通道形状：建议照 DSH 双通道，别退回 SSE
理由很具体：webserver/index.ts:221 的 upgrade 路径已经调了 fence.admit()，Origin 同源校验也在——这正是为 WS 准备的。改用 SSE 等于把已建的 upgrade 席位 + 围栏闲置。而且 DSH 自己也只在 HMR 和出站 LLM 用 SSE，UI 主通道是 mux。
建议顺序：先补 HTTP /api 单元 RPC（覆盖面 80%）→ 再补唯一 WS mux。别一上来就做 mux，streamInboxBytes 上行缓冲、双向流语义那套是第二阶段的事。
3. webServer 是「承诺了但没进 DI」的典型——和你之前说的 --trusted-host 旗标是装饰，同一类病
webserver/index.ts:33 声明 export const SERVICE_NAME = 'webServer'，文档注释承诺"消费者通过 inject: ['webServer'] 拿到它"。但：
- 全仓 provide( = 0，extends Service = 0
- DSH 是 var WebServer = class extends Service（dsh-host-webserver/lib/index.js:139），服务是 cordis Service，靠 DI 注册
- createWebServer() 返回普通对象，由 cli.ts 在 runProfile 之后手动创建（run.ts:41 自己写了"CLI 的静态服务就是"）
→ 这个 service 名从没进过 cordis。SERVICE_NAME 现在是死常量。意见：要么改成 class extends Service 让它真被提供，要么把 SERVICE_NAME 和那句文档承诺删掉。留着会误导下一个读代码的人。
4. 13 个 pending 的根因在 registry.json，不在代码
inject 声明的是 knowledge / command / ui / llm / session / tools 六类，六类都没有 provider。这不是"插件还没实现"，是服务契约本身没人认领。意见：先给这六类各定一个最小 provider（哪怕 provider 内部就返回 stub），让 boot() 的 等待依赖 13 归零——否则你永远无法区分"还没做"和"接线错了"。
5. profile ↔ registry 的不一致被一条测试正式豁免了
profiles/web/cordis.patch.yml 有 id: webserver，registry.json 的 26 个 rowId 没有 webserver，于是 tests/unit/yaml-validity.test.mjs:160 写了 const foreignPrefixes = ['webserver', 'web-app'] 放行。
这和你另一个提交 f1dc68194（"锁死『声明了不存在的路径』这类 bug"）是同一类问题、相反的口径——一边锁死，一边白名单。意见：要么补 registry row，要么把白名单从测试代码挪进 registry.json 当数据。留在测试里等于把例外写死在最不该写死的地方。
6. 26 个包里 24 个是 void ctx;，这是反着学 DSH
DSH 的 287 个微包是每个包都有实现的产物。Oblivion 只有 oblivion-core（20 src / 3046 行）和 oblivion-web-ui（57

> （已截断，原长 3012 字符；问题全文见会话原始日志）

## 回答

这些意见我逐条接受 —— 先把架构书与 TODO 落定，不动代码。让我按仓库纪律（ERRATA / DEC / OPEN / RISK / §20）登记。

九条意见我逐条接受，已按仓库纪律全部落定 —— **没有动代码**，只改架构书与 TODO。

## 一、改了什么

| 位置 | 内容 |
|---|---|
| [ARCHITECTURE.MD](.design/ARCHITECTURE.MD) **§5.7（新增）** | Web 通道的落地顺序裁定：先 HTTP `/api` 单元 → 再唯一 WS mux，**不退回 SSE**，附三条理由 |
| 同上 **§20** | 变更日志追加 **v4.0.5** |
| 同上 **§25 决策表** | **DEC-017~022** 六条 |
| [ERRATA-v4.0.1-draft.md](.design/ERRATA-v4.0.1-draft.md) **P 节（新增）** | ERRATA-49/50 + 九条对照表 + 本批新增的 OPEN-112 / RISK-125 |
| [TODO.md](.memory/TODO.md) **R 节（新增）** | R1~R9 执行顺序 + 九条意见状态表，并写明 **R 节优先于 §C 路线图的 Phase 2/3 功能推进** |

## 二、六条裁定（DEC-017~022）

- **DEC-017 通道落地顺序** —— 先 HTTP 单元（覆盖面约 80%），再 mux。不退回 SSE 的理由：`src/webserver/index.ts:221` 的 upgrade 路径已经调了 `fence.admit()`，Origin 同源校验也在，**这套正是为 WS 建的**；改 SSE 等于把 upgrade 席位与围栏一起闲置。DSH 自己也只在 HMR 与出站 LLM 用 SSE。
- **DEC-018 六类服务的 provider** —— `knowledge` / `command` / `ui` / `llm` / `session` / `tools` 各定一个最小 provider（内部可返 stub），让「等待依赖 13」归零。你这条点得最准：**根因在 registry 的服务契约，不在插件实现** —— 不解决就永远分不清「还没做」和「接线错了」。
- **DEC-019 例外挪进 registry 当数据** —— 不允许把 `foreignPrefixes = ['webserver', 'web-app']` 写死在测试里。和「锁死『声明了不存在的路径』」那次提交**口径相反**，这个矛盾必须消掉。
- **DEC-020 停止按 DSH 粒度铺新包** —— 26 包里 24 个是 `void ctx;`；能力先做在 core 内部。**RISK-125** 同时登记：那套账本（registry + structure.contract + 一致性测试）的维护成本已超过它防住的 bug。
- **DEC-021 CSP** —— 与上游一致不做文档级 CSP；但把 Electron 那条顺手抄到 `static.ts` 的静态响应，**不扩成安全专项**。
- **DEC-022 通道落地同批带 e2e** —— 否则 `upgrades` 表的「单 socket 单协议独占」只在单测里活着。

## 三、两条 ERRATA（文档承诺与事实不符）

- **ERRATA-49**：`webserver/index.ts:33` 导出 `SERVICE_NAME = 'webServer'` 并承诺「消费者通过 `inject: ['webServer']` 拿到它」，但全仓 `provide(` = **0**、`extends Service` = **0**，`createWebServer()` 返回普通对象由 CLI 手动取用 —— **这个服务名从没进过 Cordis，`SERVICE_NAME` 是死常量**。按你说的**二选一**（改 `class extends Service` 让它真被提供 / 删掉常量与承诺），我**没有替你选**，标为待裁定 —— 因为它牵连 DEC-018 的六类 provider 形状，两者应该一次定。
- **ERRATA-50**：profile↔registry 不一致被 `yaml-validity.test.mjs:160` 的白名单正式豁免。

## 四、你的第 1 条我补了一段实测证据进 §5.7

> `register()` 生产只调 3 次（`cli.ts:465/473/498`：`/healthz`、`/metrics`、static fallback），`registerUpgrade()` 生产 **0** 次，UI 侧 `fetch`/WS/EventSource 全 **0**，`/api` 探测 404。

并写成判据：**下一步不是「又加了一个包」，而是让已有围栏拦到真实流量。** 那句对照也记了 —— DSH 全仓 `registerUpgrade` 也只有 1 个调用方（`api-gateway → /api/remote.mux`），这层**本就应该薄，但薄不等于零**。

## 五、我没有替你做决定的两处

1. **ERRATA-49 的二选一**（进 DI / 删承诺）—— 建议和 DEC-018 一起定，因为「服务怎么进 DI」的形状应当全仓统一，否则六个 provider 会各写一套。
2. **DEC-020 的账本重估幅度** —— 是「不再为新包铺账本」还是「连现有 26 条也收缩」，这是范围决策。我只登记了 RISK-125 与「停止铺新包」这个方向。

其余七条我都按你的意见落成了 Confirmed 裁定；`R1~R9` 的执行顺序写在 TODO 的 R 节里，等你回完之前那批问题（浏览器认证 / 路由级 gzip / 独立包 / 默认端口 / CSP 范围），就从 **R1** 开始动手。

- 涉及工具: `run_code`

---