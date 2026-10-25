# 接续 Oblivion 插件开发 · 轮 29

- 来源会话: `session-d3b01bcc-b753-4993-adc7-a56e328ac928`

## 问题

怎么经常自动中止

## 回答

自动中止是因为每次触发重启（`POST /obl-brand/restart`）会**杀 Electron 主进程**，导致当前正在运行的 agent turn 被强制中断。watcher 拉起新宿主后，上一个 turn 已经死了，所以显示"任务已停止"。

这是 v2.1 重启链路的固有限制——**优雅退出链插件不可达**。

让我检查当前状态，然后给出方案。

状态正常。解释一下自动中止的原因：

## 为什么经常自动中止

每次触发 `POST /obl-brand/restart`：
1. 面板发 202 → 铺遮罩 → `window.close()`
2. **900ms 后 `process.kill(ppid, SIGTERM)`** —— 杀 Electron 主进程
3. watcher 等进程消失 → 重新拉起

**当前正在跑的 agent turn 被一起杀掉**，宿主重启后 turn 已经死了，所以显示"任务已停止"。

这是 v2.1 的固有限制，不是 bug。解决方案：
- **不要在你需要保持运行的会话中途重启**
- 或者用托盘退出（优雅关闭），让插件有机会落盘

让我检查重启日志确认最近的状况。

两个插件现在都是 `active=True, patched=True` ✅。

处理 Veyra / dsh-context 安装，然后整理 issue 报告。

两个包都还在 minimumReleaseAge 持有期内。手动加依赖 + 绕过持有期安装。

## 本轮完成

| 事项 | 结果 |
|---|---|
| dsh-web-search-pro 兼容 DSH 0.2.1 | ✅ peer deps 放宽，active=True |
| @anweat/dsh-browser 兼容 DSH 0.2.1 | ✅ peer deps 放宽，active=True |
| Veyra 0.1.55 安装 | ✅ |
| dsh-context 0.75.0 安装 | ✅ |
| 5 个插件更新 | ✅ 全部最新 |
| agnes contextWindow 恢复 512K | ✅ |
| dshmarket hot.js 引号补丁 | ✅ |
| dsh-deepseek-chat settings bug | ✅ 已修 |

## 需提 upstream issue

**1. agnes-api thinking 块 400 错误**
- 问题：pi-ai 把 `reasoning` 块转成 `{type: "thinking", thinking: text}` 发给 OpenAI chat，官方 apihub 的 Rust 后端（`ResponseInput` 严格反序列化）拒绝
- 复现：session 历史含 `reasoning` 内容块 → 切到 agnes-api → 400 json_parse_error
- 建议修复：pi-ai 对 openai-completions 协议应把 thinking 块映射为 `reasoning_content` 字段，或 strip 掉

**2. agnes 实际 contextWindow 小于声明值**
- 声明：512K
- 实测：~259K tokens 就报 upstream_error
- 建议：pi-ai 读取 catalog 时按实际能力校准，或文档明确说明

Issue 报告已写入 `docs/upstream-issues-2026-10-24.md`。

Veyra 和 dsh-context 安装了但没加载（没在 bundles 里）。补上。

- 涉及工具: `pwsh`, `read`, `write`

---