#  · 轮 2

- 来源会话: `session-db504efc-b898-403a-becb-e934c3faa6d2`

## 问题

查看这个方案：# Oblivion C 方案完整设计书

## 结论

把 bridge 并入 `@oblivion/core`，**一个插件包承载全部能力**：六模块认知层 + 一个 MCP 端点。DeepSeek++ 扩展填 URL + token 即可，零安装 Native Host。

```text
DeepSeek++ 扩展
   │  POST http://127.0.0.1:<DSH_PORT>/oblivion/mcp
   │  Authorization: Bearer <token>
   ▼
@oblivion/core（单插件）
   ├── bridge/     MCP 分发 + 回环校验 + token 校验
   ├── knowledge/  JSON 文件存储 + 四层筛选
   ├── qa-loop/    turn/end 捕获 + 防回灌
   ├── perspective/ 风格感知 + 维度追踪 + 激荡
   ├── feedback/   👍/👎/⏺ + 画像微调
   ├── graph/      共现边 + 惰性衰减
   └── profile/    用户思维档案
```

---

## 一、边界

### 做什么

| # | 能力 |
|---|---|
| 1 | 问答即生长：`turn/end` 自动捕获、筛选、沉淀、建边 |
| 2 | 浏览器入知识库：扩展推 `oblivion_capture_page` |
| 3 | 认知陪伴：风格感知 + 扩展视角 |
| 4 | 本地优先：JSON 存储、127.0.0.1 回环、无外网 |

### 不做什么

| 不做 | 原因 |
|---|---|
| 不 Fork DSH | DEC-024 |
| 不装 Native Host | C 方案走 HTTP |
| 不引入 SQLite / 向量切片 | 沿用 JSON 文件 |
| 不跑 cron / Worker | 时间逻辑惰性计算 |
| 不暴露第 2 个工具 | C 方案只留 `oblivion_capture_page` |
| 不做反向通道 | DSH 不主动抓浏览器 |
| 不做 Origin 白名单 | 回环 + token 已够 |

### 依赖

```yaml
inject: ['tools', 'llm', 'systemPrompt', 'session', 'webServer']
```

---

## 二、目录结构

```text
packages/oblivion-core/
├── package.json
├── tsconfig.json
├── cordis.patch.yml
├── README.md
└── src/
    ├── index.ts                # apply(ctx)
    ├── config.ts               # Config + DEFAULT_CONFIG
    ├── prompt.ts               # OBLIVION_SYSTEM_PROMPT
    ├── tools.ts                # DSH 内部工具注册（capture/query/profile/feedback/neighbors）
    ├── knowledge/
    │   ├── index.ts
    │   ├── store.ts            # JSON 文件读写
    │   ├── search.ts           # 关键词 + 共现扩展
    │   ├── filter.ts           # 四层筛选
    │   └── conflict.ts         # 冲突记录
    ├── qa-loop/
    │   ├── index.ts
    │   ├── extract.ts
    │   └── md-writer.ts
    ├── perspective/
    │   ├── index.ts
    │   ├── sensor.ts
    │   ├── tracker.ts
    │   ├── maker.ts
    │   └── adapter.ts
    ├── feedback/
    │   ├── index.ts
    │

> （已截断，原长 15528 字符；问题全文见会话原始日志）

## 回答

审阅完成。报告在 [oblivion-C方案-审阅报告.md](oblivion-C方案-审阅报告.md)。

**总体判断：方向对，协议设计基本可用，但 DSH 侧有 4 处硬错误会让代码直接抛异常，另有 2 处影响交付的遗漏。**

## 验证为正确的部分

- **C 方案选型成立**。扩展的 `streamable_http` 传输就是直接 fetch（`background.js @807389`），`Vr(e)`（`@799636`）把 `secrets` 里 `kind:'bearer'` 展开成 `Authorization: Bearer`。所以「填 URL + token，零安装 Native Host」这条路完全走得通。
- MCP 方法分发骨架、无 `id` 即通知、`{content:[{type:'text',text}]}` 返回形状，都与扩展侧解析器（`e?.id ?? e?.result?.id`）兼容。
- `inject` 的五个服务名都真实存在。
- 回环集合含 `::ffff:127.0.0.1` 是对的——Windows 上漏了它会导致本机请求全被 401。

## 4 处会直接炸的错误

**1. `webServer.register` 签名错。** 真实类型是 `WebRoute = {kind:'exact'|'prefix', path, handler}`（`dsh-host-webserver/index.d.ts:31-39`），**根本没有 `method` 字段**，方法判断得写在 handler 里（官方 `dsh-webhook-github/lib/index.js:112-115` 就是这么做的）。`path` 也不能带尾斜杠。

**2. `systemPrompt.section` 字段名错。** 是 `{name, order, text}`（`dsh-system-prompt/index.d.ts:47-54`），不是 `content`，且 `name` 必填。另外 `order: 50` 位置太低——按中央分配表会插在「部署人设」和「计划策略」之间，建议 `3150`。

**3. `${env:OBLIVION_BRIDGE_TOKEN}` 这个语法 DSH 不存在。** 快照里 `${...}` 零命中。要么用 `!!js process.env.X`（但会泄进 `--dump-config`），要么按 DSH 惯例存变量名 + 运行时 `ctx.credentials.resolve(credentialRef(name))`。

**4. MCP 版本号 `2024-11-05` 过时**，现役 shell host 是 `2025-06-18`。

## 2 处影响交付的遗漏

**`webServer` 只在 web-app 组合里存在**（不在 dsh-base）。所以现在这个 `inject` 列表意味着：**无头/SDK 模式下 `@oblivion/core` 整包不激活，认知层一起失效**——`inject` 缺服务是静默不激活，不报错。建议拆成 core + `@oblivion/http-bridge` 两个包。

**`turn/end` 事件不带问答内容**，只有 `{turn, reason}`（`dsh-session/types.d.ts:262-276`）。自动捕获必须走 `session/event`，用 `user/message` 记问题，助手回答要另行从事件日志取，否则 `qa-loop` 拿到的是空数据。

CORS/OPTIONS 设计书完全没写：好消息是扩展有 `optional_host_permissions`，授权后绕过 CORS；坏消息是用户拒绝授权时会以 `mcp_network_error`（"Cannot reach MCP server…"）这种误导性错误失败，建议文档强调首次权限弹窗，并顺手加 OPTIONS 204 防御。

报告里给了修正后的 `package.json` / `cordis.patch.yml` / `lib/index.js` 可直接替换的骨架，以及落地顺序调整（新增「先定拆包」这一步）。

- 涉及工具: `compress`, `grep`, `pwsh`, `read`, `skill`, `write`

---