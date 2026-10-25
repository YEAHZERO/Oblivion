# Oblivion-LAYOUT · 轮 2

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

<goal_round>
Objective: "按 .design 四份设计文档与 .memory/TODO.md 的清单构造 Oblivion：先交付 Phase 1（oblivion-core 内核：Cordis 容器 + 六层 YAML patch 引擎 + 启动链 + --dump-config 导出 + CLI），门禁为 typecheck/lint/测试全绿且 --dump-config 能导出组合树；再推进 UI 侧 Phase 4b/4a（几何常量、computeColumns、layout store、槽位地图、tab 注册、令牌层），每步都以可运行代码与回归测试为证据。"
Round: 1/40

Continue working toward the objective in this same session. Treat the current workspace, tool results, and durable session state as authoritative; inspect them instead of assuming earlier narration is still current. Make concrete progress and verify the result. Before claiming completion, gather evidence that the whole objective is achieved, read the current goal, and mark it complete. If work remains, leave the goal active for the next round. Follow the configured goal-tool policy before reporting a blocker.
</goal_round>

## 回答

Continuing toward the objective — Phase 4a (token layer) is next. Let me first check the current state and map the design doc.

The authoritative token table lives in the evidence baseline. Let me check whether it's on this machine.

The evidence baseline is present. Let me write a generator that turns the authoritative 427-token table into a committed artifact.

Let me write the generator as a raw template to avoid quoting hazards.

The generator produced exactly **427 tokens with the ledger 77 / 107 / 243**, matching the design doc. Now the handwritten theme modules.

Now the Phase 4a test suite.

Two real findings. Let me check the ERRATA ledger format before recording them.

Now let me register the three findings in the project's ERRATA ledger.

`tokens:check` correctly caught that prettier had reformatted the generated artifact. Let me fix that properly.

Let me make the generator side-effect-free on import and add a self-verifying guard test.

Let me verify the new guard isn't vacuous (reverse-verification), then run the final gates.

已按 `.design` 四份文档与 `.memory/TODO.md` 的清单完成本轮构造，**三个阶段的交付全部落地，门禁全绿**。

## 交付结果

### Phase 1 — `oblivion-core` 内核（可加载插件）

启动链按 `architecture.md` §3.2 逐字落地：`composeProfile()` → 重写空根 → `boot()` → 有界退出。

| 文件 | 内容 |
|---|---|
| [compose.ts](packages/oblivion-core/src/patch/compose.ts) | 六层叠加；**patch 替换整段 config（非深合并）**、来源链、命中不到 id 的 warn/error 两态 |
| [tags.ts](packages/oblivion-core/src/patch/tags.ts) | `!!js` 解析成**未求值**的表达式对象 + `${env:...}` 插值 |
| [dump/index.ts](packages/oblivion-core/src/dump/index.ts) | 三个 dump 命令；**schema 不完整时降级为组合树并 exit 0**（参考架构此处 exit=1） |
| [shutdown.ts](packages/oblivion-core/src/profile/shutdown.ts) | 有界退出。两条实测事实决定其形状：Node 信号监听器是 **unref** 的；**Windows 上 `kill('SIGTERM')` 不投递信号** |
| [cli.ts](packages/oblivion-core/src/cli.ts) + [oblivion.mjs](apps/cli/oblivion.mjs) | `web` / `init` / 三个 dump；`--host 0.0.0.0` 默认拒绝，放行后必须给 `--trusted-host` |

### Phase 4b — UI 帧层（纯 TS，不依赖 React）

[columns.ts](packages/oblivion-web-ui/src/layout/columns.ts)（9 常量 + 让步顺序，**左栏不让步**）、[stores.ts](packages/oblivion-web-ui/src/layout/stores.ts)（8 字段 + **新增偏好 `rightbarOpen`**，两条语义相反的规则）、[service.ts](packages/oblivion-web-ui/src/layout/service.ts)、[slots.ts](packages/oblivion-web-ui/src/slots.ts)（5+7+5=17）、[tab-registry.ts](packages/oblivion-web-ui/src/tab-registry.ts)。

### Phase 4a — UI 令牌层

[generate-ui-tokens.mjs](scripts/generate-ui-tokens.mjs) 从证据快照**机械生成** [tokens.generated.ts](packages/oblivion-web-ui/src/theme/tokens.generated.ts)（实测 **427 个，① 77 + ② 107 + ③ 243**，与 §2.2 逐节吻合）、[settings.ts](packages/oblivion-web-ui/src/theme/settings.ts)、[scale.ts](packages/oblivion-web-ui/src/theme/scale.ts)（182 的账目）、[css.ts](packages/oblivion-web-ui/src/theme/css.ts)（零 JS 主题切换 + 无闪烁注入）。

## 三处需要你过目的判断

1. **`oblivion-core` 的 `dependencies` 由空改为 `{js-yaml}`** —— 依 §9.2「第三方库进 `dependencies`、跨包依赖走 `peerDependencies`」；结构测试相应改为「白名单 + 禁止 `oblivion-*`」。
2. **根 `package.json` 新增 `oblivion.profile.bundles`**，显式声明 26 个 bundle 顺序。
3. **登记了 `ERRATA-45~47`**（[ERRATA 台账 §N](.design/ERRATA-v4.0.1-draft.md)）—— 其中 `ERRATA-46` 值得注意：逐值表把 `--obl-focus-ring-color: transparent` 记在基值层，若按「全量注入基值层」实现，**键盘焦点环会永远不可见且毫无报错**；已改为限定作用域。三条都是「把令牌渲染成 CSS 才会暴露」的问题，纸面读不出来。

## 验证方式

```
typecheck 0 · lint 0 · npm test 600/600 绿（478 → 600）
npm run tokens:check  产物与证据一致（427 个令牌）
node apps/cli/oblivion.mjs --dump-config  exit 0 · 28 层 / 26 行 / 3 行禁用
web                                    exit 0（SIGTERM 有界退出）
```

新增 7 个测试文件：

- `--dump-config-schema` 的降级路径、`!!js` 求值失败按「不加载」、来源链、`§7 先折叠左栏右栏才开得出来`
- 拉窄到 900 再拉回 1600 左栏必须回到 400（§3 点名最易被破坏的一条）
- **反向验证过**：手改 `tokens.generated.ts` → `tokens:check` 守卫变红，还原后复绿

## 现状与下一步

改动**尚未提交**（工作区 11 个修改 + 17 个新增，见 `git status`）。有意保留的一条告警：`profiles/web` 改写的 `webserver` / `web-app` 两行在 Oblivion 里不存在（它们是参考架构的行），合成时记为警告而非崩溃。

**Phase 4c（组件层：57 组件 + 188 图标）未开工** —— 需要先接入 React 依赖，当前 `node_modules` 里没有。另外 `.memory/TODO.md` §E④ 把「`ctx.slots` 槽位注入机制」列为 Phase 4 的关键未知，因此我只实现了有证据支撑的那部分语义（声明表 + 注册器），没有假称框架接线已完成。

- 涉及工具: `run_code`

---