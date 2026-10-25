# Oblivion-LAYOUT · 轮 10

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

将188 图标接进外壳

## 回答

Now let me wire the real icons in, replacing every placeholder glyph.

Prettier reformatted the array. Let me use line-based surgery instead.

A splice ate one opening tag. Let me see the whole composer region and rewrite it cleanly.

Right — exports carry the weight suffix. Let me use the `Regular` variants.

188 图标已接进外壳 —— **刷新 http://127.0.0.1:55899 就能看到**。

## 一、换了什么

外壳里**所有占位字符都换成了真字形**（原来那些 `⊖ ▤ ⌕ ⇅ ＋ ⚙ ◇ ▾ ↑` 是我上一轮临时用的）：

| 位置 | 之前 | 现在 |
|---|---|---|
| 新会话 / 新建工作区 | `⊖` `＋` | `IconPlusOutlineRegular` |
| 插件（侧栏导航） | `◇` | `IconCordisPluginOutlineRegular` |
| 工作区 · 搜索 | `⌕` | `IconSearchOutlineRegular` |
| 工作区 · 排序 | `⇅` | `IconChevronsUpDownOutlineRegular` |
| 会话列表 · Oblivion / 默认工作区 | `▤` | `IconWorkspaceTreeOutlineRegular` / `IconFolderOpenOutlineRegular` |
| 输入框 · 附件 | `＋` | `IconPaperclipOutlineRegular` |
| 输入框 · 模式 | `⚙` | `IconSlidersTwoOutlineRegular` |
| 输入框 · 三处下拉 | `▾` | `IconChevronDownOutlineRegular` |
| 发送按钮 | `↑` | `IconSendOutlineRegular` |

顺带修了 a11y：侧栏那三个小图标原来是**装饰性 `span`**（不可点、屏幕阅读器读不到），现在是 `<button aria-label="搜索会话 / 排序 / 新建工作区">`。

图标一律用 **Regular（1px 描边）** 档；`Medium`（1.3px）留给需要更重描边的场合 —— 两档共用同一份几何，换档只改一个 strokeWidth。

## 二、证据

```
产物里 viewBox="0 0 16 16"  →  88 处
产物里 d= 路径              →  192 条（≥20 字符的）
服务端返回 与 磁盘 .build/web/app.js  逐字节一致  ✓   ← 顺便验证了 mtime 缓存那条修复
门禁：657/657 绿 · lint 0 · typecheck 0
```

有个数字值得说明：**这个改动只让产物涨了约 3.5 KB**（1905603 → 1909155 B）。原因是我加外壳时 `import ... from '../index.js'` 已经顺带把整个图标模块拉进包了（`ICON_ARTWORKS` 是模块初始化时求值的大对象，tree-shaking 啃不动它）。也就是说 **188 个字形本来就在包里**，这次只是把它们用起来 —— 所以体积几乎没变。若将来在意体积，可把图标改成按需子路径导入或惰性注册。

踩到一个坑记进了日志：**导出名带档位后缀** —— 是 `IconChevronDownOutlineRegular`，不是 `IconChevronDownOutline`。我按「键名 + Regular」的直觉写，类型检查一次报了 10 条。

## 三、`web:watch` 仍然在跑，所以迭代是：

```
改 packages/oblivion-web-ui/src/**  →  保存（自动重建）→  浏览器刷新
```

后台任务：`pwsh-2`（watch，running）、`pwsh-3`（服务，running）。要看效果就别关它们。

## 四、离图二/图三还差的（不粉饰）

图标进去之后，观感差距主要剩下**布局与数据**，不是图标：

1. **真实会话数据** —— 会话列表、模型名、用户名仍是常量（等 Phase 2 的会话 + LLM）；
2. **日期分组** —— 上游会话列表按「置顶 / 今天 / 更早」分段，我这是一条平铺列表；
3. **侧栏折叠展开**、工作区的搜索/排序**真实交互**（现在只是按钮）；
4. **输入框的 `/` 指令与 `@` 文件补全**、附件真实上传；
5. 上游那种**正文的排版权重**（标题 15px/正文 14px 的行高与间距细节）我还没逐项对齐 —— 这一项要做的话，得按 `DESIGN.MD` 的排版表逐条核。

另外，[daily/2026-10-03.md](.memory/daily/2026-10-03.md) 已追加「本日第四轮」，并把「外壳接入 188 图标」划掉、把剩余还原度项列清楚。

下一步你想让我做哪个：**① 把 188 图标做成可视化图标页**（一屏看全，方便你核对提取是否忠实）、**② 按 DESIGN.MD 逐条对齐排版**、还是 **③ 做侧栏折叠 + 会话日期分组**（纯前端，不依赖后端，能立刻看到效果）？

- 涉及工具: `run_code`

---