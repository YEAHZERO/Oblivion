# Oblivion

DeepSeek Harness（DSH）**外部插件开发工作区**。

本仓库只存放用 Creator Mode+ / DSHX 开发的外部插件源码 —— 不包含、也不修改 DSH 官方源码。

## 插件放在哪

`dshx_scaffold` 把插件源码建在**本工作区根目录**下，一个插件一个目录：

```
Oblivion/
└── <plugin-name>/                 ← 插件源码，本仓库跟踪
    ├── src/<plugin-name>.ts
    ├── src/client/index.tsx       ← kind=client 时
    ├── package.json
    ├── dshx.yml                   ← id / entry / marker / kind
    ├── cordis.yml                 ← 相对路径 overlay
    └── tsconfig.json, tsdown.config.ts   ← kind=client 时
```

同时在 Harness checkout 里建一个**符号链接**指回工作区：

```
C:\Projects\deepseek-harness\my-plugins\<plugin-name>
    ->  C:\Projects\Oblivion\<plugin-name>
```

源码只存在于工作区，harness 侧只有链接 —— 所以**本仓库是插件源码的唯一事实源**。

## 环境前置

| 项 | 值 |
| --- | --- |
| Harness checkout | `C:\Projects\deepseek-harness`（tag `dsh-v0.2.0-rc.2`，HEAD `639ed01539`） |
| DSHX | `C:\Projects\deepseek-harness\tools\dshx`（v0.9.5） |
| 指向配置 | `C:\Users\liveu\.config\dshx\harness`，内容为 Harness checkout 路径 |
| 备选 | 环境变量 `DSHX_HARNESS`（需重启 DSH 才生效；配置文件方式无需重启） |

Windows 需要**开发者模式**才能创建符号链接（DSHX 全程使用 `symlinkSync`，无 junction 回退）。

## 常用命令

Creator Mode+ 会话里直接说需求即可，Agent 会调用固定的 `dshx_*` 工具。手工核对时也可以用 CLI：

```powershell
$dshx = 'C:\Projects\deepseek-harness\tools\dshx'
node --import "file:///$($dshx -replace '\\','/')/node_modules/tsx/dist/esm/index.mjs" `
     "$dshx\src\cli.ts" status --harness 'C:\Projects\deepseek-harness'
```

> 注意 `--import` 必须接收 `file://` URL：裸 Windows 路径会被当成 `c:` 协议而报
> `ERR_UNSUPPORTED_ESM_URL_SCHEME`。

## 红线

DSH 官方源码、内置包、官方构建产物一律**只读**，临时副本和 worktree 也不例外。
缺少公开接口时调整插件方案，不要改 Host。构建产物留在插件目录内部。

## 已知限制（本机实测，2026-10-04）

### 1. 服务端热重载在 Windows 桌面端不可用

DSHX 的 host discovery 依赖 POSIX 工具（`tools/dshx/src/internal/host-discovery.ts`）：

```js
spawnSync('ps',   ['-axo', 'pid=,ppid=,command='])   // 进程表
spawnSync('ps',   ['-o', 'lstart=', '-p', pid])      // 进程启动时间
spawnSync('lsof', ['-a', '-p', pid, '-Fn'])          // 打开的文件
```

Windows 上没有支持 `-o`/`-axo` 的 `ps`，`lsof` 也不存在，因此 `discoverWebHosts`
恒为 `complete: false`。实测影响：

| 流程 | 影响 |
| --- | --- |
| `dshx scaffold` / `check` | 不受影响 |
| `dshx activation-plan` | 优雅降级：`activation.ts` 在 discovery 不完整时保守置 `hasHost = true` |
| `dshx activate-new-client` | 不受影响（走桌面桥接，不经 host discovery） |
| `dshx hot-reload` | **硬抛**：`hot-reload.ts` 的 desktop identity 与 process-start 两处校验 |
| `dshx update apply/rollback` | 硬抛；但源码变更阶段在 Creator Mode+ 里本就已禁用 |

> **约定：服务端代码改完重启 DSH App 生效，不要依赖热重载。**

### 2. `dsh-creator-mode-plus` 在本机打了两个 Windows 补丁

补丁位于 `~/.dsh/profiles/desktop/node_modules/dsh-creator-mode-plus/`，
原文件备份为同目录 `*.orig-backup`。**插件升级或重装会覆盖它们**，届时需重打：

| 文件 | 问题 | 修法 |
| --- | --- | --- |
| `src/desktop-profile.js` | `installAnchor` 由 `path.join` 生成，Windows 下是反斜杠，`endsWith('/node_modules/…')` 恒假 → 整个插件激活失败 | 归一化分隔符后再比较 |
| `src/runner.js` | `--import` 收到裸 Windows 路径被当作 `c:` 协议 → `ERR_UNSUPPORTED_ESM_URL_SCHEME` | 改用 `pathToFileURL(loader).href`（两处调用点） |

两者都是插件自身的跨平台缺陷，与本仓库无关，建议反馈上游
（`dsh-creator-mode-plus` 0.3.12 为 npm 最新版，尚未修复）。
