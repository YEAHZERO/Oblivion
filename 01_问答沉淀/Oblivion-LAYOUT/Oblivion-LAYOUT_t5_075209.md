# Oblivion-LAYOUT · 轮 5

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

同时将每次的修改日志按照规则加入C:\Projects\Oblivion\.memory。

## 回答

I'll learn the `.memory` conventions first, then record this round's log.

Now I understand the rules. Let me write today's daily log and the alpha increment record.

The repo already has a precedent for same-version increments. Let me follow it.

One flaw: I used a typographic `»` where a closing backtick was intended. Let me fix that.

已按 `.memory/README.md` 的规则补齐本轮记录，并把「每轮要写什么」从惯例变成显式约定。

## 一、先摸清规则（`daily/` 之前是空的）

`.memory/README.md` 规定了目录与命名，但**`daily/` 里只有 `TEMPLATE.md`，一条日志都没有** —— 之前几轮只更新了 `TODO.md`，其余两条漏了。所以这次不只是补一份日志，而是把缺失的那一环写进规则。

我沿用的关键先例：`release/alpha/v0.0.1.md` 里已有一节「仓库边界收缩（同一版本内的后续修订）」，并写明**同一版本内未发布的增量追加到同文件、不另开版本**。本轮的增量按同一处理。

## 二、写入的三处

| 文件 | 行数 | 内容 |
|---|---|---|
| [daily/2026-10-03.md](.memory/daily/2026-10-03.md) | 139 | 按模板五段：今日完成 / 进行中 / **遇到的问题** / 明日计划 / 备注 |
| [release/alpha/v0.0.1.md](.memory/release/alpha/v0.0.1.md) | +115 | 新增一节「Phase 1 / 4a / 4b / 4c 第一批 / Web 形态（同一版本内的后续增量）」 |
| [README.md](.memory/README.md) | +30 | 新增「**每轮结束时的固定动作**（三步，缺一不可）」表 |
| [TODO.md](.memory/TODO.md) | 指针 | 轮次记录里指明上面两份日志的位置 |

**daily 日志里的「遇到的问题」是这轮真正的价值**，8 条，每条都写了「怎么被发现的」而不是只写结论：

1. Windows 上 `kill('SIGTERM')` 不投递信号 → 把信号源做成可注入才测得动
2. Node 信号监听器是 unref 的 → `oblivion web` 启动完即退，需要显式 `hold`
3. 过渡时长写成 `px(120)` → 浏览器丢声明、动画静默失效（测试断言样式串才发现）
4. 生成产物被 prettier 改写 → `tokens:check`/`icons:check` 报过期（**令牌表踩过一次，图标表又踩了一次**）
5. `createLayoutStore()` 快照每次新建对象 → `useSyncExternalStore` 无限重渲染
6. `server.close()` 被 keep-alive 卡住 → `npm test` **整个套件挂住**（不是某条用例变红）
7. 图标提取的六个坑（含「节点必须递归」—— 94 个里 75 个含嵌套 children，拍平**不报错、只是画错**）
8. 沙箱开工时无法给工作区授权，所有嵌套工具调用失败

**alpha 记录按该目录 README 的「必须写」清单**逐项交代了：CLI 参数变化表（`--port` / `--web-dir` / 四个 dump 参数 / 三个护栏 / `init`）、依赖变化表（react·react-dom 走 peerDependencies、esbuild、**marked 已装未用**、js-yaml 进 `dependencies`）、新增产物目录、以及「破坏性变更：无」并说明原因（未发布版本不构成对使用者的破坏）。同时**更新了旧的「已知问题」**：26 包契约骨架、`bump-version.ps1` 口径两条已用删除线标为已解决，另列 4c 剩余四项与待定项。

## 三、把规则写死，免得下一轮又漏

`.memory/README.md` 的「对于 AI Agent」下新增一张表：

| 步 | 写什么 | 规则 |
|---|---|---|
| ① | `daily/YYYY-MM-DD.md` | 五段式；没有今日文件就按模板建 |
| ② | `release/alpha/v<版本>.md` | **改了行为、依赖、持久化格式或 CLI 参数就必须写**；同版本未发布的增量追加到同文件 |
| ③ | `TODO.md` | 勾已做、补新增，并留一段「本轮已执行」 |

并补了一句边界：**对外可读的版本说明写仓库根 `CHANGELOG.md`，不要只写在 `.memory/`** —— 这个目录不入库。

## 四、一处需要说明的修正

首次写出后我发现代码标识用的引号写错成了印刷体 `»`（`«»` 只替换了左半），导致 `### Phase 1 — 内核（`oblivion-core»，…）` 这种标题。已修正并复核**反引号成对**（daily 256 个、alpha 334 个，均为偶数）。

## 五、门禁（`.memory` 改动不影响任何门禁）

```
lint 0 · typecheck 0 · npm test 645/645 绿
```

`.memory/` 与 `.design/` 都在 `.gitignore` 与 `.prettierignore` 里，`git status` 中**不出现任何 `.memory` / `.design` 条目** —— 符合「本目录不入库」的规则。

## 六、下一步

本轮改动（20 个修改 + 29 个新增路径）**仍未提交**。你要的其余四项（DOM 工具 → 锚点浮层 → `SettingsForm` → `MarkdownText`）以及 `marked` 去留、版本是否递增，我会在下一轮继续，并按上面这张三步表逐轮记录。

- 涉及工具: `run_code`

---