# 接续 Oblivion 插件开发 · 轮 1

- 来源会话: `session-d3b01bcc-b753-4993-adc7-a56e328ac928`
- 状态: 中断（回答可能不完整）

## 问题

接续 Oblivion 插件开发。先读 C:\Projects\Oblivion\docs\handoff-2026-10-18-restart-v2.1.md。

当前状态（2026-10-18）：
- DSH 0.2.1-rc.2；宿主 web 口每次随机；固定锚点 = Oblivion http-bridge 127.0.0.1:42081。
- 重启链路 v2.1：面板「重启 DSH」→ POST /obl-brand/restart → WMI 拉起游离 watcher cmd → 202 → 遮罩+window.close → 900ms 后杀 Electron 主进程 → watcher 等镜像消失后 start 应用，探 42081 反查宿主 pid、列监听口、探 web 口。
  watcher 要点：PID 用 netstat 落文件 + for /f "usebackq" 读（WMI 游离 cmd 里命令形式空产出）；时间戳 %DATE:~0,10%；锁 + 20s TTL；先 ARM 再杀。
- 面板三按钮一行：重启 DSH / 检查更新 / 清理孤儿进程（RestartControl + PluginUpdates + OrphanControl；有活动任务才弹「退出 DeepSeek Harness？」）。
- 更新插件：GET /obl-brand/updates、POST /obl-brand/updates/apply {names}；白名单跳过 link:/file:/@oblivion/@deepseek-ai；备份 package.json + 内置 pnpm install；不兼容项不豁免，等作者（dsh-web-search-pro、@anweat/dsh-browser 仍 FAIL）。
- selfcheck：brand 21/21、panel 18/18；改完先 tsc+build+selfcheck 再重启验收。
- 已知旁支：dshmarket/lib/hot.js:674 引号未转义导致每次启动一条 warn；core 已加 engines.dsh 解 0.2.1 拒载。

先跑 powershell -File C:\Users\liveu\Desktop\dsh-watch.ps1 -Mode status 定位宿主，再验证 /obl-brand/updates=200，然后继续。

## 回答

我先读取交接文档，然后定位正在运行的宿主。

宿主已启动（pid 13860，web 口 11186）。现在验证 brand 路由。

宿主状态已验证。接下来快速梳理仓库和已知遗留问题，再决定继续做哪一项。

重启链路日志显示 09:12:30 到 09:12:42 全部校验通过（host 13860 / web 11186）。工作树里 v2.1 整套改动**尚未提交**。我先确认当前代码本身是否通过自检，再决定接下来做什么。

自检全部通过：brand **21/21**、panel **18/18**，tsc 无报错。工作树状态已确认。现在确认提交约定与改动范围。

仓库规范已确认（VERSION 单一真源、bump 脚本、CHANGELOG、daily 日志）。检查版本与变更日志现状。

核对完成。当前状态（全部已验证）：

| 项 | 实测 | 结论 |
| --- | --- | --- |
| 宿主 | pid **13860**，web 口 **11186**，bridge **42081** 同一 pid | 正常 |
| 重启链路 v2.1 | 日志 09:12:30 `watcher start` → 09:12:42 `web ready: http://127.0.0.1:11186/`（12s，链路全绿） | 生效中 |
| `GET /obl-brand/updates` | **200**，`items=[dsh-creator-mode-plus 0.3.12 → 0.3.13]` | 通，且有 1 个待更新 |
| `GET /obl-brand/tasks` | 200 `{ok:true, active:true}` | 有活动任务（本轮对话）→ 重启会弹确认 |
| brand 自检 | tsc 0 错，build 正常，selfcheck **21/21** | 绿 |
| panel 自检 | tsc 0 错，build 正常，selfcheck **18/18** | 绿 |
| 版本 | brand **0.1.7** / panel **0.0.17** / core 0.2.19 —— 均**未含** v2.1 这批（VERSION 最后一次提交在 v2.1 之前） | 待 bump |
| 工作树 | 10 改 + 2 新增（`PluginUpdates.tsx`、handoff 文档）**全部未提交**；CHANGELOG 无 v2.1 条目；`docs/` 未动 | 待收尾 |

一处口径订正：brand 路由**不在** 42081 上——42081 是 http-bridge，仅作活体锚点；`/obl-brand/*` 随宿主 web 口（本次 11186）。42081 请求这两个路由返回 404 属预期。

剩下的分支彼此不兼容（一个要断本会话，一个是纯文档），先请你定这一轮：

交付收尾。先弄清这批改动到底加了什么（文档必须与代码一致），再 bump。

版本策略：brand 和 panel 各按 patch 递增；core 的 `engines.dsh` 也归入这一批，因此 core 递增到 0.2.20（每次改动都递增版本是仓库强制规则）。

现在写文档。先看要改的具体段落。

事实核对完毕，开始写 CHANGELOG 的两条条目。

- 涉及工具: `ask_user_question`, `pwsh`, `read`, `todo_write`

---