# Oblivion-LAYOUT · 轮 6

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

距离web可用还差什么？

## 回答

Let me ground this in the actual state rather than from memory.

先给结论：**今天的 web 是「能打开的设计样张」，不是能用的应用。** 差三块 —— 一条数据通道、两个能力层、一层安全围栏。下面按“能不能用”的三级口径拆开。

## 一、先定义「可用」

| 级别 | 判据 | 现状 |
|---|---|---|
| **L1 能打开** | 界面渲染、三栏几何、主题切换、令牌生效 | ✅ 已达成（`npm run web:build` + `npm run web:serve`） |
| **L2 能真正对话** | 输入问题 → 调 LLM → 流式出答案 → 落盘沉淀 | ❌ 差得最多 |
| **L3 能当产品用** | 多会话、知识库管理、设置、快捷键、插件管理 | ❌ 在 L2 之后 |

顺带一个容易忽略的事实：`architecture.md` §5.3 写的是「**主界面由 `oblivion-web-ui` 插件经本地 web 服务提供**」—— 也就是 **Desktop 形态也走这条 web 服务**。所以下面缺的东西，桌面形态一样缺。

## 二、L2 的硬缺口（按阻塞程度排）

| # | 缺口 | 证据 |
|---|---|---|
| 1 | **UI 与内核之间没有通道** | `App.tsx` 里 `fetch(` 出现 **0 次**；内核只有「发文件 + `/healthz` + `/metrics`」，没有任何业务 API 或事件流 |
| 2 | **内核拿不出任何服务给 UI** | 全仓库 `provide(` 出现 **0 次** —— 这就是 `oblivion web` 横幅里「**已激活 10 / 等待依赖 13**」的原因：13 行的 `inject` 永远等不到提供者 |
| 3 | **能力层未开工** | 26 个包里只有 `oblivion-core` 与 `oblivion-web-ui` 有真实实现；Phase 2（`llm-*` 5 个 + `session-*`）与 Phase 3（`knowledge-*` 6 个 + `tool-doc-parse`）**一行没写** |
| 4 | **答案渲染不了** | `MarkdownText` 未做（4c 剩余四项之一）—— LLM 的回复是 markdown，没有它只能显示纯文本 |
| 5 | **`webserver` 那一行不存在** | `profiles/web` 声明的 `webserver`（`127.0.0.1:3080`）是参考架构的行。我把它实现成了 CLI 里的静态服务（**这是我的偏离，不是设计**），所以 `--dump-config` 至今挂着那条警告 |
| 6 | **无凭据与共享根** | Phase 2 要求凭据只落 `~/.oblivion/.credentials.yaml`（0600）、**永不进环境变量** —— 未实现，因此就算有 UI 也没地方填 API Key |

## 三、L3 还缺的（4c 剩余 + 交互）

| 项 | 说明 |
|---|---|
| 锚点定位类浮层 | `Menu` / `HoverCard` / `ImageLightbox` 未做；连带 21 个工具函数里的 DOM 部分（剪贴板 / 输入法组合期抑制快捷键 / 粘性头观测）—— 它们是浮层的前置 |
| `SettingsForm` + `SettingsFormModel` | 未做；没有它就没有设置界面（包括那 2 个用户旋钮的持久化） |
| **拖拽把手未接线** | `computeColumns()` 会算，但 `App.tsx` 里 `setSidebarWidth` 出现 **0 次** —— 几何是「能算」而不是「能拖」 |
| 主题偏好持久化 | 设计里落在 **Host settings 文档**（`ERRATA-42` 已取证），未实现；刷新即回到默认 |
| 多会话 / 路由 | `selectPanel` 只切两个演示视图，没有会话列表、没有 URL 路由 |

## 四、安全围栏：§14.4 的四层我实现了一层

| 层 | 机制 | 状态 |
|---|---|---|
| ① 绑定字面量白名单（schema 只收 `127.0.0.1` / `0.0.0.0`） | ❌ 我没有 schema 层，只在 CLI 里做判断 |
| ② CLI 硬拒 `--host 0.0.0.0` | ✅ 已实现（并要求 `--trusted-host`） |
| ③ `trustedHosts` + **Host 头校验** | ❌ 我收下了 `--trusted-host` 旗标，但**没有校验 Host 头** —— 旗标目前是装饰 |
| ④ `resolveLanTrust()` 防 DNS rebinding | ❌ 未实现 |

另：响应头只有 `x-content-type-options: nosniff`，**没有 CSP**。

## 五、还有一个「没证据」的问题

`tests/e2e/` 里只有 `.gitkeep`，**Playwright 未安装**。也就是说：**至今没有任何一次在浏览器里跑过的验证** —— 界面只在无头渲染（`react-dom/server`）与静态文本层面被断言过。「无闪烁」「主题切换」「拖拽让步顺序」这些都是推理正确、未经实证。

## 六、最小可用路径（建议顺序与验收口径）

1. **定通道**（半天，需要你裁定）：HTTP + SSE，还是 WebSocket？设计只写了 Electron 走 IPC，**web 形态的通道是设计空白**，得先定。
2. **把服务做成宿主编**（1 天）：落实 `webserver` 那一行（`host` / `port` / `trustedHosts`），顺便消掉那条常驻警告；把 `serve.ts` 从 CLI 挪进去。
3. **补最小服务面**（3–4 天，Phase 2）：`session` + `llm-deepseek` + 凭据落盘 —— 验收是 `provide(` 不再为 0、13 个 pending 里至少 3 个转绿。
4. **补渲染与交互**（2 天）：`MarkdownText`（消费已落地的 102 个 markdown 令牌）+ `SettingsForm` —— 验收是「能在界面里填 Key 并看到一次真实回复」。
5. **补安全围栏**（半天）：Host 头校验 + `resolveLanTrust` + CSP —— 验收是 §14.4 四层齐。

第 1 步之后就能跑通「一次真实对话」，那是第一个真正的「可用」。**第 1 步需要你先定**（通道选型是架构决定，不是实现细节），其余步骤我可以直接排进下一轮。

- 涉及工具: `run_code`

---