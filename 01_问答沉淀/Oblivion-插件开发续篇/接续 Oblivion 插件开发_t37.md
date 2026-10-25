# 接续 Oblivion 插件开发 · 轮 37

- 来源会话: `session-d3b01bcc-b753-4993-adc7-a56e328ac928`
- 状态: 中断（回答可能不完整）

## 问题

Oblivion Panel 挂载的上下文观测界面：这部分代码是在哪里？检查下。之前我在哪里设置的这个功能？

## 回答

Oblivion 仓库里没有这个代码。这说明上下文监控界面**不是 Oblivion Panel 提供的**，而是 **DSH 内置的"上下文"标签页**。让我确认来源。

找到了关键包：`dsh-harness-dev-context` 和 `dsh-web-frontend`。提取并检查。

- 涉及工具: `pwsh`, `read`

---