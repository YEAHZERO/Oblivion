#  · 轮 11

- 来源会话: `session-db504efc-b898-403a-becb-e934c3faa6d2`

## 问题

C:\Users\liveu\.oblivion\ 和 C:\Users\liveu\OblivionKB\ 是这次会话之前就存在的吗
那么这个怎么使用：ts-*.json（12 个，每个 2-19 KB）、graph.json（550 KB）、events-probe.jsonl（52 KB），可以按照这个进行吗？之前的oblivion看看是不是单独做的软件，还是插件？

## 回答

I'll investigate before answering.

Let me look at your actual Oblivion project to answer whether it's a standalone app or a plugin, and what those data files are.

```dsh-tool

```

I'll inspect those data files with a properly formatted command.

现在我可以明确回答你的三个问题了。

## 1. 是这次会话之前就存在的吗？

**是。** 而且有确凿证据：

`status.json` 里写着 `"version": "0.1.20"`，`dataRoot: C:\Users\liveu\.oblivion\data`，`mdRoot: C:/Library/那些渐渐被遗忘`。

**0.1.20 是 `C:\Projects\Oblivion\oblivion-core` 的版本号**——我那份手写的只有 0.1.0。而且 `mdRoot` 指向 `C:/Library/那些渐渐被遗忘`，正是你让我分析的第一个路径的父目录，也正是我这次会话的**工作目录**。这说明**你早就把这个工作区当作 Oblivion 的笔记落盘根**。

`decisions.jsonl` 最早时间戳 `1791262118023`，换算过来是**今天 14:48:38**。而我这个会话第一次 pwsh 调用是在 16:33 之后。所以这些文件**至少比我的操作早了两个小时**。

## 2. 那些文件怎么用？

它们不是"待使用的数据"，而是**运行痕迹**，每一类都有明确用途：

**`ts-*.json`（12 个）— 会话快照**

最新那个 `ts-muwfv0aq-0x.json` 的 `content` 字段里，**装着我上一轮回复的完整英文原文**，`sources` 指向 `session-70941d46-.../turn-10`，`topic` 是"然后将我安装的所有插件的功能和相互配合写"。

这是 **`@oblivion/core@0.1.20` 的 `qa-loop` 实时抓取的问答记录**——它在监听 DSH 的 `session/event`，每轮把「用户问什么 + 助手答什么」写成一条。你正在用的 desktop profile 里，0.1.20 一直在工作，**它刚刚还在抓我说话**。

**`decisions.jsonl` — 价值闸门判定日志**

```
{"session":"04de61b4-6ce","turn":1,"action":"created","pass":true,"reason":"captured","score":0.8,"questionChars":2096,"answerChars":11509}
```

每次问答是否入库、评分多少、多少字符、耗多少毫秒。4 条全是 `captured`，`captureRate: 1`。

**`graph.json`（580 KB）— 知识图谱边表**

```json
{"source_id":"oblivion","target_id":"插件组","weight":0.3,"last_reinforced_at":1791252128922,"reinforce_count":0}
```

`weight` / `last_reinforced_at` / `reinforce_count` 三件套 = **带时间衰减的加权边**，`graphDecayBase: 0.95` / `graphDecayPeriodDays: 30` 就是它的参数。

**`events-probe.jsonl`（52 KB）— 事件探针**

```json
{"at":1791276355349,"origin":"agent","type":"tool/result","seq":1201,"subjectKeys":["log","surfaceManager","header",...]}
```

**只记 DSH 事件的字段结构，不记内容**（`subjectKeys` / `dataKeys` 是 key 名数组）。用途是排查「DSH 到底发了哪些事件、字段长什么样」——`enableEventProbe: true` / `eventProbeMax: 200` 控制。你这份已经积累 52 KB。

**`mount-diag.json` / `panel-client-diag.json` — 装载与面板诊断**，分别记录扩展点挂载情况和侧栏面板客户端状态。

**结论：这些文件不是给你手动用的，是 0.1.20 在 desktop profile 里持续运行产生的。** 直接"按照这个进行"就行——不用改，它们已经在跑。

## 3. 之前的 Oblivion 是单独软件还是插件？

**是 DSH 插件，不是独立软件。** 三个证据：

**一、它的交付形态是 `cordis.patch.yml` + insert 行**

`C:\Projects\Oblivion\oblivion-core\cordis.patch.yml` 开头就写：

> 本文件是「让包自己声明怎么被组合」的声明。两种用法二选一：
> ① 热挂路径（推荐，本机实测无需重启 App）
>   package.json 里**不写** dsh.bundle；把下面这段 insert 手工追加到
>   `%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` 末尾。
>   profile 补丁层被监视，落盘即装载。
> DEC-028：本包**走热挂**（这个 insert 行落盘即装载，不需要重启 App）

`- insert: - id: '@oblivion/core' - name: '@oblivion/core'` —— 这是 **Cordis DI 的插件插入声明**，独立软件不需要这个。

**二、它靠 DSH 的扩展点工作**

从 `status.json` 和文件类型反推，它 inject 了 `session`（监听 `session/event`）、`systemPrompt`（`promptSectionOrder: 50`）、`tools`，写 `perspective` / `feedback` / `stats`。这些全是 DSH 的服务名。

**三、它已经在 desktop profile 里挂着**

`C:\Users\liveu\.dsh\profiles\desktop\package.json` 的 `dsh.profile.bundles` 里有 `@oblivion/bundle`、`@oblivion/brand`，`dependencies` 里有 5 个 `link:C:/Projects/Oblivion/...`。

**但有件事要纠正我自己**：它的 `mdRoot` 是 `C:/Library/那些渐渐被遗忘`——**不是** `~/OblivionKB`。我那份手写的包把 `mdRoot` 设成了 `~/OblivionKB`，所以产生了 `OblivionKB\10-Topics\联通性检查.md`。**那是我制造的垃圾**，不是 0.1.20 的行为。0.1.20 的笔记按 `mdClassify` 分类落在：

```
C:/Library/那些渐渐被遗忘/
├── 00_导入文件/       (doc)
├── 01_问答沉淀/       (session / qa_loop)
├── 02_Wiki页面/       (wiki)
├── 03_创作产物/       (content_creator)
└── 04_会话整理/       (session_digest)
```

这也解释了为什么我这个会话的工作目录是 `C:\Library\那些渐渐被遗忘`——**它就是你的知识库根目录**。

---

## 所以现在该做什么

我那份 0.1.0 是纯负资产，要清掉：

1. 删 `C:\Library\那些渐渐被遗忘\oblivion\`（我手写的整套）
2. 删 `~/.dsh/profiles/web/node_modules/@oblivion/`（我塞进去的副本）
3. 撤回 web profile 的 `cordis.patch.yml` 里那两行 insert
4. 删 `~/OblivionKB/`（我误建的镜像目录）
5. `~/.dsh/.credentials.yaml` 里那个 `OBLIVION_BRIDGE_TOKEN` 可以先留着——如果后面真给 0.1.20 加桥接会用到

然后**先读** `C:\Projects\Oblivion\oblivion-core\src\index.ts`（12 KB，看它 inject 了什么、暴露了什么门面）和 `dshx.yml`，再决定要不要给它加 HTTP 桥接——因为你现在问的「DeepSeek++ 能不能接上真正的 core」，答案取决于 0.1.20 是否已经暴露了可供桥接层调用的接口。

要我现在就执行 1–4 的清理，然后读 `src/index.ts` 吗？

- 涉及工具: `pwsh`, `read`

---