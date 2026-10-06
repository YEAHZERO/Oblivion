# @oblivion/vimc

**把 DSH 当浏览器用**：焦点不在输入框里时，用 Vimium 式按键翻页、跳转与链接选择，减少鼠标往返；
键位与选项**按 [Vimium-C](https://github.com/gdh1995/vimium-c) 的语义实现**，并可直接导入它的选项导出 JSON。

- 设置页：**设置 → Oblivion 键盘导航**（`settings.section`，order 46，紧挨 `Oblivion 品牌`）
- 参考实现 Vimium-C 为 MIT，本插件**只做理念级吸收，未复制其任何代码**（登记见 [`CONTRIBUTING.md`](../CONTRIBUTING.md)）

---

## 一、默认键位

| 键 | 命令 | 行为 |
| --- | --- | --- |
| `w` / `s` | `scrollPageUp` / `scrollPageDown` | 上 / 下翻一页（容器可视高度 × 0.9） |
| `a` / `d` | `scrollLeft` / `scrollRight` | 左 / 右**像素步进**（`scrollStepSize`，默认 90px） |
| `W` / `S` | `scrollToTop` / `scrollToBottom` | 回到顶部 / 跳到底部 |
| `[` / `]` | `previousTurn` / `nextTurn` | **上一条 / 下一条提问**（读到回答中间时回到本轮提问；已在提问顶部则继续往上） |
| `/` | `openFind` | **页面内查找**：打开查找框，边打边找（`Enter` 下一个、`Shift+Enter` 上一个、`Esc` 关闭） |
| `.` / `,` | `findNext` / `findPrevious` | 下一个 / 上一个命中（关掉查找框后继续用，沿用上次查询） |
| `Ctrl+↑ ↓ ← →` | `scrollPxUp/Down/Left/Right` | 同上，像素步进 |
| `f` | `LinkHints.activate` | **链接提示**：可点击元素浮出字母，按字母触发 |
| `i` | `focusInput` | 聚焦 DSH 输入框（`[data-composer-input]`） |
| `Esc` | （隐式） | **退出输入框**，焦点回到页面 |

> `a` / `d` 是**像素步进**而不是「一屏」：这是 Vimium 的语义（`scrollLeft`/`scrollRight` = `scrollStepSize` 像素，
> 一屏是 `scrollPageUp/Down`），也是所有者配置里 `map a scrollLeft` 的原意。
> 想让横向一按走得更远，把像素步长调大即可：`oblivionVimc.set({ scrollStepSize: 600 })`。

**生效条件（核心约束）**：焦点**不在**输入框 / 终端里时才接管。
在输入框里打字，`w/s/a/d/i/f` 一定是普通字符，插件一个键都不吞。

---

## 二、链接提示（`f`）

按 `f` → 视口内每个可点击元素左上角浮出一个琥珀色字母标签 → 输入字母即触发该元素。

| 细节 | 行为 |
| --- | --- |
| 字母数 | 候选数 ≤ 字母表长度时**每个 1 个字母**；更多时**全部 2 个字母** |
| 字母表 | `linkHintCharacters`，默认取所有者导出里的 `dsavewrqcxz`（顺序即优先级，最舒服的字母先分配） |
| 分配顺序 | 按屏幕阅读顺序（行 → 左） |
| 输入 | 前缀仍有多个候选时保留浮层并高亮已输入部分；字母表之外的键 → 退出提示模式并把该键放行 |
| 取消 | `Esc` |
| 触发 | 依次派发 `pointerdown → mousedown → pointerup → mouseup → click`（React 的 `onMouseDown`/`onClick` 与 `<a href>` 默认跳转都能生效） |
| 滚动/缩放 | 浮层跟随元素位置重排（rAF 节流） |
| 候选识别 | `a[href]` / `button` / `input[type=button|submit|checkbox|radio|file]` / `select` / `summary` / `[role=button|link|menuitem|tab|option|switch]` / `[onclick]` / `[tabindex]`，过滤不可见、禁用、`aria-hidden`、`pointer-events:none`，并去掉「包含另一个候选」的外层元素 |

**候选优先级（所有者要求）**：候选按三档排序，提示串按这个顺序分配 —— **前面的候选拿更短的提示**：

| 档 | 是什么 | 排序依据 |
| --- | --- | --- |
| ① 内联引用 | 会话正文里的**引用/链接**：真链接（`a[href]` / `role=link` / `data-href`），或 `title`/`aria-label` 里写着**引用目标**（含 `/`、以 `@` 开头、或以已知文件扩展名结尾，如 `oblivion-vimc/README.md`） | 先按档，再按「行 → 左」几何顺序 |
| ② 正文其它 | 正文里的消息操作按钮（复制/引用/重新生成）、`summary`、`[tabindex]` 等 | 同上 |
| ③ 外部 | 正文之外（侧栏、工具栏、输入区）—— **排在最后** | 同上 |

自检里的 `hints.tiers` 给出三档数量、`hints.referenceSignals` 给出前几个引用的**判定信号**
（`link`/`path`/`at`/`ext`，只报信号名不报属性值）。
**实测**：某个时刻视口内 `references 1 / content 25 / outer 20`、信号是 `path` ——
也就是说 DSH 的 `@oblivion/brand` 这类内联引用（悬停会显示它指向的文件路径）确实被单独提到最前，
排在消息操作按钮之前。反例也有：`aria-label` 带版本号（`v4.1`）的按钮**不会**被误判成引用
（判据只认路径分隔符 / `@` / 已知扩展名，不用「点 + 短串」这种宽泛规则）。

**短提示优先且无歧义**：候选 ≤ 字母表长度时全部单字母；更多时前面的拿单字母，
其余用**被保留首字母**的两位串。以字母表 `dsavewrqcxz`（11 个）为例：

```
15 个候选 →  d s a v e w r q c x   +   zd zs za zv ze
              └── 前 10 个（正文优先）单字母 ──┘   └─ 首字母只用保留的 z ─┘
```

于是按 `d` **立即**触发那一个（没有任何提示串以它开头），按 `z` 会等第二个字母。
候选太多、两级放不下时退回统一长度。自检里的 `hints.tiers` 会给出三档数量，
`hints.sampleAttrs` 给出前几个候选的**属性名**（不含值）——用来核对当前 DSH 版本里
「正文链接」到底长什么样（实测：DSH 的内联引用是 `button[data-variant]`，不是 `<a href>`，
所以那种页面上①档为空、正文元素落在②档，仍然整体排在外部按钮之前）。

> 提示浮层是**临时节点**，触发/取消后立刻移除；插件不往页面注入任何常驻 DOM。

---

## 二·五、轮次跳转（`[` / `]`）

按 `[` 跳到**上一条提问**，按 `]` 跳到**下一条提问** —— 与 DSH 右侧那条轮次导航条（悬停会显示该轮提问/回答摘要）
落点一致，用的也是**同一批官方锚点**：`ui-chat` 在每个轮次行上写的 `data-chat-turn`。

| 你的位置 | 按 `[` 的结果 |
| --- | --- |
| 正在读某轮回答的中间 | 回到**本轮提问**的顶部（贴齐容器顶 + 2px） |
| 已经在某轮提问的顶部 | 继续往**上一条提问** |
| 已经在最上面那条 | 不动作、**不吞键**（让 `w`/`W` 继续负责往上滚） |

判定用的是「严格在当前视口顶之上（带 8px 容差）里最靠下的那一个」，所以「同一个提问」不会把按键吃掉第二次；
跳转后目标会短暂描边（700ms）便于确认落点，用完还原行内样式。

> **分页边界**：DSH 的会话是分页加载的，DOM 里只有已加载的轮次，因此跳转只能到达已加载的轮次。
> 到最上面那一条后再按不会凭空加载更早历史 —— 但滚到顶会触发 DSH 自己的分页，所以
> 「先跳到最上 → 等它加载完 → 再按一次」即可继续往上。

---

## 二·六、页面内查找（`/` · `.` · `,`）

对应 Vimium-C 的 `enterFindMode` / `performFind` / `performBackwardsFind`（所有者导出里就是这三条）。
查找条的样子对齐浏览器原生/Vimium 的紧凑样式：`/查询 (3 处)`。

| 键 | 行为 |
| --- | --- |
| `/` | 打开查找条（带上次查询），**边打边找**，右侧显示 `(N 处)` |
| `Enter` / `Shift+Enter` | 下一个 / 上一个命中，然后**提交**：输入框收起、**焦点回到页面**（查找条退化成只读 HUD） |
| `.` / `,` | 前后跳（提交后**直接可用**，因为查找框已经失焦；还没有查询时会把查找条打开） |
| `/`（HUD 形态） | 回到编辑态并**全选查询**，方便直接改 |
| `Esc` | 关闭查找条 —— 编辑态与 HUD 形态都行；**查询与命中保留**，之后 `.`/`,` 仍可用 |
| 回绕 | 到末尾再按下一个回到第一个（反向同理） |

「回车后失焦」是刻意的：如果输入框一直拿着焦点，`,` / `.` 会被它当成普通字符吃掉。

实现上刻意**不侵入 DOM**：

- 命中用 `Range` 表示，高亮走 **CSS Custom Highlight API**（`::highlight(vimc-find)`）——
  不包 `<mark>`、不改文本节点（DSH 输入框是 Lexical 宿主，外部改选区会引发状态不同步）。
  全部命中是浅琥珀、**当前命中是深琥珀**。
  ⚠️ `::highlight()` **只接受长写属性**：必须写 `background-color`，写 `background` 简写会被丢弃
  （症状就是「死活没有高亮」）。
- **落点标记（ping）**：每次跳转还会在当前命中四周画一圈会淡出的琥珀色框（900ms）。
  它走 `position: fixed` 覆盖层，**与高亮是否可用无关** —— 命中在折叠内容里、或浏览器不支持
  Custom Highlight 时，也能一眼看到跳到哪了。自检里的 `find.pings` 就是它的计数。
- **落点靠上留一点距离**：跳过去把命中放在容器高度的 **1/4**（所有者反馈：居中不好看，
  像自己那条提问的位置就行）；查找范围 = 会话正文滚动容器（不搜侧栏）。
- **落点标记跟着滚动重摆**：标记用的是视口坐标，所以 `present()` **先滚动、再画**，
  并在标记存活期间监听 `scroll`/`resize`（捕获 + rAF 节流）持续修正 —— 平滑滚动动画中一路跟随。
  （所有者实测过反例：搜「高亮」时黄框出现在「结果」旁边，就是「画完再滚」+ 不重摆导致的错位。
  上游 Vimium-C 的 `flash_()` 是把矩形换算成页面坐标，DSH 的正文是嵌套滚动容器、无法假定定位上下文，
  所以这里用「跟随重摆」替代；自检里的 `find.repositions` 就是重摆次数。）
- **折叠分组里的命中**：DSH 把工具调用收进 `<details>`，文字在 DOM 里但不可见。跳转时：
  先找**已渲染**的命中；都不渲染就**点开** `<summary>`（走官方开关，React 状态跟着变）把分组展开，
  再重新定位并跳过去 —— 与浏览器原生查找的行为一致。
- **编辑态下查找条就是 `<input>`**，所以插件其它快捷键在框内自动让位（可编辑区守卫）——
  在框里打 `w` 就是字母 `w`，不需要额外状态机。

> 排查这类「找不到落点」的问题时，先看自检里的两项：`find.highlight`（`custom` = 高亮可用 /
> `none` = 只靠 ping）与 `find.pings`（累计画过多少个标记）。

大小写按 Vimium 的**智能大小写**（查询里含大写才区分大小写）；`regexFindMode`（可由 Vimium-C 导出导入，
所有者那份为 `true`）打开时按正则解释，非法正则按无命中处理（不抛错）。自检里只报**计数/耗时/是否已提交**，不报查询内容。

---

## 三、设置页：设置 → Oblivion 键盘导航

面板按「改完立刻生效」设计（每个控件直接写配置并生效，没有「保存」按钮）；键位文本是例外，
它是多行草稿，用「应用键位」显式提交，避免编辑到一半把键盘搞坏。

| 区块 | 内容 |
| --- | --- |
| 顶部 | 启用开关 + 版本 + 一句话说明 |
| 键位 | 多行文本（Vimium-C `map`/`run` 语法）、应用 / 恢复内置默认 / 撤销改动 / 清空覆盖；下方实时显示**生效键位**、语法问题、以及**未接管的 Vimium 命令清单（逐条给理由）** |
| 滚动 | 平滑滚动、竖向/横向翻页比例（默认 **0.6**）、`scrollStepSize`（px，默认 90） |
| 输入框 | `Esc 退出输入框`、`输入框里也允许翻页`、聚焦后选区模式（`all-line`/`all`/`none`）、优先选择器 |
| 页面内查找 | `regexFindMode` 开关 + 「打开查找框」按钮（就地试） |
| 链接提示 | 字母表、**立即显示提示**（就地试） |
| 兼容 | 选 `vimium_c-*.json` 文件或粘贴 JSON → 导入并显示**已采纳 / 未采纳**报告 |
| 排除与诊断 | 排除规则、诊断上报开关、**运行只读自检**（报告滚动容器/输入框/可点击元素/键位统计） |

控制台等价入口（`window.oblivionVimc`）：

```js
oblivionVimc.status()          // 版本 / 开关 / 生效键位 / 未支持命令 / 已处理次数
oblivionVimc.probe()           // 只读自检（不滚动、不聚焦、不注入节点）
oblivionVimc.hints()           // 手动进入链接提示模式（等价按 f）
oblivionVimc.bindings()        // 生效键位表 + 解析诊断
oblivionVimc.importVimium(json)// 直接吃 Vimium-C 选项导出对象
oblivionVimc.set({ smooth: false })          // 瞬时滚动，长按连发更跟手
oblivionVimc.set({ scrollStepSize: 600 })    // 横向一按走更远
oblivionVimc.run('scrollToBottom')
```

配置存在浏览器 `localStorage`，键 `oblivion-vimc:settings:v1`；坏数据只会退化成默认值。

---

## 四、Vimium-C 兼容

### 4.1 选项映射（实测 `vimium_c-20251214_001720.json`）

| Vimium-C 选项 | 本插件 | 说明 |
| --- | --- | --- |
| `keyMappings` | `keyMappings` | 字符串数组按续行（行尾 `\`）合并成文本；`#` 为注释；**`unmapAll` 会清空内置默认** |
| `linkHintCharacters` | `linkHintCharacters` | 导入值 `dsavewrqcxz` |
| `scrollStepSize` | `scrollStepSize` | 导入值 `90` |
| `keyLayout` | `ignoreKeyboardLayout` | `0` = 按产出字符匹配（「始终忽略键盘布局」停用）；非 0 = 按物理位置 |
| `smoothScroll` | `smooth` | 该导出里没有；存在时才采纳 |
| `exclusionRules[].pattern` | `exclusions` | 命中即整体停用（模式语言子集，见 4.3） |
| `regexFindMode` | `regexFindMode` | `true` = 页面内查找按正则解释（所有者那份为 `true`） |
| `keyMappings → focusInput o.select / o.prefer` | `select` / `prefer` | `o.prefer` 的选择器**追加**在本插件默认 `[data-composer-input]` 之后 |
| 其余（`searchEngines`/`clipSub`/`grabBackFocus`/`vimSync`/`nextPatterns`/…） | — | 导入报告里逐条给出「为什么不适用」 |

### 4.2 键位：能对应的对应上，其余逐条列出

已实现（Vimium-C 命令名 → 本插件命令）：

```
scrollPageUp / scrollPageDown      → scrollPageUp / scrollPageDown
scrollUp / scrollDown / scrollLeft / scrollRight
scrollPxUp / scrollPxDown / scrollPxLeft / scrollPxRight   → 像素步进（step*）
scrollToTop / scrollToBottom       → scrollToTop / scrollToBottom
focusInput                         → focusInput（含 o.select / o.prefer 解析）
LinkHints.activate (+ Hover)       → linkHints
enterFindMode / performFind / performBackwardsFind / performAnotherFind → openFind / findNext / findPrevious
goBack / goForward                 → history.go(±1)
```

语法细节：`<a-t>` 这类修饰键写法、`<backspace>`/`<left>`/`<f1>` 等命名键、`>`/`?` 这类标点键、
`run <键> <另一个键>` 的**单层别名**（`run q i` → `i` 的命令）都能解析。

**明确不接管**（导入报告与设置页会逐条给出理由）：标签页类（`createTab`/`removeTab`/`duplicateTab`…）、
Vomnibar/书签/搜索引擎、页面内查找（`/`、`n`、`N`）、可视模式、Marks、剪贴板类（`copyCurrentUrl`…）、
下载、图片/新窗口类链接动作（`lh` 子动作）、按键宏（`key=`）、多键序列（`Xx`/`Gg`/`Fq`）、
`reload`（重载会重建整个会话界面）、`goUp`/`goToRoot`（会改写应用页面 URL，可能弄坏当前界面）。

### 4.3 排除规则（`exclusionRules`）

只实现其模式语言的子集，命中即**整体停用**本插件：

| 写法 | 语义 |
| --- | --- |
| `:https://example.com/app` | 字面**前缀**匹配（导出里常见这种写法） |
| `/regex/flags` | 正则 |
| `*://*.example.com/*` | `*` 通配（整体匹配） |
| 其它 | 全等匹配 |

---

## 五、为什么不用 `ctx.shortcuts`

DSH 有官方客户端快捷键服务（`ctx.shortcuts.register`）。本插件**没有**用它，理由是实测机制而非偏好：

- `ShortcutCommand.regions` 只有 `'page' | 'editable' | 'terminal'`，看似正合「焦点不在输入框里」；
- 但 `ShortcutRegistry.dispatch()` 里 `priority = runtime === 'desktop' && (platform === 'windows' || 'macos')`，
  **priority 为真时跳过 region 与 modal 判定**；
- 且桌面端 Windows/macOS 的**原生键盘桥先于本地处理拦截已接受的组合键**
  （`shortcuts/README.md`：「All effective bindings … take priority over native actions, editors, terminals…」）。

结论：把**裸字母**注册进 `ctx.shortcuts` 会让用户在输入框里**打不出这些字母**。所以本插件退到
「页面级 keydown + 自判焦点区域」（与 Vimium 同类做法），代价是不出现在 DSH 快捷键设置页里 ——
功能面改由**自己的设置页**承载。

---

## 六、滚谁：容器发现顺序

DSH 是 100vh 应用外壳，`html`/`body` 基本不滚，可滚的是内部若干 `overflow: auto` 面板：

| 顺位 | 规则 | 说明 |
| --- | --- | --- |
| ① | 视口**正中点**命中元素，沿祖先链（跨 shadow DOM）找该轴最近的可滚祖先 | 几何稳定；**弹窗打开时自然滚弹窗** |
| ② | DSH 正文滚动区 `[data-conversation-scroll]` | `ui-conversation` 的官方数据属性，取可见且面积最大者 |
| ③ | 上一次滚过的容器（仍可滚） | 长按连发手感连续 |
| ④ | 根滚动元素 | 整页滚动型页面兜底 |

横向轴同逻辑，因此光标中心压在宽代码块上时会先滚**那个块自己**的横向条
（`CodeBlock`/`CodeCard`/`DiffBlock`/`TerminalBlock` 都是 `overflow-x: auto`）；
中心没有横向可滚元素时 `a`/`d` 什么都不做（不硬滚页面）。**没找到可滚容器时也不会吞键。**

---

## 六·五、对 DSH 的影响（性能）

结论先说：**稳态开销可以忽略，唯一的「重活」是按 `f` 时的一次候选扫描（十毫秒级）**，
而且这个数字由插件自己在真实页面里量并上报（见下）。

### 6.5.1 什么时候会花时间

| 时机 | 做什么 | 实测 |
| --- | --- | --- |
| 任意按键（含在输入框里打字） | 一个 window 捕获阶段监听器：**先做纯计算**（比对 ≤14 条键位），没命中就立刻返回 | 打字路径**不碰 DOM**；命中命令时才多一次焦点判定（重排前的样本：平均 1.8ms / 峰值 3ms） |
| 按 `f` / 点「运行只读自检」 | 一次候选扫描：`querySelectorAll` → 逐元素可见性 → 视口过滤 | **7.5–19ms**（视页面规模；某次 605 个选择器命中 → 46 个候选 → 7.5ms）；优化前同一页 **111.8ms** |
| 挂载后 1.5s | 一次「渲染后自检」（含上面的扫描） | 同上一行，且发生在**绘制之后**的定时器里，不阻塞首屏 |
| 每次处理命令 | 一条 fire-and-forget `POST /oblivion-vimc/beat`（400ms 合并窗口） | 本地回环，失败只丢心跳，绝不影响按键 |
| 宿主侧落盘 | 心跳写 `%TEMP%\oblivion-vimc\client-beat.json` | 新版合并到 **750ms 一次**（当前运行的宿主半边是旧版，仍是每条写一次；重启后生效） |

**没有**的东西：轮询、`setInterval`、`MutationObserver`、常驻注入的 DOM、后台网络请求。
提示浮层只在提示模式里存在，用完立即移除；设置面板只在打开设置时才渲染。

### 6.5.2 那次扫描为什么快了一个数量级

第一版在真机上量到 **111.8ms**，逐项拆开只有两个原因，都已修掉：

| 优化 | 原因 |
| --- | --- |
| 用 `checkVisibility()` 快路径替代 `getComputedStyle` | DSH 的样式表极大，**每个元素**读计算样式在真机上是毫秒级的；`checkVisibility()` 是引擎内部一次判定，不构造 `CSSStyleDeclaration` |
| 一次 `closest()` 走替代两次 | 排除浮层与 `aria-hidden` 子树原本要走两遍祖先链 |
| 每个元素只读一次矩形，样式只给「已进视口」的幸存者 | 筛序改成「便宜的在前」：属性 → 可见性 → 视口 → （无样式） |
| 挂载自检跳过扫描 | 挂载那一刻外壳还没渲染完，扫描既没用又白花时间；扫描交给 1.5s 后的自检 |

顺带因此暴露了一个可观测漏斗：`matched`（选择器原始命中）→ `candidates`（视口内候选）。

### 6.5.3 怎么自己复核这些数字

```js
oblivionVimc.probe().perf        // { keySamples, keyAvgMs, keyMaxMs }
oblivionVimc.probe().hints       // { matched, candidates, scanMs, sessions }
```

或：**设置 → Oblivion 键盘导航 → 排除规则与诊断 → 运行只读自检**（面板会直接列出表格）；
或读 `%TEMP%\oblivion-vimc\client-beat.json` —— 每条命令心跳都带 `perf`，自检心跳带 `probe`。

### 6.5.4 一句话

| 维度 | 结论 |
| --- | --- |
| 打字/滚动延迟 | 与未装插件相比只多一个监听器 + 十几次比较（命中命令时多一次焦点判定） |
| 内存 | O(1)：配置 + ≤17 条键位；扫描数组是临时的 |
| 网络/磁盘 | 只有本机回环心跳；宿主按合并窗口落盘 |
| 最坏情况 | 按 `f` 的扫描 ~10ms 级（页面越大越慢，但只在你要用时才付） |

---

## 七、验证

本机（Windows）DSHX 的 MCP 工具面全部不可用（都先跑 `dshx creator claim`，claim 依赖 POSIX
`ps -o lstart=`），`http://127.0.0.1:19387/` 又需要认证 —— 所以本插件自带一条最小证据链：
浏览器半边 `POST /oblivion-vimc/beat` → 宿主半边写 `%TEMP%\oblivion-vimc\{host-mount,host-unmount,client-beat}.json`。
只写版本、命令名、计数器、UA、配置快照与**只读自检**；不含 URL、会话内容或凭据。
（证据目录可用 `OBLIVION_VIMC_EVIDENCE_DIR` 覆盖 —— 单元测试必须覆盖，否则会覆盖真实 Host 的运行证据。）

### 实测结果（2026-10-05，桌面端 DSH 0.2.0-rc.2）

| 项 | 结果 |
| --- | --- |
| `dshx check`（CLI） | **全绿**：manifest / `export apply` / 无默认导出 / boot-marker / overlay 可移植 / `dsh.client.platform=web` / `client-inject` / 客户端 inject 声明 / 构建产物 |
| `pnpm run build` · `pnpm run typecheck` · `pnpm run check:version` | ✅ / ✅ / 一致（`0.2.8`） |
| `pnpm test` | **42/42**：翻页与像素步进、输入框守卫三路径、修饰键/IME 放行、大小写锁定、`ignoreKeyboardLayout`、`Esc` 退出、链接提示（单字母/短提示优先/前缀无歧义/两段触发/**三档优先级**/**引用判据正反例**）、轮次跳转、页面内查找（紧凑计数、回车失焦的 HUD、`/` 重新编辑、`.`/`,` 直接跳、回绕、正则、落点标记、**滚动跟随重摆**、折叠区先展开）、翻页比例默认与迁移、性能自检字段、排除规则、键位文本覆盖与 `unmapAll`、真实 Vimium-C 导出导入、设置页注册与静态渲染 |
| 客户端半边在真实页面运行 | `client-beat.json`：`clientVersion 0.2.8`、UA `@deepseek-ai/dsh-desktop/0.2.0-rc.2 … Electron/44.0.0` |
| 真实页面自检 | `keys.active 17 / unsupported 0 / errors 0`、`config.pageRatioVertical 0.6`、`hints.tiers { references: 1, content: 25, outer: 20 }`（信号 `path`）、`matched 1340 → candidates 46`、`find.highlight = custom` |
| 设置页挂载 | `Slots` 只读查询：`settings.section` 占用者含 `{ registrant: "@oblivion/vimc-client", id: "oblivion-vimc", order: 46, active: true }` |
| 挂载方式 | profile `link:` 依赖 + `cordis.patch.yml` 插入行，**无需重启应用** |

---

## 八、安装 / 停用 / 卸载

```powershell
$dsh = 'C:\Programs\AITech\DeepSeekHarness\resources\runtime\cli\bin\dsh.cmd'

# ① 装链接（正斜杠！反斜杠会被桌面包管理器的目标校验正则拒掉）
& $dsh plugin --profile desktop add 'link:C:/Projects/Oblivion/oblivion-vimc'

# ② 在 %USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml 末尾追加（@ 开头必须加引号）
# - insert:
#     - id: '@oblivion/vimc'
#       name: '@oblivion/vimc'
```

| 目的 | 做法 |
| --- | --- |
| 临时停用（保留安装） | 同一 patch 文件里给本 id 加墓碑：`- id: '@oblivion/vimc'` + `disabled: true` |
| 临时关掉按键（不动补丁） | `oblivionVimc.disable()` 或设置页顶部的「启用」开关 |
| 彻底卸载 | 删掉那段 `insert` 行，再 `& $dsh plugin --profile desktop remove @oblivion/vimc` |

> **交付层：热挂，不是 bundle 层（2026-10-06 所有者裁定）**。本包**刻意不声明** `dsh.bundle`
> —— 声明它会被安装器写进 profile 的 `dsh.profile.bundles`，走 bundle 层（组合在启动时算好，改一次要重启 App）。
> 代价是上面第 ② 步那行是**机器本地文件、不入库**，换机器 / 重置 profile 要补一次；
> 现在由 `pnpm run verify:dsh` 的 **`patchInsert` 断言**把关（profile 用户层缺这行即 FAIL），不会再静默失效。

---

## 九、已知边界

1. **不出现在 DSH 快捷键设置页里**（原因见第五节）；本插件有自己的设置页。
2. **`a`/`d` 是像素步进**（Vimium 语义）。要「一屏」请调大 `scrollStepSize`。
3. **链接提示候选可能很多**：DSH 会话页上 `<summary>`/`<button>`/`[tabindex]` 都是可点击元素，
   实测选择器命中 **1200+** 个、视口内候选几十个 → 自动进入 2 字母模式。提示只覆盖**视口内**元素，
   滚动后再按 `f` 看下一屏。
4. **轮次跳转只覆盖已加载的轮次**（DSH 分页加载）：到最上面那一条后再按不会加载更早历史，
   但滚到顶会触发 DSH 自己的分页，等它加载完再按即可继续往上。
5. **继承来的 `pointer-events: none` 不再检查**（快路径只查行内值）：换来的是扫描快一个数量级；
   那种容器里本来也不会有可点击目标。
6. **序列键未实现**：`Xx`/`Gg`/`Fq` 这类多键映射会被列为未接管（逐条给理由），不会被静默忽略。
7. **排除规则只实现模式语言子集**（第四节 4.3）。
8. **横向轴常常为空**：只有中心压着宽代码块/表格/diff/终端时 `a`/`d` 才有目标。
9. **页面内查找的范围是「会话正文」**（滚动容器内），不搜侧栏/设置面板；且**只搜当前已加载的 DOM**
   （分页加载的历史需要先滚上去让它加载）。命中落在折叠的工具调用组里时，跳转会**自动把该组展开**；
   `find.highlight` 报 `none` 的环境下没有文字底色，但**落点标记（ping）始终可见**。
10. **翻页比例默认 0.6**（所有者指定：输入框占掉一部分可视高度，比例小一点翻页更稳）：
    `w`/`s` 一次走 0.6 × 容器高度；历史默认（0.9 / 0.7，判据是存储里有没有 `regexFindMode` 字段）
    会被自动迁移到 0.6，用户自己改过的值不动。
11. **改宿主半边（`src/index.ts`）需要重启 DSH App**：Host 复用 ESM 缓存里的同一模块命名空间，
    禁用再启用**不会**重新导入。浏览器半边（`src/client/`）不受此限：改完 `pnpm run build`，
    再改动一次 profile 补丁触发图重算，页面会自动重挂新 bundle。
12. **不往页面注入常驻 DOM**；唯一外部副作用是宿主的诊断路由（限长 8 KiB + 来源校验）。
13. **不实现 Vimium-C 的浏览器能力**（标签页/Vomnibar/书签/下载/剪贴板/标记/可视模式）——
     DSH 是应用外壳，这些要么不存在，要么会弄坏当前界面（`goUp`/`reload`）。

---

## 八·五、版本规则（本仓库 2026-10-05 起）

| 规则 | 内容 |
| --- | --- |
| 起点 | 新版本线一律从 **`0.0.1`** 起步 |
| 已有版本 | **不回改**（`@oblivion/vimc` 从 `0.1.0` 起一路加第三位：`0.2.0 → … → 0.2.8`） |
| 每次递增 | **先加第三位**（patch）：`pnpm run version:bump` |
| 第二位/第一位 | **只在明确要求时**：`pnpm run version:bump -- --minor` / `--major`（位置参数写 `minor` 会被拒绝） |

规则同时记在 [`.action/AGENTS.MD`](../.action/AGENTS.MD) 与 [`CHANGELOG.md`](../CHANGELOG.md)。

---

## 十、目录与命令

```
oblivion-vimc/
├── dshx.yml                 # DSHX 清单（id 必须等于包名；marker 与源码逐字一致）
├── cordis.yml               # DSHX 可移植 overlay（冷启动/隔离验证用，非线上挂载点）
├── package.json             # dsh.client.platform=web + inject；无 dsh.bundle（走 patch 插入行）
├── VERSION                  # 插件版本单一真源（0.2.8）
├── scripts/build.mjs        # esbuild 双产物（React 标 external：由宿主模块表提供）
├── scripts/bump-version.mjs # VERSION → package.json 同步 + --check
├── src/index.ts             # 宿主半边：启动标记 + 卸载自证 + 诊断路由
├── src/client/
│   ├── index.ts             #   Cordis 客户端入口（引擎 + 控制面 + 设置页渐进注册 + __test 缝隙）
│   ├── engine.ts            #   判定顺序、命令执行、只读自检
│   ├── keys.ts              #   命令集、内置默认键位文本、合并与匹配
│   ├── vimium.ts            #   Vimium-C 兼容层（map/run 解析 + 选项导入 + 排除规则）
│   ├── hints.ts             #   链接提示（候选扫描 / 提示串 / 浮层 / 合成点击）
│   ├── transcript.ts        #   轮次跳转（[data-chat-turn] 锚点 + 目标描边）
│   ├── find.ts              #   页面内查找（Range + CSS Custom Highlight，不改 DOM）
│   ├── scroller.ts          #   滚动容器发现、翻页/像素/到边
│   ├── focus.ts             #   可编辑区判定 + 聚焦输入框
│   ├── settings.tsx         #   DSH 设置页（React，内联样式 + 主题令牌）
│   ├── beat.ts · api.ts · config.ts · types.ts
└── tests/                   # client / vimium / host 三组，node --test + happy-dom
```

```powershell
# 依赖在仓库根安装一次（pnpm workspace；插件目录里只留符号链接，约 0.02 MB）
cd C:\Projects\Oblivion
pnpm install

# 本插件的构建 / 检查 / 测试
pnpm -C oblivion-vimc run build        # lib/index.js + lib/client.js
pnpm -C oblivion-vimc run typecheck    # tsc --noEmit
pnpm -C oblivion-vimc run test         # 42 条行为与兼容测试
pnpm -C oblivion-vimc run version:bump # 只加第三位（第二位/第一位要 -- --minor / --major）
```

---

## 十一、参考与许可

### 11.1 上游参考：Vimium-C（**Apache-2.0**，非 MIT）

参考实现：[gdh1995/vimium-c](https://github.com/gdh1995/vimium-c) ——
许可证是 **Apache License 2.0**（`LICENSE.txt`：`Copyright 2023-present Gong Dahan`；本机源码副本位于
`C:\Projects\SourceCode\vimium-c-master`）。**本插件未复制任何上游代码**，是独立的 TypeScript 实现；
下表登记「读了哪个文件、复用了什么理念、哪里故意不一样」，以便后续维护者追溯。

| 上游文件 | 复用的理念 | 本插件的做法 / 为什么不一样 |
| --- | --- | --- |
| `content/hint_filters.ts`（提示串分配） | 提示串**短在前**（按候选顺序递增，早的候选拿短串） | 同样是短在前，但**保留首字母**做两位串（单字母立即触发）；上游用「完整匹配 + 前缀并存 → 等 255ms 定时器」消歧，我们不想让单击有等待 |
| `content/dom_ui.ts` `flash_()` | 落点用**矩形覆盖层**标记、同时只留一个活动标记、有寿命并淡出 | 同样单标记 + 寿命 + 淡出；但落点标记**跟着滚动重摆**（上游能把矩形换算成页面坐标 → `.AbsF`，而 DSH 正文是嵌套滚动容器，不能假定宿主定位上下文） |
| `content/mode_find.ts`（查找模式） | 大小写、`postOnEsc`（Esc 后查询仍可用）、反向查找、把命中矩形闪一下（寿命 ~2.4s） | 查找**不用 `window.find`**：它会接管原生选区，而 DSH 输入框是 Lexical 宿主，外部动选区会让编辑器状态与 DOM 不同步。我们改用 `Range` + CSS Custom Highlight（不改 DOM）+ 自己滚动 |
| `content/link_hints.ts` / `hint_filters.ts`（候选筛选） | 可点击元素口径、可见性过滤、视口内提示 | 口径接近；额外加了**三档优先级**（内联引用 → 正文其它 → 外部），见第二节 |

> 许可证差异：上游是 Apache-2.0，本插件自身是 MIT。**若将来直接拷贝上游代码（而不只是复用理念），
> 必须在该文件头保留 Apache-2.0 声明与版权行**，并更新本节。

### 11.2 依赖与许可

- 运行时依赖：**无**（浏览器半边只用 `window`/`document`/`fetch`/`localStorage`，React 由宿主模块表提供）。
- 开发依赖：`esbuild` / `typescript` / `happy-dom` / `react` / `react-dom` / `@types/*`（均已登记）。
- 本插件自身：MIT。
