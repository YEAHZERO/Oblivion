# 接续 Oblivion 插件开发 · 轮 33

- 来源会话: `session-d3b01bcc-b753-4993-adc7-a56e328ac928`

## 问题

将我装的每个插件的功能描述一遍

## 回答

## 已安装插件清单

### DSH 官方核心（4 个）

| 插件 | 版本 | 功能 |
|---|---|---|
| `@deepseek-ai/dsh-base` | — | DSH 运行时基础包（依赖集合） |
| `@deepseek-ai/dsh-web-app` | — | 官方 Web 界面 |
| `dsh-better-sidebar` | 0.28.0 | 侧栏增强框架（所有侧栏插件的宿主） |
| `dshmarket` | 1.70.1 | 插件市场 UI：安装/更新/禁用/启用插件 |

### Oblivion 插件组（7 个）

| 插件 | 版本 | 功能 |
|---|---|---|
| `@oblivion/bundle` | 0.0.1 | 安装入口：一条命令装齐其余 Oblivion 插件 |
| `@oblivion/core` | 0.2.20 | **认知层内核**：knowledge / qa-loop / perspective / feedback / graph / profile + digest / retitle / wiki / stats / organize；10 个模型面工具 + MCP 协议面 |
| `@oblivion/brand` | 0.1.8 | 品牌槽位接管（侧栏/会话 Hero 换成北极星）；守夜人重启链路；三按钮一行；检查并应用插件更新；孤儿进程清扫；会话注入/读回 |
| `@oblivion/panel` | 0.0.18 | 侧栏观测面板：捕获率 / 判定曲线 / 调参建议 / 知识库单栏；设置页（Oblivion 知识库）；三按钮（重启/更新/清理孤儿） |
| `@oblivion/vimc` | 0.2.10 | 键盘导航：w/s/a/d 翻页，f 链接提示，/ 查找，i/Esc 输入框，Ctrl+方向键像素滚动；按 Vimium-C 语义实现 |
| `@oblivion/http-bridge` | 0.1.3 | 浏览器扩展接入：固定端口 42081 上的 HTTP 传输层（鉴权/CORS/健康路由），不含 MCP 逻辑 |
| `@oblivion/daily-life` | 0.0.1 | 「有数」物品服役账本：日均成本 / 服役进度 / 闲置天数 |

### 搜索与网页（3 个）

| 插件 | 版本 | 状态 | 功能 |
|---|---|---|---|
| `dsh-free-search` | 0.9.15 | ✅ 活跃 | 免费搜索路由：DDG / Bing / Jina，无需 API Key |
| `dsh-web-search-pro` | 0.2.1 | ✅ 活跃 | 增强型网页搜索：多引擎路由（DeepSeek/Exa/DDG/Bing/Jina + GitHub/哔哩哔哩/V2EX/小红书） |
| `dsh-deepseek-web-login` | 1.0.3 | ✅ 活跃 | 网页版 DeepSeek 登录态传输：无头 Edge 传输进程管理 |

### 浏览器与上下文（2 个）

| 插件 | 版本 | 状态 | 功能 |
|---|---|---|---|
| `@anweat/dsh-browser` | 0.2.1 | ✅ 活跃 | 内置 Playwright 浏览器运行时（chromium + OpenCLI），提供 `browser` 服务 |
| `dsh-context` | 0.75.0 | ✅ 活跃 | 上下文管理：对话历史压缩、上下文窗口控制 |

### 工具与辅助（4 个）

| 插件 | 版本 | 状态 | 功能 |
|---|---|---|---|
| `billion-context` | 0.1.205 | ✅ 活跃 | 长上下文管理：lane 重建、压缩、chunk 切分 |
| `dsh-cost-meter` | 1.9.31 | ✅ 活跃 | 费用计量：每次调用的 token 消耗和费用估算 |
| `@lovedolove/veyra` | 0.1.55 | ✅ 活跃 | 工程记忆库：跨会话存储和检索工程知识、架构决策、故障模式 |
| `@zerorigin-studio/dsh-deepseek-chat` | 0.3.5 | ✅ 活跃 | Web 聊天入口：侧栏跳转 DeepSeek Chat 网页 |

### 未启用（1 个）

| 插件 | 版本 | 状态 | 原因 |
|---|---|---|---|
| `dsh-creator-mode-plus` | 0.3.13 | ❌ 未启用 | 可能需要额外配置或与其他插件冲突 |

---

**总计：19 个插件，18 个活跃，1 个未启用。**

- 涉及工具: `pwsh`

---