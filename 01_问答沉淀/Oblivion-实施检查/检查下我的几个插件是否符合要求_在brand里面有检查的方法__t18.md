#  · 轮 18

- 来源会话: `session-db504efc-b898-403a-becb-e934c3faa6d2`

## 问题

检查下我的几个插件是否符合要求（在brand里面有检查的方法）

## 回答

我先找 brand 里的检查方法。

```dsh-tool

```

README 里没有「检查方法」这一节——它是 `scripts/selfcheck.mjs`。这才是你说的 brand 里的检查。

```dsh-tool

```

找到了。现在跑各包的检查。

http-bridge 缺 `selfcheck`——brand 那套检查方法我要给它补上。先跑现有检查看全貌。

全过。现在跑 selfcheck 和 test。

**找到两个真实缺口：**

1. **`oblivion-http-bridge` 的 `node --test` 是 `pass 0`** —— 我建包时忘了写测试
2. **`oblivion-http-bridge` 没有 `selfcheck`** —— brand 那套检查方法它还没有

这正是你让我检查的价值。我按 brand 的 selfcheck 模式给 bridge 补上。

```dsh-tool

```

模式清楚了。现在给 bridge 写 selfcheck——检查它真正该证明的东西。

把 selfcheck 加进 package.json，然后跑。

14 项全过，含三条真实起服务器的端到端断言。现在给 `node --test` 补上单元测试。

一个断言写错了——产物里 `host: "127.0.0.1"` 前面没有 `port:` 那种对齐空格。修掉。

同样问题——产物里是 `var DEFAULT_PORT = 42081`。修掉这条。

```dsh-tool

```

16 项全过。现在跑一遍全部包的完整检查，给出总表。

查完了。**发现 http-bridge 的两个缺口，已补上。** 另外有四个包本来就缺检查项，但那是既有状态，不是这次引入的。

## 全量检查结果

| 包 | 版本一致 | typecheck | 单测 | selfcheck |
|---|---|---|---|---|
| `oblivion-brand` | PASS | PASS | none | PASS (11) |
| `oblivion-bundle` | PASS | no tsc | none | MISSING |
| `oblivion-core` | PASS | PASS | PASS (14) | PASS (29) |
| **`oblivion-http-bridge`** | PASS | PASS | **PASS (16)** ← 新增 | **PASS (14)** ← 新增 |
| `oblivion-panel` | PASS | PASS | PASS (14) | PASS (12) |
| `oblivion-vimc` | PASS | PASS | none | MISSING |

## 我修的两个缺口

你让我检查是对的——**http-bridge 我建包时漏了测试**。现在补上：

**`scripts/selfcheck.mjs`（14 项，沿用 brand 的 PASS/FAIL/SKIP 骨架）**

分三层，关键是第三条和端到端那几条：

- **A 构建形状**：产物可 import · 导出形状 · **`inject` 只声明 `['oblivion']`**（这条断言专门防回归——声明 `webServer` 会在 desktop 停在 pending，就是 0.1.0 踩的坑）
- **B 纯函数**：默认端口 42081 · 回环含 `::ffff:127.0.0.1` · 扩展 ID 预填 · 错误码 `-32700/-32601/-32602` · 协议版本 · 工具目录
- **C 端到端（真起服务器）**：
  - 鉴权三态 401/401/200，且断言 `serverInfo.version` **来自门面**——这证明响应穿透到了 core，不是桥接自己编的
  - 路由边界 404/405/204
  - **`tools/call` 真的调到 `knowledge.query` / `knowledge.capture`**，且 https URL 判为 `url` 源
  - `effect` 注册了 disposer（HMR 重载不泄漏端口）
  - `tokenEnv` 为空时静默禁用

**`test/bridge.test.mjs`（16 项，node --test）**

补的是纯逻辑边界：parse error / 非对象 JSON / `jsonrpc` 不是 2.0 / 未知方法 / ping / 通知返 204 / `tools/list` schema 完整 / 空 query 报错不崩 / **selection 优先于 content** / **http 判 url 源、file 判 doc 源** / **limit 越界（999、-1、'abc'）全回退 10** / **门面缺失返 503 而非 500**。

过程中修了两处断言写错——产物里是 `var DEFAULT_PORT = 42081` 而不是 `port: 42081`，压缩后的变量声明形式和我预想的不同。

## 另外四个包的既有缺口

这不是我引入的，但既然查出来了就报给你：

**`oblivion-bundle` — 缺 selfcheck、无 tsc**
它是纯组合层（`lib/index.js` 是 `export {}`），没有 `apply()`。但它的 `cordis.patch.yml` 有真实约束可验：**插了哪些包、有没有重复插 brand/vimc**（README 里专门解释了为什么不插它们）。这个值得加一个 selfcheck。

**`oblivion-vimc` — 缺 selfcheck**
有 42 项单测（最多），但没有 selfcheck。它是客户端插件，能验的是槽位声明、`dsh.client.inject` 一致性、构建产物形状。

**`oblivion-brand` / `oblivion-panel` — 缺单测**
有 selfcheck（11 / 12 项）但没有 `test/` 目录。不算错——selfcheck 覆盖面已经不错——但纯逻辑（如 brand 的 `version.ts`、panel 的格式化函数）用 `node --test` 更合适。

---

要我把这四个包的缺口也补齐吗？我的优先级建议是：

1. **`oblivion-bundle` selfcheck**（防止重复插入，有真实风险）
2. **`oblivion-vimc` selfcheck**（客户端槽位契约）
3. brand / panel 的单测（价值最低，selfcheck 已覆盖主要路径）

另外提醒：**desktop 重启验证还没做**。core 0.2.0 + http-bridge 都就位了，但你还没重启 DeepSeek Harness，所以桥接是否真的在 desktop 里起来、DeepSeek++ 能不能连上，还没被证明过。

- 涉及工具: `edit`, `pwsh`, `read`, `write`

---