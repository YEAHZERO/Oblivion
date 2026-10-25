# Oblivion-LAYOUT · 轮 15

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

查看对比如下分析，然后改进本项目——
DSH 源码分析（@deepseek-ai/dsh v0.2.0-rc.2）
1. 总体规模
项目	数值
总文件数	26,616
总体积	453 MB
@deepseek-ai/* 作用域包	287 个
第三方顶层包	~177 个
主包自身 lib/	15 个文件 / 0.05 MB（纯启动器）
主包只是 CLI 引导层，真正代码在 287 个微包里 —— 典型的"一切皆插件"拆分。
2. 架构核心：Cordis 插件系统
基于 @deepseek-ai/cordis (~4.0.4) 的依赖注入容器。组合关系全部由 YAML patch 文件声明，代码里没有硬编码的插件图。
启动链
dsh (bin.js, commander 解析)
  └─ profile-boot.js: runProfile()
       ├─ composeProfile()  ← 叠加 5 层 patch
       ├─ boot()            ← 挂载 Cordis 插件树
       ├─ provideCmdline()  ← 应用自己的参数
       └─ createProcessShutdown() ← SIGINT/SIGTERM 有界退出（5s 超时强制）
5 层 Patch 叠加（后者覆盖前者，按行 id 最后写入胜出）
3. Bundle 层 — package.json 的 dsh.profile.bundles 顺序：dsh-base → dsh-web-app
4. Profile 用户层 — ~/.dsh/profiles/<name>/cordis.patch.yml
5. Home 层 — ~/.dsh/cordis.patch.yml（机器级，跨所有 profile）
6. --patch 覆盖 — 命令行额外指定
7. Telemetry 开关
根配置 cordis.yml 每次启动都重写为空数组 []，防止 Loader 的写回把组合结果固化。
8. Subsystem 规模分布
子系统	包数	体积
dsh-client-* (浏览器 UI)	62	29.5 MB
dsh-web* (web 服务/搜索/抓取)	7	5.9 MB
dsh-api-* (RPC 控制器)	9	3.0 MB
dsh-session-* (会话持久化)	23	2.3 MB
dsh-tool-* (模型工具)	21	1.9 MB
dsh-llm-* (模型适配)	5	0.5 MB
dsh-experimental-*	11	0.9 MB
浏览器 UI 占了最大头 —— 这是完整的 React 前端打进 npm 包。
9. 分层设计（dsh-base/cordis.patch.yml，529 行）
Base bundle 声明约 100 个插件行，按职责分组：
层	关键行
LLM	llm、llm-deepseek（api-key）、llm-deepseek-account（账号 token）、llm-pi-ai（多厂商，默认休眠，靠设置激活）
会话	session、session-persistence-jsonl、session-query-sqlite（默认 openAt: never，全文搜索需手动开启）
凭据	authorization → credentials-local（~/.dsh/.credentials.yaml，逐请求解析，永不写入进程环境）
安全	sandbox-local + sandbox-policy（默认 workspace-write）+ approval（默认 ask）+ 平台分派（win32 用 pwsh-sandbox，其余用 bash-sandbox）
Web	web（searchProvider: deepseek-official）+ web-search-deepseek + web-fetch-http + tool-web（搜索超时 60s）
遥测	session-telemetry-otel，默认 FEEDBACK_ONLY（仅用户反馈触发），端点 dsh-otel-collector.deepseeksvc.com，DSH_TELEMETRY_DISABLED 任意非空值即关闭
10. Web 层的关键设计（dsh-web-app）
Host plane / Agent plane 分离：web patch 把 base 里约 20 个工具行 disabled: true，改由 agent preset 按会话挂载。注释解释了判据：
一个被 preset 外部行读取的服务属于 Host plane（如 registry

> （已截断，原长 12302 字符；问题全文见会话原始日志）

## 回答

这份分析里对 Oblivion 最有价值的是**机制**而不是规模。我先做其中一条最实、可验证的改进：**Bundle Root 锚定的插件解析**（它解释了为什么 DSH 的 profile `dependencies` 是空的、升级不需要重建 profile）。

全绿：**663/663**，build / typecheck / lint 全 0。

## 一、本轮改进：Bundle Root 锚定的插件解析

这份分析里对 Oblivion 最有用的是**一个机制**而非规模 —— `resolveBundleDir()`「先锚定 dsh 自己的安装目录，再回退 profile」。它解释了三个我原先没想通的事实：profile 的 `dependencies` 可以是空的；`npm i -g` 原地升级后 profile **零重建**；desktop profile 压根没有 `node_modules`。

我原来的解析只有两层（`import(name)` + `<repo>/packages/<name>/lib`），**装到全局后第二层必然落空** —— 也就是说 Oblivion 当时只能在自己的源码 checkout 里跑。

改法（`profile/boot.ts`）：

```
pluginCandidates(name, { bundleRoot, profileRoot, devRoot })
  ① Bundle Root  —— 启动器自己的安装目录（向上找最近的 node_modules 祖先）
  ② Profile Root —— <home>/profiles/<profile>/node_modules（用户自装插件兜底）
  ③ Dev Root     —— <repo>/packages/<pkg>/lib/[<子路径>/]index.js（源码 checkout）
```

抽成**纯函数**是为了能测：解析顺序是契约，不能靠「跑一遍看起来对」。新增 [plugin-resolution.test.mjs](tests/unit/plugin-resolution.test.mjs) 5 条，其中一条特意钉住了**两种布局的差别**：安装布局命中 `node_modules` 祖先，源码布局返回 `null` 并回落 `devRoot` —— 我第一版把这条断言写错了（以为能命中 `<repo>/node_modules`，其实它是**子**目录不是祖先），测试直接把我的错认知纠正过来。

## 二、对照这份分析，Oblivion 还该补什么（按价值/成本排序）

| # | 改进 | 依据（你的分析） | 成本 |
|---|---|---|---|
| **1** | **Profile 侧 `node_modules` 注入 + `oblivion plugin --profile <name> <pnpm-args>`** | 「profiles/node_modules 202 个 Junction 指回全局目录」「给用户自装插件兜底」 | 中：需把 `home`/`profile` 传进 `boot()`（我这次只加了参数位，没接线） |
| **2** | **启动失败诊断日志** `~/.oblivion/logs/startup-*.log`（0600 + 顶部警告可能含凭据） | 「启动失败诊断写入 ~/.dsh/logs/startup-*.log，权限 0600，顶部警告可能含凭据」 | 小 |
| **3** | **profile 配置 HMR** | 「HMR 热重载内置，profile 配置改动可热更」 | 中（依赖 #1 的 profile 目录语义先定） |
| **4** | **Host/Agent 双平面落到行级**：web patch 把约 20 条工具行 `disabled: true`，改由 agent preset 按会话挂载；`cordis:group` 隔离 | §10 的判据「一个被 preset 外部行读取的服务属于 Host plane」 | 大（Phase 2 的事，但**判据现在就该写进 §6**） |
| **5** | **遥测口径**：默认 `FEEDBACK_ONLY`（仅用户反馈触发）+ `OBLIVION_TELEMETRY_DISABLED` **任意非空值即关闭** | §9 遥测行 | 小（但要 Phase 10 才有主体） |
| **6** | **Desktop 桥接包**：`registerHooks()` 劫持解析器 + `runProfile()`，CLI **显式拒绝 `--profile desktop`** | 「唯一 desktop 独有包」+「CLI 显式拒绝外部 `--profile desktop`」 | 大（Phase 7） |

顺带三条**结论性对照**，我记进认知但不必改代码：①「主包只是 15 文件启动器、287 微包各自单一职责」—— 与本仓 DEC-020（**停止按 DSH 粒度铺包**）方向一致，26 包中 24 个空壳已用 `implemented` 标记区分；② desktop 与 npm 版**逐字节等价**（313 个差异全是依赖键序与 CSS 构建哈希）—— 说明「两种部署形态共用一份源码」这条设计在 Oblivion 也该保持；③ `--host 0.0.0.0` 在 CLI 层硬拒、schema 层允许 —— 我已实现并有护栏测试。

## 三、现在的运行状态

- 服务：**http://127.0.0.1:42081**（单实例，任务 `pwsh-11`）
- 实机证据：`GET /` 200（令牌 CSS 在 `<script>` 之前）· CSP 头在 · `/healthz` 200 · `/metrics` 200 · **`Sec-Fetch-Site: cross-site` → 403** · `Host: evil.example` → 403 · `/../package.json` → 404
- 门禁：`build 0 · typecheck 0 · lint 0 · 663/663 绿`

## 四、我要坦白的两件事

1. **这段改进只做到「解析锚点」这一半**：`pluginCandidates` 已经支持 `profileRoot`，但 `boot()` 的调用点还没把 `home`/`profile` 传进去（所以 profile 侧仍是 `null`）。真要用起来必须补这条接线 —— 这是上表 #1 的前置，我下一轮第一件事做它。
2. **我这几轮反复在同一类错误上栽**：String.raw 里的反引号、`«»` 只替换了半边、`writeFileSync` 前用错锚点导致补丁静默不生效。这些都不是设计问题而是手滑，但它们**每一次都伪装成「改完了」**。所以我现在每步都强制跑一次「断言存在 + 改后复核」，这一轮那条 `findBundleRoot` 断言写错也是被这道程序抓出来的。

要我接着做上表 **#1（profile node_modules 接线 + `oblivion plugin`）**，还是先回头把 **R1-e**（`/api` 一元端点 + UI 一次 `fetch`）收口？后者是你更早定的「让围栏拦到真实流量」的判据，我倾向先 R1-e。

- 涉及工具: `run_code`

---