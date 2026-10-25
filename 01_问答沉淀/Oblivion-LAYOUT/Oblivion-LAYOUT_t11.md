# Oblivion-LAYOUT · 轮 11

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

后台任务：pwsh-2（watch，running）、pwsh-3（服务，running）————只留一个在用就行
把 188 图标做成可视化图标页
按 DESIGN.MD 逐条对齐排版
做侧栏折叠 + 会话日期分组

## 回答

Keeping just the server. Let me gather the design facts I need first.

Now the icon gallery page and the shell updates.

Now the typography pass — replacing ad-hoc px sizes with the design's tier tokens.

三件都做完了，后台只留一个任务。**刷新 http://127.0.0.1:55899** 就能看。

## 一、后台任务收敛

`pwsh-2`（watch）已停，只留 `pwsh-3`（服务）。重建改由我按需跑 `npm run web:build` —— 反正这几轮都是我在改 UI，你手动改的话告我一声我重建。

## 二、188 图标可视化页

新增 [IconGallery.tsx](packages/oblivion-web-ui/src/app/IconGallery.tsx)，侧栏点「图标」进入：**188 个导出一屏摆出**，按描边档分三组（Regular 1px / Medium 1.3px / 纯填充），每格显示**字形名 + 该字形自己的默认边长**（默认边长不止 16，有 10/14/20 —— 那正是提取期的坑之一，摆在页面上便于核对）。

做它的理由：数量对账只能证明**数目**对，证明不了**形状**对。94 条路径是不是忠实，只有眼睛能判。

## 三、会话日期分组 + 侧栏折叠

- **日期分组**：置顶 / 今天 / 更早。分组标题用 `--obl-font-xxxs-strong-11`，并带 `data-obl-session-group` 便于核对。
- **侧栏折叠**：走的是 4b 已有的几何 —— `toggleSidebar()` + `createFrameStore({ collapsedWidth: 52 })`。折叠后 `cols.sidebar` 变小、`wide` 转 false，标签**自动隐藏**（不需要另写一套窄态布局）。折叠按钮在侧栏标题行右侧，`aria-label` 随状态在「折叠侧栏 / 展开侧栏」之间切换。

## 四、排版按 DESIGN.MD 逐条对齐

**临时 `fontSize: px(N)`：改前 18 处 → 现在 0 处。**

全部换成 §4.1 的**整条简写刻度 token**（family + size + weight + line-height 一次到位），按角色分配：

| 角色 | 刻度 | 实际值 |
|---|---|---|
| 分组标题、提示 | `--obl-font-xxxs-11` | 11 / 14，strong 500 |
| 辅助文案、状态 | `--obl-font-xxs-12` | 12 / 18 |
| 列表行、按钮、header | `--obl-font-xs-13` | 13 / 20 |
| 输入框草稿 | `--obl-font-s-14` | 14 / 22 |

输入框同时**删掉了手写的 `lineHeight`** —— 刻度里已经包含行高，两处都写就是我之前那类「两套尺寸来源」的隐患。

顺带说明两处刻意的选择：`m-18` 名义 18 **实际 16px**（§4.1 的陷阱），我没碰它；小文本按 §3.3 的规则本应**固定不随字号变**（`FIXED_SIZE_ROLES`），我目前用的是 `xxxs-11` / `xxs-12` 刻度 token（会随 delta 偏移）—— 若要严格实现那条，需要给它们换到固定尺寸令牌，这属于待办，我记在日志里了没悄悄糊过去。

## 五、门禁与实测

```
build 0 · typecheck 0 · lint 0 · npm test 657/657 绿
产物含：data-obl-icons ✓  data-obl-session-group ✓  折叠/展开标签 ✓  置顶/更早 分组 ✓
GET / → 200，令牌 CSS 仍在 <script> 之前 ✓；服务读的正是新产物（app.js 393088 B）
```

两次「产物里找不到中文」都是**同一个坑**：esbuild 默认 `charset=ascii`，CJK 被写成 `\uXXXX`（**大写十六进制**）。判定前必须先转义或大小写无关比较 —— 已写进日志备注，免得下次再误判一次。

## 六、日志

[daily/2026-10-03.md](.memory/daily/2026-10-03.md) 追加「本日第五轮」，并把「日期分组 / 侧栏折叠」划掉；剩余还原度项收紧为：真实会话数据、工作区搜索排序的真实交互、输入框的 `/` `@` 补全、附件上传。

要不要我接着做**工作区搜索/排序的真实交互**（纯前端，能立刻看到效果），还是先按你之前那批决定推进（浏览器认证 / 路由级 gzip / 独立包 / 默认端口）？

- 涉及工具: `run_code`

---