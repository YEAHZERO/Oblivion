# # Oblivion 的功能设计考虑 我按* · 轮 5

- 来源会话: `session-b7218394-e243-46e6-9baf-bad738d8a61b`

## 问题

如果有冲突列出来，然后分子代理完成：DSH vs Oblivion · 10-04 对比
DSH @deepseek-ai/dsh@0.2.0-rc.2（参考库 versions/0.2.0-rc.2）
Oblivion HEAD 17849ce8c（10-03 02:08 未变，但工作树 77 modified + 150 untracked —— 大量工作未提交）
一、自上一轮（10-03）的变化
 	10-03	10-04
provide(	0	23
boot 等待依赖	13	0
boot 已加载	11	25
/api 探测	404	协议层全通
UI fetch	0	App.tsx:92 + chat-client.ts:53
fence 判据	Host + Origin	+ Sec-Fetch-Site
CSP	无	static.ts:126-128
测试	19 文件 / 657 pass	45 文件 / 901 pass
core 源	20 文件 / 3,046 行	31 文件 / 4,867 行
web-ui 源	57 / 6,389	71 / 8,577
上一轮我的三条优先建议，全部已落地：sec-fetch-site（1c）、/api 单元 RPC（意见 1）、CSP（决定 6）。
二、规模
 	DSH	Oblivion	比
包数	287（src 284，manifest 287）	26	11:1
源码	391 文件 / 187,338 行 js	176 文件 / 28,347 行	6.6:1
有实现	287/287	19/26（7 个仍 void ctx;）	—
核心	—	core 4,867 + web-ui 8,577	—
Service 数	74（super(ctx,"name")）	12 个服务名	6:1
ctx.inject(	53	0（靠 registry 静态声明 + export const inject）	—
ctx.provide(	15	23	反超
测试	参考库 0（源码快照，不含测试，不可比）	45 文件 / 901 pass 0 fail (5.1s)	—
仍空壳的 7 个：adapter-dsh · adapter-obsidian · desktop-host · dump-config · graph-growth · knowledge-vector · qa-loop
（最小 23 行，只有 export const inject + 空 apply）
三、架构逐维（核心）
维度	DSH	Oblivion 现状	判定
HTTP 单元 RPC	/api + claimsEndpoint + dispatchRpc	✅ 已通（core/src/api/index.ts 7,102B）	平
WS 流 mux	/api/remote.mux，registerUpgrade 2 处	❌ 0 生产调用（4 处全是定义/委托）	缺
围栏	Host + Sec-Fetch-Site + Origin	✅ 三判据齐（fence.ts:177-197）	平
认证	browserAuth：token→cookie→401	❌ 无（你已裁定不做）	按裁定
DI	74 Service + 53 inject	23 provide、0 pending、extends Service 0	形状不同
配置组合	5 层 + !!js ctx.webStartup	28 层、--dump-config warnings: []	基本平
gzip	主路径统一 + filter 4 条	只 fallback 预压缩	落后
index 注入	6 种 row + 双渲染器	构建期内联令牌	落后（按裁定延后）
流式	心跳 2s/2miss、UplinkInbox 256KB、$events/result	❌ 未做	未开始
CSP	无文档级（仅媒体 sandbox）	✅ default-src 'self'	反超
e2e	—	tests/e2e/ 只有 .gitkeep	缺
四、实测：/api 协议层（我刚打的）
请求	结果	 
GET /api	405 api/method-not-allowed	✅
POST 无 content-type	415 api/unsupported-media-type	✅
POST 1.2 MB body	413 api/payload-too-large	✅
Sec-Fetch-Site: cross-site	403	✅
POST {endpoint:"core/status"}	{"ok":true,"value":{"rows":{"loaded":25,"pending":0

> （已截断，原长 5318 字符；问题全文见会话原始日志）

## 回答

先盘点现有状态，再分子代理。

冲突盘点完毕，然后分子代理。

**冲突清单：**

| # | 冲突 | 处理 |
|---|---|---|
| 1 | 用户分析列"7 个空壳"含 qa-loop，今日已完成 → 实际剩 **6 个** | 更新待办，qa-loop 从列表移除 |
| 2 | 每日日志 `645 条` vs 实际 `912 条` | 已修正（上一条回复里修了） |
| 3 | 用户分析写"10-04 HEAD 17849ce8c（10-03 02:08 未变）" | HEAD 确实没变——工作区变更未提交，对比基线合理 |
| 4 | 分析中说"/api 层零测试" | ✅ 属实，正是本次要补的第一件事 |
| 5 | 分析中列的推荐排序与 Phase 6 优先级 | 互不冲突——api.test 是独立文件，不阻塞 graph-growth |

---

现在分三组并行：

- 涉及工具: `glob`, `job_list`, `job_output`, `pwsh`, `read`, `subagent`

---