# Oblivion-LAYOUT · 轮 4

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

生成web的版本，但是构建的放在C:\Projects\Oblivion\.build  该文件夹依旧放入.gitignore
"C:\Projects\Oblivion\.alpha" 该文件夹是不是不需要，不需要则删除
然后继续完成：锚点定位类浮层（Menu / HoverCard / ImageLightbox）、188 个 Icon* 字形、MarkdownText + 102 个 markdown 令牌的消费、设置表单族（SettingsForm + SettingsFormModel）、21 个工具函数里的 DOM 部分（剪贴板 / 输入法组合期抑制快捷键 / 粘性头观测）。

## 回答

Let me investigate `.alpha` and check whether the reference icon/glyph data is fetchable.

The exact evidence version is available. Let me look for the glyph data inside.

The bundle contains real glyph geometry. Let me set up the web build first (as asked), installing the bundler and markdown parser.

`.build/` was already ignored (line 109). Now the app shell, plus a real fix the React integration exposes: a cached store snapshot.

The web bundle builds. Now let me make it actually serveable — `oblivion web` gets a static server with `/healthz` and `/metrics`.

The server works (including traversal defense). Let me lock it down with an integration test and add a CI step.

Now the `.alpha` decision. Let me first make sure the structure guard it provided isn't lost.

`.alpha` provides no product dependency — only a structure contract, which is worth keeping in version control. Let me migrate that first, then delete it.

`npm test` hangs — the static server's `close()` waits on keep-alive sockets. Let me fix that properly.

The CLI test ran `web` with `keepAlive:false` but the server still started, leaving a handle open. Let me fix that.

Now the icon system — extracting the real 188 glyphs from the evidence package.

The cross-check caught a parser gap (90/94). Let me look at the 4 shapes that don't match.

The real shapes include fill-only and delegating artworks. Let me make the parser handle all of them.

One icon uses a `useId()` mask. Let me handle block bodies and dynamic values rather than silently dropping it.

The generator now produces 94 glyphs / 188 exports. Let me write the renderer and barrel.

The artwork keys keep the reference's `Icon` prefix (so exports are `key + 'Regular'`). Let me fix the test.

Two real bugs found: nested nodes were flattened, and 5 exports don't map by name. Let me investigate both.

Two more real bugs: nested nodes were flattened (75 of 94 icons!), and export names don't derive from keys. Let me fix the extractor.

The patch corrupted the file. Let me rewrite the generator cleanly with all fixes.

The data now nests correctly. Let me make the renderer recursive and fix the test.

The `$` in my RegExp acted as an anchor instead of a literal. Let me fix it.

Found it: the `#` was consumed by the placeholder match. Let me fix the placeholder convention.

All 11 icon tests pass — the real 94 glyphs / 188 exports are in. Let me run the full gates.

All gates green. Let me update the documentation.

Same lesson as the token table: the generated artifact must be excluded from prettier.

Let me do a final end-to-end check of the user-facing `oblivion web` path.

本轮三件事做完，门禁全绿；4c 的五项里我只完成了 **188 图标**，其余四项明确未做（见末尾）。

## 一、Web 形态：可构建、可服务

```powershell
npm run web:build     # → .build/web
npm run web:serve     # = oblivion web --web-dir .build/web
```

实机验证（`oblivion web --port 0`）：内核 10 激活 / 13 等待 / 0 失败，随后 `Web http://127.0.0.1:43190`：

```
GET /              200 text/html   ← <style> 在 <script> 之前 ✅  含 427 令牌 ✅  含 prefers-color-scheme ✅
GET /app.js        200 376763 B
GET /healthz       200 "ok"
GET /metrics       200 oblivion_web_ready 1 · oblivion_http_requests_total{…}
GET /../package.json  404          ← 原始与百分号编码两种穿越都挡住
```

| 产物 | 说明 |
|---|---|
| [build-web.mjs](scripts/build-web.mjs) | esbuild 打包；**令牌 CSS 在构建期内联进 `<head>` 且在 `<script>` 之前** —— 这是 §3.4 的无闪烁要求，放到运行时注入就必然先亮后暗 |
| [serve.ts](packages/oblivion-core/src/serve.ts) | 静态服务 + `/healthz` + `/metrics`。这补上了 TODO 里记的缺口「prometheus.yml 抓 3080/metrics，但该端点不存在」 |
| [App.tsx](packages/oblivion-web-ui/src/app/App.tsx) | 三栏帧 + 内容示例；栏宽由 `computeColumns()` 每帧求解，拖窄窗口就能看见让步顺序 |

**`.build` 的说明**：`/.build/` **本来就在 `.gitignore` 里**（第 109 行，临时与缓存段），我没有重复添加，只补了 `.prettierignore`（否则 prettier 会去格式化 1.5 MB 的 sourcemap）。

## 二、`.alpha`：已删除

结论是**不需要**。排查结果：产品侧（构建、运行、测试）对它零依赖；唯一实际用途是给 `structure-contract.test.mjs` 提供结构契约。所以我先迁移再删除：

- 新增**入库的** [structure.contract.json](structure.contract.json)。这是**加强**而不是妥协：原契约在本机目录缺失时**整段跳过**（新克隆环境下守卫自行消失），迁入后那条检查在任何环境都必然运行 —— 34 条断言。
- 删除 `.alpha/`（manifest + sources + templates + alpha-init 工具）；`.gitignore` 保留 `/.alpha/` 并注明退役原因（模板目录若再出现，仍不该入库）。
- 同步更新 [docs/目录结构说明.md](<docs/目录结构说明.md>)、[packages/README.md](packages/README.md)。

## 三、188 个图标字形（真几何，不是编的）

从证据包 `@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2` **机械提取**，并与 `icons/index.d.ts` 的导出清单**交叉核对**，对不上就拒绝产出：

```
94 字形 / 188 导出（Regular 92 + Medium 92 + 纯填充 4）/ 参考里 95 条声明
（多出的 ChatLinesOutline 是不直接导出的共享基座，被 QueueOutline 转发，产出时已内联）
```

提取过程踩到并修好 **6 个坑**，全部由对账或测试抓出 —— 这些才是这轮真正的收获，都写进了生成器头注释：

| # | 坑 | 后果 |
|---|---|---|
| 1 | 声明有**五种形态**（常规/纯填充/两种转发/块体） | 只认一种会**静默少 4 个字形** |
| 2 | 默认边长**不止 16**（还有 10/14/20） | 写死 16 会让一票图标偏大偏小 |
| 3 | 节点**必须递归** —— 94 个里 **75 个**含嵌套 `children`（mask/g） | 拍平让 mask 变空、子节点跑到根上，**不报错、只是画错** |
| 4 | 括号配对要**跳过模板字符串** | 其中的花括号会打乱计数 |
| 5 | 正则里单独的 `$` 是**行尾锚点** | 不转义则永远匹配不上 → 遮罩 id 丢失 |
| 6 | 占位符 `#{id}` 会把 `#` 一起吃掉 | `url(#id)` 变成 `url(id)`，遮罩失效 |

配套：`Icon.ts` 手写渲染器（两档共用几何、`useId()` 无条件调用、运行期解析 `{id}` / `{strokeWidth+N}`），`IconSearchOutlineRegular` / `…Medium` 两种导出，以及 `ICON_EXPORTS` —— **导出名与字形键不构成派生关系**（参考里有的叫 `IconXArtwork`、有的叫 `XArtwork`），用字符串拼会漏掉 5 个特例。

## 四、顺手修掉的两个真 bug

- **`createLayoutStore()` 快照每次新建对象** → `useSyncExternalStore` 判定「一直在变」→ 无限重渲染。React 一接入就暴露，已改为变更时才重建。
- **`server.close()` 被 keep-alive 长连接卡住** → `npm test` 卡死不返回（不是某条用例变红，是整个套件挂住）。已加 `closeIdleConnections()`，并让服务**只在 `keepAlive` 时启动**（否则测试进程因一个仍在监听的端口而不退出）。

## 五、门禁

```
typecheck 0 · lint 0 · npm test 645/645 绿（638 → 645）
tokens:check 0 · icons:check 0 · web:build 0
新增测试：web-build.test.mjs 6 条 · ui-icons.test.mjs 11 条
CI 增补 Build web bundle 步骤
```

顺带把一个反复出现的坑写进了 CHANGELOG：**生成产物必须同时进 `.prettierignore`**，否则 `prettier --write .` 会改写它，让 `tokens:check` / `icons:check` 立刻报「产物已过期」—— 令牌表上踩过一次，图标表上又踩了一次。

## 六、明确未完成（你列的五项里剩四项）

| 项 | 状态 |
|---|---|
| 188 个 `Icon*` 字形 | ✅ 已完成 |
| 锚点定位类浮层（`Menu` / `HoverCard` / `ImageLightbox`） | ❌ 未做（需要 `useAnchoredPosition` 一族 + 外部点击关闭 + 模态层查询） |
| `MarkdownText` + 102 个 markdown 令牌的消费 | ❌ 未做 |
| 设置表单族（`SettingsForm` + `SettingsFormModel`） | ❌ 未做 |
| 21 个工具函数里的 DOM 部分（剪贴板 / 输入法组合期抑制快捷键 / 粘性头观测） | ❌ 未做 |

两个需要你决定的点：

1. **`marked@18` 已装但尚未使用** —— 我为 `MarkdownText` 装的，那一项没做到。要么留到下一步，要么现在就移除以免留一个未使用的依赖。
2. `package-lock.json` 已有变动（React + esbuild + marked），改动**尚未提交**；本轮共 20 个修改 + 29 个新增路径。

下一步建议从**锚点定位 + DOM 工具**开始（21 个函数里有 4 个是浮层的前置），再做 `SettingsForm`，最后 `MarkdownText`（它要消费 102 个 markdown 令牌，是本轮之后最重的一块）。

- 涉及工具: `run_code`

---