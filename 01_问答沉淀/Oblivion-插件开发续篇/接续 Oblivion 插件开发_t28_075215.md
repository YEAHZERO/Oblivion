# 接续 Oblivion 插件开发 · 轮 28

- 来源会话: `session-d3b01bcc-b753-4993-adc7-a56e328ac928`

## 问题

这两个不兼容的，先修改然后提交issue。同时修复Veyra / dsh-context 安装	⏳ minimumReleaseAge 持有期（等 24h 或手动加依赖跑 apply）。并提交agnes-api thinking 块 400 错误	⏳ DSH/pi-ai 上游问题。

## 回答

明白。先拉图片看具体报错，再逐项处理。

关键信息已拿到。两个插件的问题：
1. **Node 版本**：`engines: {"node": "^22.19 || >=24"}`，但 Electron 内置 Node 是 20.x
2. **peer deps**：`<0.2.1-0` 明确排除当前 DSH 0.2.1

先查 Electron 的 Node 版本，再决定修复方案。

Node 是 v24.21.0，版本要求满足了。**真实问题是 peer deps**：`<0.2.1-0` 明确排除 DSH 0.2.1。

方案：在插件的 package.json 里放宽 peer dep 的上界，然后重装。

Peer deps 里所有 `@deepseek-ai/*` 都有 `<0.2.1-0`，需要去掉上界。修改两个插件的 package.json 然后重装。

Peer deps 已放宽。重启宿主让兼容性检查重新跑。

- 涉及工具: `pwsh`, `read`, `read_image`

---