#  · 轮 20

- 来源会话: `session-db504efc-b898-403a-becb-e934c3faa6d2`

## 问题

修复：oblivion-bundle 缺 selfcheck	高——组合层插错会导致重复挂载、整棵插件树启动失败	优先补：断言插了哪些包、没有重复插 brand/vimc
oblivion-vimc 缺 selfcheck	中——客户端槽位契约（42 项单测兜底）	次优补：dsh.client.inject 与槽位声明一致

## 回答

I'll start with `oblivion-bundle` since it's the higher-risk gap. Let me read the files I need before editing.

Now I have everything I need for `oblivion-bundle`. Let me write its selfcheck.

I left a broken placeholder function and a missing import in that file. Let me fix both.

Now add the `selfcheck` script to package.json and run it.

I need to read package.json with the read tool before editing it.

14/14 pass. Note the cross-validation caught something interesting: it lists `@oblivion/bundle` itself as "self-patching" — correct, since it declares `dsh.bundle.patch`. And it verifies it isn't in its own insert list, which it isn't.

Now `oblivion-vimc`. Let me read its package.json and client source first.

Now let me look at the vimc source structure and how its client registers slots.

Now let me check the host-side `src/index.ts` exports and the `dshx.yml` marker, so the selfcheck can verify the contract between them.

I have what I need. Let me check how the host's `name`/`inject` are declared (they weren't in the grep — likely via a different pattern).

Interesting — vimc's host side has **no `name` or `inject` export**, only `apply`. It's a function-style plugin. The host's `provide('oblivionVimc', ...)` is also notable — I should check whether that's declared in compat.

Let me check the top of the file for any `inject` declaration.

```dsh-tool

```

I now have a complete picture of vimc. Let me write its selfcheck.

Now add the `selfcheck` script to vimc's package.json. Let me read it first (already read earlier in this session, so I can edit directly).

My assertion was wrong. `dsh.client.inject` here lists **client packages** (`@deepseek-ai/dsh-client-ui-settings`), not Cordis services — and the source's `export const inject = []` (empty services) is a separate thing. Let me verify by reading the source's contract carefully.

Confirmed — my assertion conflated two different things:

- **`package.json` → `dsh.client.inject`**: the list of *client packages* this plugin's bundle needs available (`@deepseek-ai/dsh-client-ui-settings`).
- **`src/client/index.ts` → `export const inject = []`**: the Cordis *services* the module itself hard-depends on (empty; it uses progressive `ctx.inject(['slots'], …)`).

These are orthogonal. My assertion was simply wrong. Let me fix it to assert the correct contract.

```dsh-tool

```

Both pass. Now let me update the ledger in the check-method doc and run the full workspace check.

```dsh-tool

```

I need to read the doc section before editing it.

```dsh-tool

```

Both gaps closed. Full workspace check is green.

## 补齐的两个 selfcheck

### `oblivion-bundle` — 14 项

**这个包没有 `apply()`**，全部内容是 `cordis.patch.yml`。所以自检验的不是「代码能不能跑」，而是**组合声明是否正确**——它唯一的实质内容，也是唯一会出事的地方。

抓的核心故障是**重复挂载**：自带 `dsh.bundle.patch` 的包由安装器写进 `profile.bundles`，若 bundle 的 patch 再插一次同名行，同一插件挂载两次——实测结论是「两个 Node 半边、重复注册前缀路由，**整棵插件树启动失败**」。这个约束此前**只写在注释里，没有任何机器检查**。

四组断言：

| 组 | 关键项 |
|---|---|
| A 产物形状 | 空壳可 import · **没有** `apply`/`name`（防将来有人手滑把它写成插件） |
| B patch 声明 | 恰好插 `core`/`panel` · **没插** brand · **没插** vimc · 不写 `config` · `@` 标量都加引号 |
| C **交叉验证** | 读工作区里各成员包**真实的** `package.json`：被插行的包都不自带 patch、自带 patch 的包没被插行 |
| D profile 对账 | 本包在 `bundles` 里 · 被插行的包都在 `dependencies` 里 |

写的时候踩了一个坑：**不能用全文搜包名**。注释里也出现 `@oblivion/brand`（解释为什么不插它的那一段），直接搜会被自己的文档骗过去。所以逐行剥掉 `#` 注释再匹配：

```js
const line = rawLine.replace(/#.*$/, '');
const match = /^\s*-\s*id:\s*['"]?([^'"\s]+)['"]?\s*$/.exec(line);
```

C 组有个意外收获：它把 `@oblivion/bundle` **自己**也识别成了「自带 patch 的包」——正确，它确实声明了 `dsh.bundle.patch`——并验证它没在自己的插入列表里。

### `oblivion-vimc` — 15 项

有 42 项单测，但那些跑在 Node + happy-dom 里直接 import 源码。selfcheck 补的是**产物与声明的一致性**——插件真正被挂载时会不会出问题。

钉住两处三方逐字一致：

| 一致项 | 三方 | 漂了的后果 |
|---|---|---|
| **id** | `package.json` 的 `name` · `dshx.yml` 的 `id` · `client.js` 工厂的 `id` | `dshx activate-new-client` 硬校验 `plugin.id === packageName`，直接拒绝 |
| **marker** | `dshx.yml` 的 `marker` · `src/index.ts` 的 `console.log` · 产物 | `dshx verify-boot` 靠它证明 `apply()` 真跑过，漂了静默失败 |

还有：客户端产物必须是 `__ModuleLoader__.load` 工厂（不是普通 ESM）· 声明的槽位在源码里真被注册 · **不带** `dsh.bundle.patch`（否则从热挂退回 bundle 层）· `patchInsert` 声明了自己的 id · profile 对账（用户层插入行在、**不在** `bundles` 里）。

## 一个我自己写错的断言

第一版我写了「`client.inject` 为空」，**FAIL 了**：

```
FAIL  client.inject 为空（键盘引擎不该因 UI 服务缺席而不装）
        inject 被加成了硬依赖
1 !== 0
```

查下去发现是我**混了两个不同的 `inject`**：

- `package.json` 的 `dsh.client.inject` = **客户端包**依赖（`@deepseek-ai/dsh-client-ui-settings`）
- `src/client/index.ts` 的 `export const inject = []` = **Cordis 服务**硬依赖（空，走 `ctx.inject(['slots'], …)` 渐进注册）

两者正交，我拿第一个去断言第二个。改成正确的断言后过。这个坑写进文档了——**两个 `inject` 各有各的断言，别混**。

## 最终状态

```
==> DSH 宿主契约校验   6 包全 PASS
==> pnpm install
==> pnpm -r run typecheck
==> pnpm -r run test          （core 14 · panel 14 · vimc 42 · bridge 16）
==> pnpm -r run build
==> pnpm -r run check:version
==> pnpm -r --if-present run selfcheck
      core 29 · vimc 15 · bundle 14 · bridge 14 · panel 12 · brand 11
全部通过（task=check）
```

台账已更新——**selfcheck 层现在 6/6 全覆盖**。剩余缺口只剩两个低风险项：`oblivion-bundle` 无 typecheck（它没有 TS 源码，不补）、brand/panel 缺单测（selfcheck 已覆盖主要路径，可选）。

文档第六节还新增了「两类组合层包的自检要点」，把 bundle 的「剥注释再解析 + 交叉验证成员包」和 client 的「三方 id/marker 一致」写成可照搬的模式。

---

**提醒**：desktop 重启验证仍未做。core 0.2.0 + http-bridge 都就位了，桥接是否真在 desktop 起来、DeepSeek++ 能否连上，还没被证明过。

- 涉及工具: `edit`, `pwsh`, `read`, `write`

---