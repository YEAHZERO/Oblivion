# @oblivion/http-bridge

Oblivion 的 **HTTP 传输层**：在 `127.0.0.1:42081` 开一个固定的 HTTP 端口，
让浏览器扩展（DeepSeek++）以 `streamable_http` 接入 `@oblivion/core` 的 MCP 端点。

**本包不含任何 MCP 逻辑。** 协议分发（`initialize` / `tools/list` / `tools/call` /
`ping` / 通知）与工具实现都在 `@oblivion/core` 的 `src/mcp/` 里；桥接只做
「HTTP 进、`handle(rawBody)` 出」。

```
DeepSeek++ 扩展 ──HTTP──▶ 127.0.0.1:42081/oblivion/mcp
                              │  Bearer $OBLIVION_BRIDGE_TOKEN
                              ▼
                        @oblivion/http-bridge          ← 只有传输：鉴权 / CORS / 体积 / 状态码
                              │  进程内通道：globalThis[Symbol.for('@oblivion/core/mcp')]
                              │  Map<owner, slot> → slot.endpoint
                              ▼
                        @oblivion/core                 ← 同一进程内的 MCP 端点
                          src/mcp/{channel,protocol,tools}.ts
                          （与 qa-loop、registerTools 用的是同一个 knowledge 对象）
```

## 它在插件组里的位置

| 包 | 角色 |
|---|---|
| `@oblivion/core` | 认知层：问答沉淀、画像、图谱、反馈、会话整理；**MCP 协议与工具面** |
| `@oblivion/http-bridge` | **本包**：把 core 的 MCP 端点接上一个固定的本机 HTTP 端口 |
| `@oblivion/panel` | 侧栏面板（客户端半边） |
| `@oblivion/vimc` | 键盘导航（客户端半边） |
| `@oblivion/brand` | 品牌资源 |
| `@oblivion/bundle` | bundle 层组合声明 |

## 如何工作

### 职责边界

| 归 core | 归本包（且仅此） |
|---|---|
| JSON-RPC 解析与分发 | HTTP 服务器与路由 |
| `initialize` / `tools/list` / `tools/call` / `ping` | Bearer token 鉴权（含 `::ffff:127.0.0.1` 回环判定） |
| 工具目录与实现（`oblivion_capture_page` / `oblivion_search`） | CORS 白名单与预检 |
| 错误码（`-32700` / `-32601` / `-32602` / `-32603`） | 请求体上限、固定端口、健康路由、心跳文件 |

`src/mcp.ts` 与 `src/tools.ts` 已**删除**（整体搬进 `oblivion-core/src/mcp/`），
`src/types.ts` 里也不再出现 `OblivionFacade` —— 传输层不认识门面。

### `inject = []`（0.1.1 的根因修复）

0.1.0 写的是 `inject: ['oblivion']`，结果是**整包从未激活**：

- Cordis 的 `fiber._refresh()` 会遍历 `Object.keys(this.inject)`，
  任一服务取不到就把 epoch 置 `INACTIVE`，插件停在 `pending`，
  **`apply()` 一次都不跑**（不报错、不 warn，只是静静地什么都不做）；
- 实测证据（2026-10-06）：
  1. `C:\Users\liveu\.oblivion\bridge-heartbeat.json` **不存在**（`apply()` 从没跑到写心跳）；
  2. `42081` **从未监听**（`Get-NetTCPConnection -LocalPort 42081` 无结果）；
  3. 日志里**没有任何 bridge 记录**，连 `[oblivion-http-bridge] loaded` 都没有。

改成 `export const inject = []` 后，插件**永远能激活** —— 拿不到端点不是
「不启动」的理由，而是「启动起来、如实回 503」的理由：

```
$ curl -s -X POST http://127.0.0.1:42081/oblivion/mcp \
       -H 'Authorization: Bearer x' -H 'Content-Type: application/json' \
       -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
HTTP/1.1 503 Service Unavailable
Content-Type: application/json; charset=utf-8

{"jsonrpc":"2.0","id":null,"error":{"code":-32603,
 "message":"oblivion core endpoint unavailable: 未找到通道"}}
```

### 通道契约

| 项 | 值 |
|---|---|
| 键 | `Symbol.for('@oblivion/core/mcp')`（字面量 `'@oblivion/core/mcp'`） |
| 形态 | `Map<owner, slot>`，`slot = { apiVersion, owner, endpoint, at }` |
| 契约版本 | `MCP_API_VERSION = 1` |
| 端点形状 | `{ apiVersion, owner, version(), describe(), handle(rawBody, log) }` |

两端**各自声明一次字面量**（`src/channel.ts` 与 `oblivion-core/src/mcp/channel.ts`），
`scripts/selfcheck.mjs` 同时读两个文件**逐字比对** —— 改一处忘另一处会当场红。
`apiVersion` 不匹配时一律当端点不存在（回 503），**绝不猜着调**：协议语义变了还硬调，
比不服务更糟。

端点**每个请求惰性解析一次**，不缓存：core 可能刚热重载换了实例，缓存端点
等于拿着旧门面写盘。

### 状态码语义

| 码 | 何时 |
|---|---|
| `200` | 端点返回了结果（正常 JSON-RPC 响应；端点内部抛异常也走这条，body 是 `-32603`） |
| `204` | 端口返回 `null` —— JSON-RPC **通知**，按 MCP 规范不回 body |
| `401` | token 缺失/错误（**先于**端点检查，不泄露端点是否存在） |
| `404` | 路径不是 `path` 也不是 `path/health`（多一个路径就多一份攻击面） |
| `405` | 端口路径非 POST；健康路径非 GET（带 `Allow`） |
| `413` | 请求体超过 `maxBodyBytes` |
| `503` | 没有可用端点；**或** token 未配置（沿用 `checkAuth` 的语义） |

### 健康路由

```
GET http://127.0.0.1:42081/oblivion/mcp/health          # 不需要 token
```

```json
{ "ok": true, "version": "0.1.1", "port": 42081, "path": "/oblivion/mcp",
  "uptimeMs": 12345,
  "endpoint": { "present": true, "apiVersion": 1, "owner": "@oblivion/core",
                "version": "0.2.0", "tools": ["oblivion_capture_page", "oblivion_search"],
                "ready": true, "reason": "" } }
```

它**不需要 token**：只回「桥接有没有起来、端点有没有就绪」，不含任何敏感信息；
而它最有用的时刻恰恰是「token 配错了，扩展连不上」的时候。服务器本身只监听回环，
所以不构成泄漏面。`endpoint.present === false` 时 `reason` 是中文原因
（`未找到通道` / `契约版本不匹配：期望 1，实际 2`）。

心跳文件 `~/.oblivion/bridge-heartbeat.json` 与健康路由同源，另带 `inject: []`
与 `mcpEndpoint` 字段；**端点首次成功解析时**会再刷一次，用来记录
「传输起来了但端点缺席」→「端点就绪」的转变。写心跳失败只 warn，绝不抛。

> 读这个文件时注意：`selfcheck.mjs` 与 `node --test` 也会调 `apply()`，
> 因此它们会**覆写同一个真实路径**。看到 `owner: selfcheck` / `resolvedPort: 421xx`
> 那就是测试残留，不是现役桥接的状态 —— 现役状态看 `/health` 更可靠。

## 为什么自带 `node:http` 而不是用 `ctx.webServer`

初版 `inject` 写的是 `['webServer', 'credentials']`，实测在 **desktop profile 起不来**：
`webServer` 由 `@deepseek-ai/dsh-web-app` 提供，而 desktop 的
`dsh.profile.bundles` 只有 `@deepseek-ai/dsh-base` + 第三方插件，**没有 web-app**。

改用 `node:http` 后：

- 依赖面最小（0.1.1 起是**零**服务依赖：`inject = []`）；
- **desktop / web 两个 profile 都能跑**；
- 端口可以**固定**（`42081`），扩展配置一次长期有效 ——
  而 DSH 默认每次启动分配随机端口，扩展里填的 URL 下次就失效。

## 安装

### 1. 依赖（工作区内自动，无需手动）

`pnpm-workspace.yaml` 的 `packages: ['oblivion-*']` 已经匹配本目录，
在仓库根跑一次 `pnpm install` 即可。

### 2. 写凭据（环境变量，不是配置文件）

本包从**环境变量**读 token，变量名由 `tokenEnv` 配置项指定（默认 `OBLIVION_BRIDGE_TOKEN`）。

生成一个随机 token：

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes).Replace('+','-').Replace('/','_').TrimEnd('=')
```

设成用户级环境变量（**注意：设完要重启 DSH**，进程启动后才读得到）：

```powershell
[Environment]::SetEnvironmentVariable('OBLIVION_BRIDGE_TOKEN', '<粘贴上面的 token>', 'User')
```

### 3. 挂到 profile（热挂，无需重启）

把 `cordis.patch.yml` 里的插入行追加到
`%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` **末尾**：

```yaml
- insert:
    - id: '@oblivion/http-bridge'
      name: '@oblivion/http-bridge'
```

**顺序不再有要求**（0.1.1 起 `inject = []`，不再等 `oblivion` 服务）。
排在哪都行，排在 `@oblivion/core` 之后只是读起来顺。

### 4. 验证

先看桥接有没有起来（**不需要 token**）：

```powershell
Invoke-RestMethod 'http://127.0.0.1:42081/oblivion/mcp/health' | ConvertTo-Json -Depth 4
```

期望 `ok: true`；`endpoint.present` 应当为 `true`（为 `false` 时看 `endpoint.reason`）。

再打一次真实请求：

```powershell
$token = $env:OBLIVION_BRIDGE_TOKEN
$body = '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
Invoke-WebRequest 'http://127.0.0.1:42081/oblivion/mcp' `
  -Method POST -Headers @{ Authorization = "Bearer $token" } `
  -Body $body -ContentType 'application/json' -UseBasicParsing | Select-Object -ExpandProperty Content
```

期望：`{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18",...,"serverInfo":{"name":"oblivion","version":"0.2.0"}}}`

注意 `serverInfo.version` —— 它取自 core 的 MCP 端点，所以能顺带证明
**响应真的穿透到了 core**，而不是桥接自己造的。

## DeepSeek++ 配置

在扩展的 MCP 配置页（`CapabilitiesPage`）新增一项：

| 字段 | 值 |
|---|---|
| 传输 | `streamable_http`（或 UI 上标注的 URL / HTTP 选项） |
| URL | `http://127.0.0.1:42081/oblivion/mcp` |
| Header | `Authorization: Bearer <OBLIVION_BRIDGE_TOKEN>` |

**扩展 ID** 已预填在 `src/config.ts` 的 `DEFAULT_ALLOWED_ORIGINS`：

```
koealbifonogjljlppjngjnaejemdjhp
```

换扩展/重装扩展后 ID 可能变，改 `config.ts` 的 `allowedOrigins` 即可。

## 提供的 MCP 工具

工具实现**在 core 里**（`oblivion-core/src/mcp/tools.ts`），本包只负责把请求递过去：

| 工具 | 作用 |
|---|---|
| `oblivion_capture_page` | 把当前网页（正文或选中片段）加入知识库 |
| `oblivion_search` | 检索知识库，返回最相关记录（含来源 URL） |

这两个是**浏览器场景**专用的轻量工具。core 自己的 7 个工具
（`oblivion_capture` / `oblivion_query` / `oblivion_profile` / `oblivion_feedback` /
`oblivion_graph_neighbors` / `oblivion_digest` / `oblivion_status`）是给 DSH agent
用的，语义更重，浏览器扩展不需要。

## 配置项

| 键 | 默认 | 说明 |
|---|---|---|
| `port` | `42081` | 固定端口。改这里要同步改扩展里的 URL |
| `host` | `127.0.0.1` | **仅回环**。绝不要改成 `0.0.0.0` —— 知识库是私人数据 |
| `path` | `/oblivion/mcp` | MCP 端点路径（健康路由 = `path/health`） |
| `token` | — | 直接给 token（优先级最高，测试用） |
| `tokenFile` | — | 从文件读 token（整文件 trim，容忍 CRLF） |
| `tokenEnv` | `OBLIVION_BRIDGE_TOKEN` | 环境变量名（不是密钥本身）。空串 = 这条来源禁用 |
| `requireLoopback` | `true` | 强制回环来源 |
| `maxBodyBytes` | `1048576` | 请求体上限（1 MB） |
| `allowedOrigins` | `[chrome-extension://koe...]` | CORS 白名单 |
| `debug` | `false` | 详细日志 |

三条凭据来源（优先级 `token` > `tokenFile` > `tokenEnv`）**都没配置（三者都是空串）
时不启动监听**，只留一条 warn —— 连凭据都没有就没有可用的服务面。

注意判据是「三处都没配」而不是「环境变量没设」：只留默认的 `tokenEnv`
（`OBLIVION_BRIDGE_TOKEN`）而该环境变量本身没设时**仍会监听**，只是每个请求都拿到
503 `bridge token unavailable` —— 这是 `checkAuth` 的既有语义（本次未改），
也是「传输起来了、但不可用」的如实回答。

## 安全模型

三道门，缺一不可：

1. **回环地址** —— 防局域网/公网访问；
2. **Bearer token** —— 防本机其它程序；
3. **常量时间比较** —— 防时序侧信道。

`::ffff:127.0.0.1` 在回环白名单里是**必须的**：Windows 上 Node 常把 IPv4
映射成 IPv6 形式，漏了它会导致本机请求全部 401（实测踩过）。

## 故障排查

| 症状 | 原因 | 处理 |
|---|---|---|
| 心跳文件不存在 / 端口没监听 | 插件停在 `pending`（`inject` 声明了取不到的服务） | 0.1.1 起 `inject = []`，不该再出现；若出现，看 DSH 日志里 `[oblivion-http-bridge] loaded` 有没有打 |
| 401 `unauthorized` | token 不匹配 / 非回环 | 检查环境变量与 `Authorization` 头；用 `/health` 确认桥接本身是活的 |
| 503 `bridge token unavailable` | token 解析为空（`OBLIVION_BRIDGE_TOKEN` 没设，或设完没重启 DSH） | 设好变量后**重启 DSH** |
| 端口完全连不上（不是 503） | 三条凭据来源都没配（`token` / `tokenFile` / `tokenEnv` 都是空串） | 至少配一条来源 |
| 503 `oblivion core endpoint unavailable: 未找到通道` | 通道里没有端点 | 看 `@oblivion/core` 是否激活（`oblivion_status` 工具能否调用）；`/health` 的 `endpoint.reason` 会说清 |
| 503 `…契约版本不匹配：期望 1，实际 N` | core 的 `MCP_API_VERSION` 变了 | 同步改 `src/channel.ts` 与 `oblivion-core/src/mcp/channel.ts`，跑 `selfcheck.mjs` |
| `EADDRINUSE` | 端口被占 | 找占用进程杀掉，或改 `port` + 扩展 URL |
| 扩展连不上但 curl 正常 | 扩展 ID 变了 | 更新 `allowedOrigins` |

## 构建

```bash
node scripts/build.mjs                  # src/index.ts → lib/index.js（约 15 KB）
node_modules\.bin\tsc.cmd -p tsconfig.json   # 类型检查
node --test                             # 传输层边界用例
node scripts/selfcheck.mjs              # 契约自检（含与 core 的字面量比对）
node scripts/bump-version.mjs --check   # 版本号一致性
```

产物**自包含**：不 import 任何 `@deepseek-ai/*` 包，也不 import `@oblivion/core`，
只需要 Node 内置模块 —— 两边靠**进程内全局通道**通信，不靠模块解析。
这与 core 不同：core 必须把 `@deepseek-ai/dsh-tools` 标 external，
因为 `defineTool` 的参数校验发生在宿主运行时。

## 版本

`VERSION` 文件是单一真源，`package.json` 的 `version` 必须与它一致
（`bump-version.mjs --check` 会校验）。

- `0.1.1` — 传输层与协议层彻底分离：`src/mcp.ts` / `src/tools.ts` 删除（归
  `oblivion-core/src/mcp/`），`inject` 由 `['oblivion']` 改为 `[]`（根因修复，
  见上文实测证据），新增 `src/channel.ts` 作为只读通道读侧、`/health` 健康路由、
  503 + `-32603` 的诚实失败语义。`package.json` 里的
  `dsh.compat.requires.workspaceServices: ["oblivion"]` 已是陈旧声明（本次未动该文件）。
- `0.1.0` — 从 `C:\Library\那些渐渐被遗忘\oblivion` 的 JS 原型迁入，
  改造为 TS 工程；改用 `node:http` + 固定端口；`inject` 从
  `['webServer','credentials']` 收敛为 `['oblivion']`。
