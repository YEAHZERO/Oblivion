#  · 轮 5

- 来源会话: `session-db504efc-b898-403a-becb-e934c3faa6d2`

## 问题

对比本地的插件：dsh-deepseek-web-login（https://github.com/cv-superding/dsh-deepseek-web-login）
v0.6.38
dsh-deepseek-web-login

Unofficial DSH plugin: use chat.deepseek.com web models as a DSH LLM provider (browser login capture + PoW solving + SSE streaming + prompting-based tool calls), provider route deepseek-web
是不是类似就是这种？

## 回答

同一种插件。你贴的这个 `dsh-deepseek-web-login` 和我刚给你写的那两个包，**在 DSH 里占的位置完全不同**。

## 一句话区分

| | dsh-deepseek-web-login | 我刚写的 @oblivion/core + @oblivion/http-bridge |
|---|---|---|
| **扩展点** | `ctx.llm` —— **provider 适配器** | `ctx.tools` / `ctx.systemPrompt` / `ctx.session` + `ctx.webServer` |
| **回答的问题** | 「用哪个模型来思考」 | 「思考时要记住什么」 |
| **在架构里的位置** | agent loop 的**上游**（产出 token 流） | agent loop 的**旁路**（读写知识、注入提示） |
| **对模型的态度** | 它就是模型本身 | 是模型的**外挂记忆** |
| **依赖** | Electron（登录窗口、`net.fetch` 指纹） | 纯 Node，无浏览器依赖 |
| **能不能共存** | 能，而且**天然互补** | 能 |

`dsh-deepseek-web-login` 做的是：把 `chat.deepseek.com` 网页版接成 DSH 的一个 provider。你在模型选择器里选它，DSH 的 agent loop 就把「要问什么」交给它，它负责 PoW 求解、SSE 解析、把网页端不存在的 function calling 用**提示词协议**模拟出来，最后吐出 `tool-call` 块给 DSH。

我的 `@oblivion/core` 做的是：agent loop 在思考时，能**查本地知识库**、**把结论写回去**、系统提示里**多一段能力说明**、每轮对话结束后**自动沉淀问答**。

```
                      ┌─────────────────────────────┐
DSH agent loop ──────▶│  ctx.llm                    │
                      │   ├─ deepseek-web（他的）   │──▶ chat.deepseek.com
                      │   └─ deepseek-official      │──▶ api.deepseek.com
                      └─────────────────────────────┘
        │
        │  同一轮里
        ▼
   ctx.tools ──▶ oblivion_search / oblivion_capture   ◀── @oblivion/core（我的）
   ctx.systemPrompt ──▶ 「你有本地知识库…」
   ctx.webServer ──▶ /oblivion/mcp                    ◀── @oblivion/http-bridge（我的）
                            ▲
                            │
                    DeepSeek++ 扩展 ──▶ oblivion_capture_page
```

**两者可以同时装**：用他的 provider 免费跑网页版模型，同时用我的插件让这个 agent 有本地长期记忆。他甚至在同一份 README 里抱怨「工具目录越厚越容易被风控」——我的 `oblivion_search` 恰好在做相反的事：**把内容从上下文挪到按需检索的磁盘上**。

## 但有一处实质性的交叉，值得说清

他那份 README 有一节叫「关于装了这个插件之后封号了」，核心论点是：

> 上下文越大 ⇒ 每轮请求越重 ⇒ 越容易撞上风控的体量与密度判定。

而我的插件做两件会**改变上下文体量**的事：

1. `OBLIVION_SYSTEM_PROMPT` 每轮都进 system prompt（约 600 字符 ≈ 200 token，很小）
2. `oblivion_search` 返回的记录正文（这个可控，默认取 600 字符/条 × 最多 10 条）

第 1 项可忽略，第 2 项**设计上就是净减少**——用一次 6 KB 的按需检索，替掉你手动粘贴一整个网页的行为。但它确实会**改变每轮请求的形状**（system prompt 多一段、工具目录多 4 个）。如果你同时用他的 provider，系统提示和工具目录的变化会触发他的 `contextMode: chained` 退回全量——因为链首那份已经过期。

**这是可以避免的**：把 `order: 3150` 那段改成不注入提示、只保留工具。代价是模型不知道主动去查。

## 另一个更重要的差异：安全模型

他的插件为了抓登录态，**必须开 Electron 窗口、读 `webRequest.onBeforeSendHeaders`**，因此只能在 Desktop profile 跑（纯 web profile 走「手动粘贴 token」降级）。

我的 `@oblivion/http-bridge` 走的是反面路线：**纯 Node + 回环 + Bearer token + 常量时间比对**，两个 profile 都能跑，不需要任何浏览器窗口。

顺带一提，他的 README 里那句「DSH 下发的工具定义会尽量全部写进 prompt」——这正好印证了我之前跟你说的选路依据：**扩展支持 HTTP MCP 传输**（`CapabilitiesPage` 里的 `transport.kind !== 'native_messaging'` 分支），所以我给 DeepSeek++ 扩展做的桥接走 HTTP 是对的，不需要碰它 1 MB 的 `background.js`。

## 他现在版本号已经跑到 0.6.41

你贴的页头写 v0.6.38，但文件列表最后几行的 commit message 是 `fix: discard the scaffolding session on the error path too (0.6.41)`。这个插件的迭代密度说明一件事：**网页端私有接口的适配是个持续维护的活**——每一条「实测」「现场证据」背后都是一次线上故障。

相比之下，`@oblivion/core` 的敌人只有一个：**你自己的上下文预算**。

---

要不要我把「两者共存」这个场景的配置也写出来？具体是：在他的 provider config 之外，给 `@oblivion/core` 加一个 `disableSystemPrompt: true` 开关，避免链式投喂退回全量。这需要你先把权限问题解决——`~/.dsh/profiles/web` 还是写不进去。

---