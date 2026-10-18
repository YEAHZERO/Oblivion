# Handoff · 2026-10-18 · 重启链路 v2.1 + 三按钮 + 更新插件

> 用于新会话接续。本机现状：DSH 0.2.1-rc.2；宿主 web 口每次启动随机；Oblivion http-bridge 固定 `127.0.0.1:42081`（用它反查宿主 pid 与 web 口）。

## 1. 重启链路 v2.1（守夜人 watcher）

**触发路径**：面板「重启 DSH」→ `POST /obl-brand/restart`（brand 插件）→
1. 删旧锁 → 写 `%TEMP%\obl-brand-watch-restart.cmd` → PowerShell 经 **WMI** 拉起该 cmd（游离在 Electron job 之外）；
2. 路由回 `202`，面板遮罩 + `window.close()`（窗口立即隐藏到托盘）；
3. 900ms 后宿主 `process.kill(ppid, SIGTERM)` 杀 Electron 主进程（host 随 job 结束）；
4. watcher 轮询 `tasklist` 等镜像消失 → `start "" <exe>` 拉起 → 探 `42081` → 反查宿主 pid → 列出监听口 → 探 web 口。

**watcher 关键实现（都在 `oblivion-brand/src/index.ts` 的 `WATCH_CMD`）**
- 锁文件 `%TEMP%\obl-brand-watch-restart.lock`（防连点）；**20s TTL**（应用 20s 没消失 → `expired` 退出，不误触发）；
- **PID 取法**：`netstat … > PIDFILE` 后 `for /f "usebackq tokens=5" … in ("%PIDFILE%")`。
  ⚠️ **WMI 游离 cmd 里 `for /f` 的"命令形式"整体空产出**（连 `'echo hello'` 都空）；只能读文件。
- **时间戳**：`%DATE:~0,10% %TIME%`（裸 `%DATE%` 含中文星期 GBK 字节，UTF-8 读会乱码）；
- **探活**：`curl http://127.0.0.1:42081/`；ready 后从宿主监听口里剔掉 42081、取第一个 HTTP 应答口作为 web 口，日志写 `watcher web ready: http://127.0.0.1:<port>/`。
- 顺序：**先 ARM 再清扫/杀**（helper 与 app 共享 job，arm 晚了会一起死 → "关了不回来"）。

**日志关键行**（`%TEMP%\obl-brand-restart.log`）：
`watcher start` → `watcher arm: exit=0` → `watcher relaunch` → `watcher ready: bridge 42081 up (host pid=N)` → 端口清单 → `watcher web ready: http://127.0.0.1:PORT/`；异常：`watcher expired` / `watcher ready timeout`。

**实测**：3/3 全绿；宿主空窗 ~1.5s；ready 9.9–12.7s（大头是冷启动）；托盘退出不会被误拉起；无残留 watcher。

**限制**：强杀丢最后未落盘增量；`app.quit()` 优雅链插件不可达（只有托盘退出走）；重启感知 10–12s 里 ~8–10s 是冷启动，继续优化 Space 在启动侧。

## 2. 面板三按钮（一行，顺序固定）

`重启 DSH` → `检查更新` → `清理孤儿进程`（`Panel.tsx` 一行 `flex-start` gap 8）。
- `RestartControl.tsx` 拆成 `RestartControl`（重启 + 确认弹窗 + 遮罩秒关）与 `OrphanControl`（清理）；
- 重启确认：先 GET `/obl-brand/tasks`，**有活动任务才弹**「退出 DeepSeek Harness？/ 当前正在运行的任务将会中断」（页面内复刻原生弹窗）；无任务直接重启；
- 清理孤儿：`POST /obl-brand/orphans`，只杀 web-login 遗留传输进程，不重启。

## 3. 更新插件（brand 路由 + panel 组件）

- `GET /obl-brand/updates`：读 profile `package.json` 依赖 → 跳过 `link:/file:/workspace:/npm:`、`@oblivion/*`、`@deepseek-ai/*` → 查 `registry.npmjs.org/<pkg>/latest` → 返回 `{ok, items:[{name,current,latest}]}`。首次约 8s（npm 查询）。
- `POST /obl-brand/updates/apply {names}`：白名单校验 → 备份 `package.json.bak-before-updates-<ts>` → 写 latest → 用**内置 pnpm**（`resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.cjs`，经 `process.execPath` + `ELECTRON_RUN_AS_NODE=1`）跑 `pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0` → 回读安装版本；失败回滚。
- panel：`PluginUpdates.tsx`（检查更新 → 弹窗勾选 → 更新所选 → 提示"重启 DSH 后生效"）。
- **不做兼容预检**：不兼容插件（如 `dsh-web-search-pro`、`@anweat/dsh-browser`，最新版仍是 0.2.1 且 peers `<0.2.1-0`）更新后仍会被 DSH 0.2.1 预检跳过，等作者发版。

## 4. 已修历史坑（都该在 selfcheck 里防回潮）

| 坑 | 修法 |
| --- | --- |
| 路由 404 但日志 `mounted` | `server.register()` 返回 disposer；effect 必须 **返回** disposer：`ctx.effect(() => () => { check(); apply(); })`，不能调用它。已加 fiber 语义断言 |
| watcher `host pid=` 空 | `for /f` 命令形式在 WMI cmd 空产出 → 先 netstat 落文件再 `usebackq` 读 |
| 日志时间戳乱码 | `%DATE:~0,10% %TIME%` |
| `@oblivion/core` 被拒载 | core `package.json` 加 `engines.dsh: ">=0.2.0-rc.2 <0.3.0"`（DSH 规则：有 engines.dsh 就忽略 peers） |
| 版本兼容审计 | 仅 web-search-pro / dsh-browser FAIL；其余全部 PASS；free-search 0.9.3、sidebar 0.28.0、cost-meter 1.8.36、market 1.66.37、billion-context 0.1.199 已升 |
| dshmarket 每次启动 warn | `dshmarket/lib/hot.js:674` 单引号未转义（`- id: 'mkt-${row.id}'`，id 自带引号 → YAML 坏）；旁支，等本地补丁或上游 |

## 5. 自检与文件

- `oblivion-brand`: `node scripts/selfcheck.mjs` → **21/21**（含 8 条路由断言、守夜人正文断言、effect disposer 断言）；
- `oblivion-panel`: selfcheck **18/18**；
- 关键文件：`oblivion-brand/src/index.ts`（watcher/路由/更新）、`oblivion-panel/src/client/{RestartControl,PluginUpdates,Panel}.tsx`、桌面 `dsh-watch.ps1`（`-Mode status|wait` 监控）、`%TEMP%\obl-brand-restart.log`。

## 6. 新会话开场建议

1. `powershell -File C:\Users\liveu\Desktop\dsh-watch.ps1 -Mode status` → 得宿主 pid 与 web 口；
2. 验证 `GET /obl-brand/updates` = 200 且 `items` 合理；
3. 再继续任何新功能；改完 `tsc && node scripts/build.mjs && node scripts/selfcheck.mjs`，再重启 DSH 验收。
