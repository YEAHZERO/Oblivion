#  · 轮 12

- 来源会话: `session-db504efc-b898-403a-becb-e934c3faa6d2`

## 问题

将C:\Library\那些渐渐被遗忘\oblivion这个里面的东西全部拿到C:\Projects\Oblivion，在后面这个基础上修改完善。然后再给出冲突的地方

## 回答

I'll first survey both trees completely so the merge plan is based on real file lists, not assumptions.

```dsh-tool

I'll survey both trees carefully before moving anything.

两边的结构完全对不上，我先说清冲突再动手。

## 结构冲突

| | `C:\Library\那些渐渐被遗忘\oblivion`（我写的） | `C:\Projects\Oblivion`（你的） |
|---|---|---|
| 布局 | `packages/oblivion-*/`（嵌套一层） | `oblivion-*/`（平铺） |
| workspace 声明 | npm `workspaces: ["packages/*"]` | pnpm `packages: ['oblivion-*']` |
| 语言 | 纯 JS `.mjs`/`.js` | TypeScript `src/` → esbuild 打成 `lib/index.js` |
| 包管理 | npm | pnpm@11.7.0 + `allowBuilds` |
| 版本 | core 0.1.0 | core **0.1.20** |
| 依赖声明 | 无 | `dsh.compat` 契约 + peerDependencies |
| 构建 | 无 | `scripts/build.mjs`、`selfcheck.mjs`、`bump-version.mjs` |
| 测试 | `scripts/smoke.mjs`（49 断言，手写） | `node --test`（`test/core.test.mjs`） |

**同名包、完全不同代。** 直接把我的 `packages/oblivion-core/lib/*.js` 拷进 `C:\Projects\Oblivion\oblivion-core\` 会覆盖你的 0.1.20 源码——那是灾难。

## 唯一有真实价值的东西：`oblivion-http-bridge`

我那套里，**只有 `@oblivion/http-bridge` 是你的项目没有的**。其余（core 的 12 个模块）都是你 0.1.20 已有功能的弱化重复。

所以「全部拿到 `C:\Projects\Oblivion`」的正确做法不是搬文件，而是：

1. **`oblivion-http-bridge`** → 作为**第 6 个平铺包**放进 `C:\Projects\Oblivion\oblivion-http-bridge\`，改造成你的工程规范（TS + `src/` + `dshx.yml` + `cordis.patch.yml` + `dsh.compat`）
2. **`packages/oblivion-core/lib/tools.js` 里的 DSH schema 踩坑结论** → 你已经 0.1.20 了，大概率早就跨过这些坑，**只需要核对**，不需要移植
3. **`scripts/smoke.mjs` 的 49 条断言** → 有参考价值，但你的 `test/core.test.mjs` 是正规测试框架，应该是**补齐它的覆盖**，而不是并存

但在我动手之前，有几件事必须你先定，因为它们会**改变移植的形态**：

## 需要你决定的四个冲突点

**① `dsh.compat` 契约**

你的 `oblivion-core` 声明：

```json
"requires": { "services": ["tools","systemPrompt"], "events": ["agent/created","session/event","turn/end"] }
```

而我的 http-bridge 声明的是 `inject: ['webServer','credentials']`。**`webServer` 是 web-app bundle 提供的，desktop profile 有没有它？** 如果没有，桥接层在 desktop 根本起不来——这正是「DeepSeek++ 够不到 0.1.20」的可能原因。需要先确认 desktop profile 的 `webServer` 是否可用。

**② 数据目录与 `mdRoot`**

你的 `status.json` 明确写着：

```
dataRoot: C:\Users\liveu\.oblivion\data
mdRoot:   C:/Library/那些渐渐被遗忘
mdClassify: { session→01_问答沉淀, doc→00_导入文件, wiki→02_Wiki页面, ... }
```

我的包默认 `mdRoot: ~/OblivionKB`、`dataRoot: ~/.oblivion/data`——**dataRoot 撞了，mdRoot 不同**。我误建的 `~/OblivionKB/` 要删。桥接层接入后，走的是你的 `mdRoot`。

**③ 你的 core 有没有对外门面**

桥接层调 `ctx.get('oblivion')` 拿 core 的门面。你的 0.1.20 是否 provide 了名为 `oblivion` 的服务？还是只 inject 别人、不 provide 自己？这决定桥接层要怎么拿到 `knowledge.search()` / `knowledge.capture()`。需要读 `src/index.ts`。

**④ `.memory` 的写入位置**

你要求写到 `C:\Projects\Oblivion\.memory`，且不同步 GitHub。现有结构：

```
.memory/
├── README.md          ← 入库（流程规范）
├── TODO.md            ← 不入库
├── daily/             ← 不入库（2026-10-04/05/06 已有）
├── design/ specs/ review/ release/
```

`.gitignore` 已经把 `daily/*.md`、`TODO.md`、`design/*.md` 等排除，**但保留 TEMPLATE**。所以我要写的是：`.memory/daily/2026-10-06.md` 追加一节，或新建 `.memory/design/插件协作全景.md`。**你说哪个？**

---

## 我建议的执行顺序

```
1. 读 src/index.ts + dshx.yml + oblivion-panel/cordis.patch.yml   ← 看清 0.1.20 的门面与装载
2. 确认 desktop profile 的 webServer 可用性                        ← 决定桥接形态
3. 把 http-bridge 改造成你的工程规范，落到 oblivion-http-bridge/
4. 清理我的残留（web profile insert、~/OblivionKB、@oblivion/ 副本）
5. 在 desktop patch 加桥接 insert，验证 DeepSeek++ 打通 0.1.20
6. 写 .memory 文档（插件功能与配合全景）
```

**先做第 1、2 步**——这两步只读，不改任何东西，但它们的结论直接决定第 3 步写成什么样。

要我现在读 `oblivion-core/src/index.ts`、`dshx.yml`、`oblivion-panel/cordis.patch.yml`，并检查 desktop profile 的 webServer 可用性吗？

- 涉及工具: `pwsh`

---