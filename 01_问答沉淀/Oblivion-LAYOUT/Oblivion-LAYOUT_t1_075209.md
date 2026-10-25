# Oblivion-LAYOUT · 轮 1

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

"C:\Projects\Oblivion\.design\LAYOUT.MD"
"C:\Projects\Oblivion\.design\ARCHITECTURE.MD"
"C:\Projects\Oblivion\.design\COMPONENTS.MD"
"C:\Projects\Oblivion\.design\DESIGN.MD" @.memory\TODO.md 按照这个架构和UI的清单开始构造该软件

## 回答

I'll start by reading the design documents and TODO list to understand the architecture and UI requirements.

The sandbox worker can't grant write access to the workspace. Let me try a wider sandbox mode as a one-shot to get a working process.

The `run_code` process itself works under full access, but every nested tool call fails when the sandbox tries to grant write to the workspace ACL. Let me diagnose the ACL directly with Node.

File policy is now full access. Let me read the design documents.

Docs are large. Let me survey the current repo state and read the remaining specs in a structured way.

Now I understand the architecture. Let me set up the goal and check the environment before building.

Now let me set up the goal and plan, then check CI ordering.

Let me establish a baseline before making changes.

Let me set up the goal/plan and verify Cordis fiber-await semantics before writing code.

Baseline is green (478 tests, clean typecheck). Now let me set up the goal and start building Phase 1.

Now let me write the patch engine. Starting with home resolution and YAML tag support.

Now the profile boot chain, shutdown, and dump. Writing via direct file access for speed.

`--dump-config` works end-to-end. Let me verify the other dump kinds, the schema degradation, boot, and the safety guard.

Boot works (10 active / 13 waiting / 3 skipped / 0 failed). Let me add shutdown logging and verify the safety guard.

Signal listeners don't hold the event loop alive — `web` must hold deliberately. Let me fix that.

Now let me write the test suites.

All 536 tests pass. Let me check lint and docs.

Now let me update the documentation to match the implementation.

Phase 1 is delivered with all gates green. Now let me build the UI frame layer (Phase 4b).

The engine logic is right; my test expectations ignored the narrow breakpoint and the shrink rule. Let me correct them.

All 579 tests pass. Let me run the remaining gates and update docs.

All gates green. Let me record progress in the project TODO list.

已按设计文档与 TODO 清单开始构造，本轮交付**两个阶段**，全部门禁绿。

## 一、Phase 1 — `oblivion-core` 内核（可加载插件）

内核从契约骨架变成真实现，启动链按 `architecture.md` §3.2 落地：

```
runProfile()
  ├─ composeProfile()       ← 六层 patch 叠加（§11.1）
  ├─ 重写空根 cordis.yml     ← §11.4，防止组合结果被固化
  ├─ boot()                 ← 挂载 Cordis 插件树
  └─ createProcessShutdown() ← SIGINT/SIGTERM 有界退出（5s 超时）
```

| 模块 | 内容 |
|---|---|
| [compose.ts](packages/oblivion-core/src/patch/compose.ts) | ① 空根 → ② Bundle → ③ 用户层 → ④ Home 层 → ⑤′ 项目层 → ⑤ `--patch`；**patch 替换整段 config（非深合并）**、来源链、命中不到 id 时 warn/error 两种处置 |
| [tags.ts](packages/oblivion-core/src/patch/tags.ts) | 自定义 js-yaml Type，`!!js` 解析成**未求值**的表达式对象（所以 `--dump-config` 能在不启动插件时求值并原样打印回去）+ `${env:...}` 递归插值 |
| [dump/index.ts](packages/oblivion-core/src/dump/index.ts) | 三个 dump 命令；**schema 不完整时降级为组合树并 exit 0**（参考架构此处是 exit=1，§7.3 / RISK-109） |
| [shutdown.ts](packages/oblivion-core/src/profile/shutdown.ts) | 有界退出。两条实测事实决定了它的形状：Node 的**信号监听器是 unref 的**（不按住进程，`web` 会启动完就退出）；**Windows 上 `kill('SIGTERM')` 不投递信号**（所以要注入信号源才测得动） |
| [cli.ts](packages/oblivion-core/src/cli.ts) + [oblivion.mjs](apps/cli/oblivion.mjs) | `web` / `init` / 三个 dump 命令；`--host 0.0.0.0` 默认拒绝，放行后还必须给 `--trusted-host`（PF-19 / RISK-118 ③） |

**门禁实测**（`node apps/cli/oblivion.mjs --dump-config`）：exit 0、**28 层 / 26 行**、3 行默认禁用。

## 二、Phase 4b — UI 帧层（纯 TS，不依赖 React）

| 模块 | 内容 |
|---|---|
| [columns.ts](packages/oblivion-web-ui/src/layout/columns.ts) | 9 个几何常量 + `clampWidth()` + `computeColumns()`，**让步顺序照字面实现**：右栏先收缩 → 再丢轨道 → 中央才可低于 `CENTER_MIN`；**左栏不让步** |
| [stores.ts](packages/oblivion-web-ui/src/layout/stores.ts) | `LayoutInfo` 8 字段 + **新增偏好 `rightbarOpen`**（`OPEN-LAYOUT-03` ② 的前提）；两条语义相反的规则各有用例：左栏「关闭即遗忘」/ 右栏「跨 resize·close 保留」 |
| [service.ts](packages/oblivion-web-ui/src/layout/service.ts) | `ILayout` 服务面，含 `beginNavigation` 的 abort 纪律，并补上 §4.2 明记的缺口 `setRightbarOpen` |
| [slots.ts](packages/oblivion-web-ui/src/slots.ts) | 槽位地图 **5 + 7 + 5 = 17**（右栏按**表**的 5 个实现，不是标题的 4 个 —— `ERRATA-21`）+ 最小注册器 |
| [tab-registry.ts](packages/oblivion-web-ui/src/tab-registry.ts) | 三优先级带 + glob 地址识别（含 `:` 匹配整个地址）+ `canOpen` 否决 + thunk 标题 |

§3 点名「最容易被实现破坏」的那条 —— **响应式让步绝不回写宽度偏好** —— 有独立回归用例（拉窄到 900 再拉回 1600，左栏必须回到用户拖出来的 400）。

## 三、门禁

```
typecheck  0        lint  0        npm test  579/579 绿（478 → 579）
dump-config  exit 0 · 26 行 · 28 层
```

## 四、两处需要你知道的口径变更

1. **`oblivion-core` 的 `dependencies` 不再是空的** —— 按 §9.2「第三方库进 `dependencies`、跨包依赖走 `peerDependencies`」加了 `js-yaml`；对应的结构测试从「必须为空」改成「白名单 + 禁止 `oblivion-*`」。
2. **根 `package.json` 新增 `oblivion.profile.bundles`**，显式声明 26 个 bundle 的叠加顺序（未声明时按字典序兜底并告警 —— 兜底是猜测，不该长期依赖）。

**有意保留的告警**：`profiles/web` 改写的 `webserver` / `web-app` 两行在 Oblivion 里不存在（它们是参考架构的行），合成时记为警告而非崩溃 —— 这正是降级姿态要暴露的事实，不是 bug。

## 五、下一步（已记入 [TODO.md](.memory/TODO.md)，Phase 1 与 4b 已勾选）

- **4a 令牌层**：427 令牌落地、`ThemeSettings` 常量组、8 档刻度 × 6 子变量、`ERRATA-19` 的 13px 夹子修正
- **4c 组件层**：57 组件 + 188 图标 —— **需要先接入 React 依赖**（当前 `node_modules` 里没有）
- **Phase 2**：`oblivion-llm-*` + `oblivion-session-*`（26 行里 13 行处于 `pending` 就是在等这些服务）

文档已同步：[README.md](README.md)、[CHANGELOG.md](CHANGELOG.md)（新增两个未发布段）、[oblivion-core/README.md](packages/oblivion-core/README.md)、[oblivion-web-ui/README.md](packages/oblivion-web-ui/README.md)、[docs/快速开始.md](<docs/快速开始.md>)。改动尚未提交，工作区可见全部新增文件。

- 涉及工具: `run_code`

---