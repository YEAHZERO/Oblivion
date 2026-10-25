# dsh-weknora 是 WeKnora · 轮 1

- 来源会话: `session-3fc0a659-0b43-4f19-8e5d-463bd5915e0f`

## 问题

`@wxg-prc-cpg/dsh-weknora` 是 WeKnora 官方为 DeepSeek Harness (dsh) 提供的插件，让 dsh 的 Agent 能直接检索你的 WeKnora 知识库。安装只需要一条命令，前提是你已经有一个可用的 WeKnora 服务。

### 📦 安装插件

在 dsh 仓库根目录（或任何已安装 dsh CLI 的环境）执行：

```bash
dsh plugin --profile web add @wxg-prc-cpg/dsh-weknora
```

`--profile web` 表示安装到 Web 环境。这是推荐方式，npm 上已有预构建产物，不需要你在本地执行任何构建脚本。

### ⚙️ 配置连接

安装后，需要告诉插件你的 WeKnora 部署地址和 API Key。最简单的方式是设置环境变量，再启动 dsh：

```bash
# 你的 WeKnora 地址（dsh 所在机器能访问到的地址）
export WEKNORA_BASE_URL=http://localhost:8080

# WeKnora API Key（至少需要 retrieve 权限；如果要使用 weknora_ask，还需要 chat 权限）
export WEKNORA_API_KEY=sk-你的key

# 可选：默认检索范围（不设则检索 API Key 可见的所有知识库）
export WEKNORA_KNOWLEDGE_BASE_IDS=kb-123,kb-456

# 启动
dsh web
```

如果不想用环境变量，也可以编辑 dsh profile 的 `cordis.patch.yml`（路径通常是 `~/.dsh/profiles/web/cordis.patch.yml`）来覆盖配置。注意：**patch 会整块替换该行的 config**，所以没写的字段会回到默认值，要保留的字段需要一并写出来。

### 🛠️ 四个只读工具

插件装好后，Agent 会多出四个 WeKnora 相关工具：

| 工具 | 作用 |
|---|---|
| `weknora_list_knowledge_bases` | 列出你可见的知识库名称和 ID |
| `weknora_search` | **最核心的工具**。混合检索，返回排序后的原文片段，带引用来源和得分 |
| `weknora_read_document` | 按顺序还原单篇文档的完整正文，支持翻页 |
| `weknora_ask` | 让 WeKnora 用自己的 RAG/Agent 流水线生成带引用的成稿答案，会返回一个可续聊的 session_id |

`weknora_search` 是日常用得最多的，它返回的是**原文片段**而不是结论，所以 Agent 的推理过程是可审计的。`weknora_ask` 比较慢，适合跨多篇文档的宽泛问题。

### ⚠️ 安全注意

这个插件**只读**，不会向 WeKnora 写入任何内容（不导入、不改分块、不删除）。API Key 通过 `X-API-Key` 头发送，错误信息只会报告 HTTP 状态和原因，不会暴露 Key 本身。不过安装任何 dsh 插件都意味着**在你的机器上运行第三方代码，权限和你本人一样大**，建议先看一眼源码，或者锁定版本安装。

## 回答

你提供了 `@wxg-prc-cpg/dsh-weknora` 插件的安装文档，但没有明确说明要做什么。这个仓库叫 **Oblivion**，它有自己的 `oblivion` CLI（而不是 `dsh`），插件管理通过 `oblivion plugin` 命令完成。

请问你想让我：

1. **安装插件** — 执行 `oblivion plugin --profile web install @wxg-prc-cpg/dsh-weknora`
2. **配置环境变量** — 在 `.env.oblivion` 或 profile 层写入 `WEKNORA_BASE_URL` / `WEKNORA_API_KEY`
3. **查看已有配置** — 检查当前 profile 和 cordis.patch.yml 中是否有 weknora 相关条目
4. **其他** — 请具体说明

- 涉及工具: `glob`, `grep`, `pwsh`, `read`

---