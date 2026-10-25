# 接续 Oblivion 插件开发 · 轮 9

- 来源会话: `session-d3b01bcc-b753-4993-adc7-a56e328ac928`

## 问题

background job pwsh-4f97e16438d94b29 (pwsh: # Try to find any DSH source in the entire install
Get-ChildItem 'C:\Programs\AITech\DeepSeekHarness' -Recurse -Filter 'index.js' -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like '*deepseek*' } | Select-Object FullName -First 5
# Also check if DSH is installed as npm package somewhere
Get-ChildItem 'C:\Users\liveu\AppData\Roaming\DeepSeekHarness' -Recurse -Filter 'package.json' -ErrorAction SilentlyContinue | Where-Object { (Get-Content $_.FullName -Raw | ConvertFrom-Json).name -eq '@deepseek-ai/dsh' } | Select-Object FullName -First 3) finished [status: completed, exit code: 1]. Read its output with job_output.

## 回答

找到了！`agnesd.exe`（284 MB）就是 agnes API 服务端（Rust 编译）。现在确认问题并给出 actionable 的下一步。

- 涉及工具: `job_output`, `pwsh`

---