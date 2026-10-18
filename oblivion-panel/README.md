# @oblivion/panel

**Oblivion 认知面板** —— 把 [`@oblivion/core`](../oblivion-core/README.md) 的观测数据（捕获率、拦截原因、判定曲线、调参建议、知识库）
做成一个 **tab 嵌进 [`dsh-better-sidebar`](https://github.com/omdsh-dev/DSH-better-sidebar) 的那一列**。

> 设计判断：**不自己造文件树**。文件夹树 / 编辑器 / 侧边对话由 `dsh-better-sidebar` 提供，
> 本插件只在它的座位上加一个「认知层观测」页 —— 这样两边的更新互不打架。

---

## 一、它长什么样

在 side bar 的 `+` 菜单里多一个 **Oblivion** 页（`order: 70`，单例）：

```
core v0.1.6 · 面板 v0.0.14 · 刷新于 刚刚            [刷新]
─────
捕获率   判定轮数   已评估   已沉淀
 3.3%      12        9        1
主要拦截原因：answer-too-short（5 次）

调参建议（暂无：样本不足时 core 刻意不开口）
判定曲线
  │ 1.0 ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ │ ← 红色虚线 = core 的 valueThreshold（0.30）
  │ 0.5        ╱╲      ╱╲                │
  │ 0.0 ──────╱──╲────╱──╲────────────── │ ← 点 = 一次判定，红点 = 被拦下
  最近 24 条判定 · 有效分值 22 个 · 无分值 2 条 · 阈值 0.30 · 区间 0.21–0.80
知识库（3）
  问答笔记 2 · 会话整理 1 · 主题页 2 · 条目 3（同主题的多版并作一行，共 3 行）
  测试主题            2 分钟前 · 当前版本 · 已落地 · 共 2 版
    相关主题：主题页甲、主题页乙 · 关键词：#dsh #panel #cordis · 日期：2026-10-06
  2026-10-06-整理     4 分钟前 · 当前版本 · 会话整理
    相关主题：未归并 · 日期：2026-10-04
  孤条目              6 分钟前 · 仅入库
    相关主题：未归并 · 关键词：#mcp #bridge · 日期：2026-10-06
  [展开全部 47 行（另有 36 行仅入库）]
```

- **判定曲线**（2026-10-06 所有者：「最近判定也不需要这么多，可以给个图表曲线看看」，随后改成
  「删掉『最近判定』这个区域」）：逐条判定**没有列表**，全由这条曲线承载 ——
  纵轴**恒为 0..1**（不按数据自适应，这样两次刷新、两条曲线之间能直接比），红色虚线是 core 的
  `valueThreshold`，浅色折线是滑动均值；一个点 = 一次判定，鼠标停上去显示「时间 · 动作 · 分值」；
  没有分值的行（`no-qa`）**不落点**，只计入「无分值 N 条」。
  想看「为什么没沉淀」看上面的「主要拦截原因」；快照里的 `trace.recent` 仍在（契约没删），只是不渲染。

- **知识库只有一栏**（2026-10-06 裁定的方案 A）：以笔记为骨架（能点开、名字是人写的），
  把同主题条目的**状态与版本**挂在它后面；没有笔记的条目补成一行并标「仅入库」/「会话整理」。
  此前并列的「最近沉淀 + 知识库笔记」两栏已合并 —— 同一批标题列两遍，看起来就是冗余。
  「仅入库」（实测 47 行里占 36 行）默认只列最近 5 行，其余按需展开（`knowledgeView()`）。
- **每个文档下方就是「相关主题 / 关键词 / 日期」三段**（2026-10-06 所有者：「知识库，将每个文档下方
  显示：相关主题和关键词、日期」）。文案只有一份（`client/knowledge.ts` 的 `detailParts()`，纯函数）：
  - `相关主题` = 笔记里的 `> Wiki： [[标题]]` 回链（`oblivion_wiki` 写回的那条）。宿主半边
    （`snapshot.ts` 的 `parseNoteHead()`）把标题**解析成主题页路径**，所以点它直接在侧边栏打开那页；
    没有回链的写「未归并」—— 那正是「该跑一轮 `oblivion_wiki`」的信号（现场 10 篇里 6 篇已归并）。
    多于 2 个折成 `+N`。
  - `关键词` = 笔记 frontmatter 的 `tags` 并上**同主题条目**的 `tags`（去重保序，最多显示 5 个，
    其余折成 `+N`）。
  - `日期` = 笔记自己写的 `updated_at`（退化 `created_at`）；笔记没写就按 mtime / 条目时间折算成
    **本地**日期。整理件没有 frontmatter，日期取自它的 `>Date :` 行。
  - 三段都缺的极端情况不显示这一段（不拿「暂无」凑数）。解析只读每篇笔记**头部 8 KB**，不整读正文。
- **空态会解释原因**（没装载 core / 有判定但没沉淀 / 数据目录找不到），不是一句「暂无数据」；
- **只读为主**：数据面唯一的动作是「刷新」和「点笔记 → 交给 side bar 打开」；
  另有**两个宿主动作按钮**（见下），它们不属于数据面，走 `@oblivion/brand` 的路由。
- 点笔记用 side bar 自己的 `onOpenFile`，所以走的还是它的编辑器与预览。

### 三个宿主动作（一行，顺序固定）

面板底部现在是**一行三按钮**（`flex-start` gap 8）：

| 按钮 | 路由 | 作用 |
| --- | --- | --- |
| 重启 DSH | `POST /obl-brand/restart` | 强制结束并重新拉起桌面端（服务端代码改动要靠它生效） |
| 检查更新 | 弹窗内触发 | `GET /obl-brand/updates` 拿到清单 → 勾选 → `POST /obl-brand/updates/apply {names}` → 提示「重启 DSH 后生效」 |
| 清理孤儿进程 | `POST /obl-brand/orphans` | **不重启**：结束 web-login 遗留的无头 Edge 传输进程 |

「清理孤儿进程」解的是这个现场：web-login 的无头 Edge 传输进程在 DSH 被硬杀之后活了下来，
继续占着 `~/.dsh/web-login/transport-profile`，于是下一次探活 `rmSync` 抛 EPERM，**几个账号全部校验失败**。
按钮会显示「已清理 N 个孤儿进程（扫描 M 个进程，命中 K 个传输进程）」，没有孤儿时明说「没有发现」。
判定与安全边界（只认 transport profile 命令行、`orphans` 模式只杀父进程已死的）全在 brand 的
`src/orphans.ts`，面板这边只做按钮 + 文案 —— 机制只有一份。brand 未装/被停用时三条路由都 404，会给出明确文案。

「重启 DSH」的确认口径是**先问一次任务状态再决定**：点下后先 `GET /obl-brand/tasks`，
`active: true` 才弹页面内复刻的原生确认「退出 DeepSeek Harness？当前正在运行的任务将会中断」；
`active: false` 直接走重启，不弹确认（与托盘「退出」同一条纪律）。收到 202 后铺全屏遮罩
并等两帧再 `window.close()` —— 真正的进程终止仍由 brand 的 helper/watcher 负责。

### 设置页：**设置 → Oblivion 知识库**（0.0.17 / 0.0.18 继承）

同一个插件的**第四个注册**：官方 `settings.section` 座位（`id: oblivion-knowledge`，`order: 47` ——
品牌 45 → 键盘导航 46 → 知识库 47）。面板那一列是**只读观测**，配置改在设置里，
面板的知识库那一栏会指一句「路径与自动整理：设置 → Oblivion 知识库」。

| 组 | 键 | 说明 |
| --- | --- | --- |
| 知识库位置 | `mdRoot` | 默认 `~/OblivionKB` |
| 自动整理 | `organize.enabled` / `digest` / `retitle` / `autoApply` / `everyTurns` / `minIntervalMs` / `batchSize` / `maxTokens` / `timeoutMs` | 总开关默认关；`autoApply` 默认关（回填只出预览） |
| 模型与自动切换 | `organize.provider` / `model` / `fallbacks` | 留空 = 跟随宿主默认选路；`fallbacks` 就是「主路失败按序试」 |
| 判定阈值 | `semanticThreshold` / `valueThreshold` | 面板「调参建议」给候选值的就是这两个 |

**读写的两条通路都在 core 那儿**（`oblivion-core/src/settings-route.ts` 的
`GET|POST /oblivion-core/settings`），本插件只 `fetch` 同源路由：

- core 的定位是「写语义只有一份」（`sanitizeSettings` + 深合并 + 原子写 + `null` = 恢复默认）；
- 面板的定位是「**只读**数据面，绝不重写别人的文件」；
- Cordis 服务表**跨插件取不到**（实测桥接 `inject: ['oblivion']` 从未激活）⇒ 面板也没法
  `ctx.get('oblivion')` 反过来调 core。

于是：**core 挂路由、面板只 fetch**。写下去的键压过 profile 的插件 config，但仍要**重启 DSH**
才生效（配置在 `apply()` 那一刻就固化进各子模块了）。

三条「如实显示」都是被真实 bug 推出来的（`settings-model.ts` 里逐条记了）：

| 界面元素 | 解的问题 |
| --- | --- |
| 每个值旁的**来源**徽标（设置页 / 插件配置 / 默认值） | 「我改了怎么没生效」只能靠猜三层配置的先后 |
| **待重启**徽标 + 一条待重启横幅（带重启按钮） | `pending` 非空是**常态**（写下去的值下一轮装载才生效），不说清就会被当成 bug |
| provider / model 下拉框补一条「（不在宿主清单里）」 | 否则 `<select>` 找不到当前值会**静默跳到第一项**，用户一保存就把配置改了 |

**模型候选来自宿主的 provider 注册表**（`catalog`），所以用户自定义 provider（profile 里经
`dsh-llm-pi-ai` 的 `config.providers` 登记、`baseURL` 指向自建服务的，如本机的 `agnes` /
`agnes-api`）与官方 provider **一视同仁**，插件不做白名单、也**不经手密钥**（只报 provider / model）。

**降级**：core 版本 < 0.2.17（没有这条路由）→ 页面显示「这条路由是 0.2.17 起的」而不是白屏；
宿主没有 `llm` 服务 → 下拉框为空并写明「要在 profile 的 `llm-pi-ai` 里登记 provider，本页不碰密钥」；
`slots` 服务缺席 → 只记一条日志，**不影响**面板 tab（与左栏入口同一套渐进注册）。

**怎么在真机上核对这一页真的挂上了**（自证据）：浏览器半边把自己的状态 POST 给 `/oblivion-panel/diag`，
落盘 `<dataRoot>/panel-client-diag.json`。文件里永远是**最后一次**报告，看 `where` 分辨种类：

| `where` | 什么时候发 | 里面有什么 |
| --- | --- | --- |
| `client` | 客户端 entry 装载时 | ctx 形状 + 各 UI 注册的 **`requested`**（`inject` 没抛，不代表已挂上） |
| `settings-section` | **设置分节被真的挂载并 GET 过一次** | `id` / `order` / `version` / `providers` / `routeSource` / `routes` / `pending` / `values`；失败时是 `error` + HTTP `status` |
| `open-note` / `leftbar-click` | 点了一下 | 那一次点击的 `outcome` |

`settings-section` 那一条是这一页的**现场证据**：只有设置外壳把这个座位渲染出来，组件才会挂载、
才会发它 —— 所以「座位改名了 / 外壳没装载」在这里表现为**这条缺失**，而不是一个乐观的 `true`。

## 二、架构（为什么是「Node 半边 + 浏览器半边」）

```
@oblivion/core  ──写──▶  ~/.oblivion/data/{status.json, decisions.jsonl, ts-*.json}
                          C:\Library\那些渐渐被遗忘\01_问答沉淀\*.md
                          C:\Library\那些渐渐被遗忘\04_会话整理\*.md
                          C:\Library\那些渐渐被遗忘\02_Wiki页面\*.md（主题页，0.0.14 起当字典读）
                                   │
                    ┌──────────────┴───────────────┐
                    │  @oblivion/panel · Node 半边  │  GET /oblivion-panel/status（只读 JSON）
                    └──────────────┬───────────────┘
                                   │  fetch
                    ┌──────────────┴───────────────┐
                    │  @oblivion/panel · 浏览器半边 │  ctx.betterSidebar.registerTab(...)
                    └──────────────────────────────┘    + slots.register('settings.section', …)
```

设置页那条通路**不经过本插件的 Node 半边**（它只读，一个字节都不写）：

```
设置页（浏览器半边） ──fetch──▶ @oblivion/core 的 GET|POST /oblivion-core/settings
                                        └── 写 <dataRoot>/settings.json（sanitize + 深合并 + 原子写）
```

| 半边 | 做什么 | 不做什么 |
| --- | --- | --- |
| Node（`src/index.ts`） | 启动标记 + 自证据文件 + **一条只读路由** | 不写任何业务数据、不 import core |
| 浏览器（`src/client/`） | 注册 side bar tab + 设置分节 + 渲染 | 不读文件（没有 fs 权限）、**不重写别人的文件** |

**为什么读 core 的文件而不是调 core 的服务**：两个插件解耦；core 不在时本插件仍能装载并显示「还没有数据」——
否则一个可选依赖缺席就会让整行插件被静默禁用，那更难排查。

**为什么设置页只 `fetch` core 的路由**：写语义（sanitize / 深合并 / 原子写 / `null` = 恢复默认）
只该有一份，而 Cordis 服务表**跨插件取不到**（实测桥接 `inject: ['oblivion']` 从未激活）
⇒ 面板既不能自己写文件、也不能 `ctx.get('oblivion')` 去调 core，只剩同源 HTTP 这一条。

**降级**：`ctx.betterSidebar` 不存在 → 只记一条日志、不注册 tab、**不抛错**（`registerPanelTab` 的三种结局都有测试钉住）；
`slots` 服务不存在 → 左栏入口与设置分节一起降级，面板 tab 不受影响。

## 三、快速开始

```powershell
$node = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
$pnpm = "$env:USERPROFILE\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs"
$panel = 'C:\Projects\Oblivion\oblivion-panel'

& $node $pnpm -C $panel run build        # lib/index.js + lib/testkit.js + lib/client.js
& $node $pnpm -C $panel run selfcheck    # 18 项：路由真跑 + 注册三态 + 三段落盘 + 无残留 + 设置分节跨包契约

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
| `fallbackMdRoot` | `~/OblivionKB` | core 的 `status.json` 缺失时的知识库兜底位置（**与 core 的 `mdRoot` 默认值保持一致**；`~/` 写法在组装快照时展开） |
| `recentLimit` | `10` | 「最近判定」列表的**窗口**条数（1..50）；默认只显示最近 6 条，其余按需展开（判定曲线另有上限 240 点，不可配） |
| `routePath` | `/oblivion-panel/status` | 只读路由路径 |

## 五、验收状态

| 项 | 结果 |
| --- | --- |
| `pnpm run build` | ✅ `lib/index.js` + `lib/testkit.js` + `lib/client.js` |
| `pnpm run typecheck` | ✅ 0 错误（strict） |
| `pnpm run test` | ✅ **34 → 44/44**（快照装配 / 坏行容忍 / 空态回退 / 注册三态 / 展示层纯函数 / 知识库合栏 / **文档下方三段** / 判定曲线 / **设置分节：表单 → 补丁**） |
| `pnpm run selfcheck` | ✅ **15 → 18/18**（路由真跑返回 JSON、非 GET 405、webServer 缺席不抛错、disposer 随 effect 释放、合栏、**三段**、曲线、**设置分节的跨包契约**、三按钮渲染、PluginUpdates fetch） |
| `dshx check` | ✅ manifest / export / boot-marker / client-platform（**无 default export**） |
| `pnpm run verify:dsh`（根） | ✅ 契约 **6 → 8/8**（host / `webServer` / `npmPkg dsh-better-sidebar` / `clientPkg dsh-client-ui-settings` / `__ModuleLoader__` / `sidebar.footer.action` / **`settings.section`** / mount dependencies） |
| **设置页真机验收（0.0.17）** | ✅ **14/14**（2026-10-17，完全重启 DSH 后）：座位**真挂载**（`panel-client-diag.json` 的 `where=settings-section` / `id=oblivion-knowledge` / `order=47`）/ 分节内 GET 200 `version=0.2.17` / provider 清单含 `agnes`·`agnes-api` / 「打开会用哪条路」`host-default → agnes-api/agnes-3.0-flash` / `pending=[]` 且 `values=[]` / **`settings.json` 仍不存在**（只读面没碰配置层） |
| **三按钮 + PluginUpdates 真机验收（0.0.18）** | ✅ 2026-10-18 复现 v2.1 日志；`GET /obl-brand/updates` 200 / `items=[dsh-creator-mode-plus 0.3.12→0.3.13]`；`GET /obl-brand/tasks` 200 `{ok:true, active:true}`（本轮对话为活动任务，重启会弹确认） |
| Node 半边真实装载 | ✅ **已验证**：路由 `HTTP 200` + `%TEMP%\oblivion-panel\host-mount.json` |
| 浏览器半边渲染 | ✅ **已验证**（左栏入口 → 右侧 Oblivion 页；合栏 / 判定曲线 / **设置分节四组卡片与两个下拉框**均由所有者目视复核） |

## 六、已知边界

1. **依赖第三方座位**：面板只能挂在 `dsh-better-sidebar` 里；它没装时本插件静默降级（不注册 tab），
   契约校验用 `npmPackages` 断言把「它在本 profile 里装着」钉住（见 `.design/DSH-COMPAT.md`）。
2. **读的是文件不是服务**：core 的落盘格式变了要同步改 `src/snapshot.ts`（同一份仓，改动可控）。
3. **不含会话原文**：路由只暴露计数、拦截原因、条目标题与路径；消息正文不进响应。
4. **面板那一列只读**；配置只有一条写通路：设置页把补丁 POST 给 core 自己挂的
   `/oblivion-core/settings`，由 **core** 写 `<dataRoot>/settings.json` —— 本插件自己不碰任何文件
   （Node 半边一条只读路由，浏览器半边没有任何写文件的代码）。
5. **设置页要重启才生效**：core 在 `apply()` 那一刻就把配置固化进各子模块，所以设置层写下的值
   要下一轮装载才生效。界面用「待重启」徽标 + 横幅把这件事说清楚（`pending` 非空是常态）。
