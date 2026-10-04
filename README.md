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
