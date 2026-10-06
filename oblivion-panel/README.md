# @oblivion/panel

**Oblivion 认知面板** —— 把 [`@oblivion/core`](../oblivion-core/README.md) 的观测数据（捕获率、拦截原因、调参建议、最近沉淀）
做成一个 **tab 嵌进 [`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar) 的那一列**。

> 设计判断：**不自己造文件树**。文件夹树 / 编辑器 / 侧边对话由 `dsh-better-sidebar` 提供，
> 本插件只在它的座位上加一个「认知层观测」页 —— 这样两边的更新互不打架。

---

## 一、它长什么样

在 side bar 的 `+` 菜单里多一个 **Oblivion** 页（`order: 70`，单例）：

```
core v0.1.6 · 面板 v0.0.1 · 刷新于 刚刚            [刷新]
─────
捕获率   判定轮数   已评估   已沉淀
 3.3%      12        9        1
主要拦截原因：answer-too-short（5 次）

调参建议（暂无：样本不足时 core 刻意不开口）
最近判定
  5 分钟前  被拦下 · 分值 0.21
  below value threshold
最近沉淀（1）
  一条知识 / 主题 测试主题 / ts-1
知识库笔记（1）
  测试主题.md · 2 分钟前
```

- **空态会解释原因**（没装载 core / 有判定但没沉淀 / 数据目录找不到），不是一句「暂无数据」；
- **只读**：唯一的动作是「刷新」和「点笔记 → 交给 side bar 打开」；
- 点笔记用 side bar 自己的 `onOpenFile`，所以走的还是它的编辑器与预览。

## 二、架构（为什么是「Node 半边 + 浏览器半边」）

```
@oblivion/core  ──写──▶  ~/.oblivion/data/{status.json, decisions.jsonl, ts-*.json}
                          C:\Library\那些渐渐被遗忘\01_问答沉淀\*.md
                                   │
                    ┌──────────────┴───────────────┐
                    │  @oblivion/panel · Node 半边  │  GET /oblivion-panel/status（只读 JSON）
                    └──────────────┬───────────────┘
                                   │  fetch
                    ┌──────────────┴───────────────┐
                    │  @oblivion/panel · 浏览器半边 │  ctx.betterSidebar.registerTab(...)
                    └──────────────────────────────┘
```

| 半边 | 做什么 | 不做什么 |
| --- | --- | --- |
| Node（`src/index.ts`） | 启动标记 + 自证据文件 + **一条只读路由** | 不写任何业务数据、不 import core |
| 浏览器（`src/client/`） | 注册 side bar tab + 渲染 | 不读文件（没有 fs 权限） |

**为什么读 core 的文件而不是调 core 的服务**：两个插件解耦；core 不在时本插件仍能装载并显示「还没有数据」——
否则一个可选依赖缺席就会让整行插件被静默禁用，那更难排查。

**降级**：`ctx.betterSidebar` 不存在 → 只记一条日志、不注册 tab、**不抛错**（`registerPanelTab` 的三种结局都有测试钉住）。

## 三、快速开始

```powershell
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
$panel = 'C:\Projects\Oblivion\oblivion-panel'

& $node $pnpm -C $panel run build        # lib/index.js + lib/testkit.js + lib/client.js
& $node $pnpm -C $panel run selfcheck    # 8 项：路由真跑 + 注册三态 + 无残留

# 装链接（正斜杠！）
& 'C:\Programs\AITech\DeepSeekHarness\resources\runtime\cli\bin\dsh.cmd' plugin --profile desktop add "link:$($panel -replace '\\','/')"
```

```yaml
# 在 %USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml 末尾追加（@ 开头必须加引号）
- insert:
    - id: '@oblivion/panel'
      name: '@oblivion/panel'
```

**激活**：

- Node 半边：**落盘即装载**（profile 补丁层被监视）—— 实测新插入行后路由立刻 200，**不用重启**；
- 浏览器半边：**硬刷新页面**（`Ctrl+Shift+R`），然后在 side bar 的 `+` 菜单里找 **Oblivion**。

### 立刻验证

```powershell
Invoke-WebRequest 'http://127.0.0.1:19387/oblivion-panel/status' -UseBasicParsing |
  Select-Object -ExpandProperty Content | ConvertFrom-Json |
  Select-Object panelVersion, @{n='core';e={$_.core.version}}, @{n='判定';e={$_.trace.recent.Count}}, @{n='条目';e={$_.items.Count}}
```

## 四、配置

在 profile 补丁的 insert 行里补 `config:`（**整段替换**，缺省用默认值）：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `dataRoot` | `~/.oblivion/data` | 读 core 落盘数据的位置 |
| `fallbackMdRoot` | `C:/Library/那些渐渐被遗忘` | core 的 `status.json` 缺失时的知识库兜底位置 |
| `recentLimit` | `10` | 每类最多显示多少条（1..50） |
| `routePath` | `/oblivion-panel/status` | 只读路由路径 |

## 五、验收状态

| 项 | 结果 |
| --- | --- |
| `pnpm run build` | ✅ `lib/index.js` + `lib/testkit.js` + `lib/client.js`（16.6 KB） |
| `pnpm run typecheck` | ✅ 0 错误（strict） |
| `pnpm run test` | ✅ **13/13**（快照装配 / 坏行容忍 / 空态回退 / 注册三态 / 展示层纯函数） |
| `pnpm run selfcheck` | ✅ **8/8**（路由真跑返回 JSON、非 GET 405、webServer 缺席不抛错、disposer 随 effect 释放） |
| `dshx check` | ✅ manifest / export / boot-marker / client-platform（**无 default export**） |
| `pnpm run verify:dsh`（根） | ✅ 契约 **5/5**（host / `webServer` / `npmPkg dsh-better-sidebar` / `__ModuleLoader__` / mount dependencies） |
| Node 半边真实装载 | ✅ **已验证**：路由 `HTTP 200` + `%TEMP%\oblivion-panel\host-mount.json` |
| 浏览器半边渲染 | ⏳ **待目视确认**（硬刷新后看 `+` 菜单里有没有 Oblivion 页） |

## 六、已知边界

1. **依赖第三方座位**：面板只能挂在 `dsh-better-sidebar` 里；它没装时本插件静默降级（不注册 tab），
   契约校验用 `npmPackages` 断言把「它在本 profile 里装着」钉住（见 `.design/DSH-COMPAT.md`）。
2. **读的是文件不是服务**：core 的落盘格式变了要同步改 `src/snapshot.ts`（同一份仓，改动可控）。
3. **不含会话原文**：路由只暴露计数、拦截原因、条目标题与路径；消息正文不进响应。
4. 只读：面板不会替你做任何写操作（沉淀/调参都在 core 与 config 里）。
