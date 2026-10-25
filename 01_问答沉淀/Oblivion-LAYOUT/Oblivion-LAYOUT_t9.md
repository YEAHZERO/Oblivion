# Oblivion-LAYOUT · 轮 9

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

web长这样。但是我需要要图二图三这种
把这轮也写进 .memory（daily + alpha 增量 + 设计文档补充），但是保持服务，后续更新是否是热更新，不用重启就能看到更新吗？
那些问题等会我再回答

## 回答

Now the UI shell. Let me rewrite `App.tsx` toward 图二/图三 (chat-app shell), using only APIs I've verified.

Builds green. Let me make `--watch` real, then restart the server so it picks up the new code.

Off-by-one: I removed `main()`'s closing brace. Let me fix it.

At **http://127.0.0.1:55899**, with a rebuild watcher running. Let me verify the new shell is live.

False negatives: esbuild escapes non-ASCII by default. Let me confirm properly and write the `.memory` records.

外壳已换成聊天应用骨架，服务在 **http://127.0.0.1:55899** —— 刷新就是新版。

## 一、你的问题：后续更新是热更新吗？

**现状：不重启服务，但要刷新浏览器。** 拆开说：

| 环节 | 是否需要 | 说明 |
|---|---|---|
| 重启服务 | ❌ **不需要** | 静态处理器按 **mtime 失效缓存**，磁盘上文件一变就重新读 |
| 重新构建 | ❌ **不需要手工做** | 后台任务 `pwsh-2` 正在跑 `npm run web:watch`（esbuild `context()` 监听），改完保存自动重建 |
| 刷新浏览器 | ✅ 需要 | 真正的 HMR（不刷新页面）还没做 —— 上游用 `dsh-client-hmr` 的 SSE 推图重建帧，那是开发期工具，属于待办 |

**顺手修掉的一个真坑**（正好卡在你这个问题上）：静态缓存原先**按路径**缓存文件内容 —— 结果是**重新构建之后刷新浏览器也看不到任何变化**，而且不报错。现在缓存项带 `mtimeMs`，改了才失效。没有这一条，`web:watch` 会自动重建但你看到的还是旧页面，排查起来会很费时间。

## 二、现在能看到的（对齐图二/图三的部分）

已按上游 GUI 的**信息结构**重做：

- **左栏**：`Oblivion` 字标 → 新会话按钮（通栏描边）→ 插件 → **工作区**分组（含搜索/排序/新建窄图标）→ 会话列表（`Oblivion` / `新会话` 高亮 / 两条历史带相对时间 / `默认工作区`）→ 底部用户行 + 内核连接点
- **主区**：居中 `Oblivion` 字标 + `预览版` 标签 → 大输入框（占位符「描述你想要构建的内容，/ 调用指令，@ 文件或对话」）→ 底排 `＋ 工作区内修改 ▾` `⚙ 标准模式 ▾` … `DeepSeek-V41-Flash High ▾` + 圆形发送键
- **帧层仍是活的**：右侧「详情」按钮打开右栏，栏宽由 `computeColumns()` 每帧现算，拖窄窗口看得见让步顺序

**还差的（我不粉饰）**：

1. **188 图标没接进外壳** —— 现在侧栏用 `⊖ ▤ ⌕ ⇅ ＋ ⚙ ↑` 这类占位字符，所以和图二/图三的观感差距主要在这儿；
2. **真实数据没有** —— 会话列表、模型名、用户都是常量（等 Phase 2 的会话 + LLM，以及 §5.3 定的 `/api` 通道）；
3. 输入框交互细节（附件、`/` 指令补全、`@` 文件引用）。

顺带一条环境事实：**你机器上 3080 被别的程序占着**，所以两次启动都靠预检退避到随机端口（这次是 55899）。要不要把默认端口改掉，等你答复那批决定时一起定。

## 三、已写进 `.memory`

| 文件 | 内容 |
|---|---|
| [daily/2026-10-03.md](.memory/daily/2026-10-03.md) | 新增「Web 宿主编落地 + 外壳改版（本日第三轮）」：三席位、`admit()` 一族、fallback 静态、CLI ⑤ 层 patch、profile 改 insert（警告清零）、11 条新测试、外壳改版、mtime 修复、`web:watch`，以及迭代闭环与后台任务号 |
| [release/alpha/v0.0.1.md](.memory/release/alpha/v0.0.1.md) | 追加「Web 宿主编落地与 CLI 重新接线（同版本内增量）」：行为变化、**接口变化表**（移除 `startStaticServer`、新增 `oblivion-core/webserver` 子路径、`VERSION` 移到 `version.ts`）、已知缺口 |
| [design/web通道与webserver形态.md](.memory/design/web通道与webserver形态.md) | 新增「§8 实现状态」：已落地/未落地两张表 + 迭代闭环 + 外壳还原度差距 |

## 四、门禁（本轮结束态）

```
build 0 · typecheck 0 · lint 0 · npm test 657/657 绿
组合行 27 · 层数 29 · 已激活 11 · 失败 0 · 两条常驻警告已消失
```

实机复验（注意 esbuild 默认 `charset=ascii`，CJK 被写成 `\uXXXX` **大写十六进制** —— 我第一次用「明文包含」判定时假阴性了一次）：`新会话` / `描述你想要构建的内容` / `预览版` / `工作区` 都在产物里 ✓，令牌 CSS 仍在 `<script>` 之前 ✓。

## 五、等你答复的那批决定（我记在 daily 的「进行中」里了）

浏览器认证要不要 · 路由级 gzip 要不要补 · webserver 是否独立成包 · 要不要引入 `webStartup` 服务 · 默认端口 · CSP · 设计书包数口径。

另外两个后台任务还在跑：`pwsh-2`（watch）、`pwsh-3`（服务）。要不要我**下一步把 188 图标接进外壳**（这是缩小与图二/图三观感差距的最大一项），还是先做别的？

- 涉及工具: `run_code`

---