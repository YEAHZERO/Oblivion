# Web 交付通道与 webserver 形态 设计文档

## 版本信息

- **版本**: 1.0.0
- **日期**: 2026-10-03
- **作者**: 会话产物（用户裁定，AI 记录）
- **状态**: **已裁定（Confirmed）**，实现未开工
- **对应设计书**: «architecture.md» §5.3 / §5.6 / §14.4 / §25（DEC-014~016）、«ERRATA-48»

## 1. 背景与目标

### 1.1 背景

原先只有「Electron 走 IPC」这一条说法，而 «architecture.md» §5.3 又写「主界面由 «oblivion-web-ui»
经**本地 web 服务**提供」—— 两处互相矛盾；且 §3.1 的架构图把矛盾的那一方画了进去。

要回答的问题是：**UI 与内核之间用什么通道？** 这决定三件事的形状：

1. 客户端的连接逻辑（一条还是两条通道）；
2. 扩展位（插件往哪里注册路由）；
3. 安全面（围栏要覆盖到哪几条通道）。

### 1.2 目标

- 通道形状**照抄上游实证**，不自行发明；
- webserver 的形态与上游一致（宿主编 + 三席位）；
- 让 §5.3 成为 UI 交付通道的**唯一说法**。

## 2. 技术方案

### 2.1 结论（一句话）

> **»/api» 单元（unary）+ »/api/remote.mux» 一条 WebSocket mux；UI 不使用 SSE。**

### 2.2 为什么不是 SSE

上游的上行缓冲默认 **262144** 字节，溢出错误码叫 «gateway/uplink-overflow» ——
**流是双向的**，SSE 天生单向。且上游从未用 SSE 给 UI 推流：SSE 只出现在
HMR（推图重建帧）与 «llm-deepseek»（**出站**调上游）。

⚠️ 易混点：第 3 步要实现 «llm-deepseek»，它**确实**消费 SSE（«EventSourceParserStream»），
但方向是 **内核 → DeepSeek 上游**，与 UI 通道是两回事。别因为「要接 LLM」而选 SSE 当 UI 通道。

### 2.3 分工

| 通道 | 路径 | 用途 | 约束 |
| --- | --- | --- | --- |
| HTTP 单元 | »/api» | 请求/响应信封（RPC） | 强制 «application/json»，否则 **415** |
| WebSocket | »/api/remote.mux» | **全部**实时流，一条精确路由多路复用，双向 | 事件流是它**内部**的逻辑流 »$events»，不是第二条 socket |
| SSE | — | 与 UI 无关 | 仅 HMR 与出站 LLM |

### 2.4 webserver 形态：宿主编 + 三席位

| 席位 | 方法 | 规则 |
| --- | --- | --- |
| HTTP 路由 | «register(route)» | «kind: 'exact' | 'prefix'»；重复注册**抛错** |
| WS 升级路由 | «registerUpgrade(route)» | 重复注册**抛错** —— 「一条 socket 只能有一个协议属主」 |
| fallback | «registerFallback(handler)» | **SPA dist server 独占**；第二个注册抛错（两个 fallback 无法组合） |
| （未注册的 upgrade） | — | 直接 «socket.destroy()» |

- «host» / «port» / «compression» 进 schema，其中 «host» 是字面量联合
  «'127.0.0.1' | '0.0.0.0'» —— **这就是 §14.4 围栏的第①层**（配置层收口）。
- «trustedHosts» **不在 webserver 行**，在启动器行（见 §3.1 的偏差记录）。

## 3. 实现细节

### 3.1 一处与裁定引文的偏差（快照胜）

引文把 «trustedHosts» 记在 «webserver» 行；快照里它在 **«web-runtime»** 行
（«versions/0.2.0-rc.2/dump-config-web.yaml:479-497»）。
含义：**监听参数归 webserver，信任名单归启动器**（后者经 «webStartup» 传给连接层）。
实现时不要把两者混进同一个插件。

### 3.2 安全围栏：§14.4 的四层在 DSH 里是**一个函数**

| 层 | §14.4 的机制 | DSH 的落点 | 本轮状态 |
| --- | --- | --- | --- |
| ① | 绑定字面量白名单 | webserver 的 schema（字面量联合） | ❌ 待补（随宿主编一起） |
| ② | CLI 拒绝 «--host 0.0.0.0» | CLI 层 | ✅ 已实现 |
| ③ | «trustedHosts» + **Host 头校验** | «client-connection» 的 «admit()» | ❌ 待补 |
| ④ | «resolveLanTrust()» 防 DNS rebinding | **被③吸收** —— DSH 用 Host fence 本身防 rebinding | ❌ 不必单列 |

关键：同一道 «admit()» **也拦 WS 升级** —— 所以③一次覆盖两条通道。
原先把它算成「半天」，修正为与宿主编**同一处代码**，一并做。

### 3.3 需要删除的表述

«architecture.md» §3.1 图的「通过 IPC 与 Main Process 通信」已删除，改为双通道事实，
使 §5.3 成为唯一说法（«ERRATA-48»）。

**保留** §5.6 的 IPC 表述：那说的是**更新 iframe 的隔离**（«oblivion-app://» + MessageChannel port），
不是业务 UI 的数据通道；上游 «dsh-host-webserver» 头注释里的「Electron uses file:// plus IPC instead」
指的也是**壳页**。因此 «apps/electron/src/ipc.ts» 保留。

## 4. 测试策略

- **通道契约**：«/api» 非 JSON → 415；未注册的 WS 路由 → socket 被销毁（非 101）
- **席位互斥**：重复 «register» / «registerUpgrade» / «registerFallback» 各自抛错
- **围栏**：Host 头伪造（含 «0x7f.0.0.1»、百分号编码、非 punycode IDN）必须被拒；
  带 Origin 时必须同源；**同一组用例对 HTTP 与 WS 各跑一遍**（证明「一处覆盖两条通道」）
- **无 SSE**：断言 UI 面向的响应里不出现 «text/event-stream»

## 5. 部署计划

- 时序：**先做 HTTP 单元面**（第 3 步的验收是 DI 层转绿，不是传输层），
  流式（第 4 步）**直接上 WS mux 的一条逻辑流**，跳过 SSE —— 只有一条流式代码路径，不返工。
- WS 参数直接取上游默认：心跳 2000ms、单流 inbox 262144 字节。

## 6. 风险评估

| 风险 | 影响 | 处置 |
| --- | --- | --- |
| 把 SSE 当 UI 通道 | 只能单向推，L3 的打断/取消/输入中事件全做不到，后期重写客户端 | 已裁定 DEC-014；§2.2 写明理由 |
| «trustedHosts» 误放进 webserver 插件 | 启动器传不进去，围栏形同装饰 | §3.1 偏差记录 + 实现时按行归属 |
| fallback 席被两个插件抢 | 启动即抛错（这是**期望**行为，但需在文档写明归属） | 席位表 + 测试 |
| 把 §5.6 的 IPC 一并删掉 | 更新 iframe 的隔离说法丢失 | §3.3 明确保留范围 |

## 7. 未决

- 第 3 步的会话/凭据落点（«~/.oblivion/.credentials.yaml»，0600，永不进环境变量）尚未实现
- CSP：上游也只在**媒体响应**上加 «sandbox; default-src 'none'»，无文档级 CSP。
  本轮**降级**；但知识库要落盘媒体，建议照抄媒体响应那条

## 8. 实现状态（2026-10-03 第三轮更新）

### 已落地

| 项 | 落点 | 状态 |
| --- | --- | --- |
| 三席位注册表 | `oblivion-core/webserver`（`src/webserver/index.ts`） | ✅ `register` / `registerUpgrade` / `registerFallback`，重复注册抛错；未注册 upgrade 直接 `socket.destroy()` |
| host 字面量收口（围栏①） | 同上 `resolveConfig` | ✅ 非法 host/port/compression 启动即抛错 |
| `admit()` 一族（围栏③④） | `src/webserver/fence.ts` | ✅ HTTP 与 WS 升级**共用同一道 fence** |
| fallback 静态投送 | `src/webserver/static.ts` + `registerFallback` | ✅ 含穿越防御、mtime 失效缓存、gzip 预压缩 |
| CLI 注入启动器参数 | `cli.ts` 写 ⑤ 层临时 patch | ✅ 顺带演示「patch 替换整段 config」 |
| 警告清零 | `profiles/web/cordis.patch.yml` 改为 insert | ✅ 组合行 27，两条外来行警告消失 |
| 测试 | `tests/unit/webserver.test.mjs`（11 条） | ✅ 全绿 |

### 未落地（明确记录）

| 项 | 原因 / 影响 |
| --- | --- |
| **浏览器认证（`browserAuth`）** | 上游 `admit()` 在围栏之后还有认证（未认证 → 401）。我们只有围栏 —— 挡得住浏览器侧两条混淆代理路径，但**同机任何进程**都能直连 |
| **路由级 gzip** | `compression` 三件套目前只作用于 fallback 静态资源 |
| **独立包** | 留在 `oblivion-core/webserver` 子路径；独立成包会牵动 registry / 结构契约 / 版本一致性 / 文档四类计数 |
| **`webStartup` 服务** | 现用 CLI 写的 ⑤ 层 patch 替代；上游是 `!!js ctx.webStartup.*` |
| **index 注入表** | 上游有 `webserver/index-inject` 事件让插件往 index.html 注入片段；我们目前构建期内联 |
| **流式（`/api/remote.mux` 的逻辑流）** | 只定了形状（DEC-014），实现待 Phase 2 |

### 迭代闭环（本轮建立的开发手感）

`««««powershell`
npm run web:watch        # 常驻：esbuild 监听 + 自动重建（含自动刷新 index.html 与构建清单）
npm run web:serve        # 常驻：静态服务（默认随机端口；--port 指定）
`««««

改 `packages/oblivion-web-ui/src` 下任意文件 → 保存 → **浏览器刷新**即可见。
**不需要重启服务**：静态处理器按 mtime 失效缓存（这条是必须的，否则重建了也看不到变化 ——
第一版按路径缓存，正好会踩这个坑）。

真正的 HMR（不刷新页面）需要一条 HMR 通道（上游用 `dsh-client-hmr` 的 SSE 推图重建帧），
那属于开发期工具，尚未实现。

### 外壳的还原度

应用外壳已按上游 GUI 的**信息结构**重做（侧栏：新会话 / 工作区 / 会话列表 / 底部用户；
主区：居中欢迎 + 大输入框 + 模型与模式 chip）。仍缺：

1. **188 图标未接入外壳**（现在用 `⊖ ▤ ⌕ ⇅ ＋ ⚙ ↑` 等占位字符）；
2. **真实会话数据**（列表与模型名都是常量，等 Phase 2）；
3. 输入框的交互细节（附件、`/` 指令补全、`` 文件引用）。
