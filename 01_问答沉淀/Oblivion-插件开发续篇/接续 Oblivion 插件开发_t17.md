# 接续 Oblivion 插件开发 · 轮 17

- 来源会话: `session-d3b01bcc-b753-4993-adc7-a56e328ac928`

## 问题

pwsh使用这个：C:\Program Files\PowerShell\7\pwsh.exe

## 回答

`read`/`edit` 工具可用。直接改配置——把两个 `contextWindow: 512000` 改成实测边界值 **256000**。

配置已更新。现在需要重启宿主让新 `contextWindow: 256000` 生效。

- 涉及工具: `edit`, `pwsh`, `read`

---