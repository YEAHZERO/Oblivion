# 创造一个插件（命名为@oblivion · 轮 14

- 来源会话: `session-10837d9b-ba07-420d-a8d3-3e14e1972481`

## 问题

"C:\Projects\Oblivion\.design\DSH-COMPAT.md"
"C:\Projects\Oblivion\.design\ARCHITECTURE.MD" 对比这个设计书，看看还有哪里没做的，先说出来，然后我来决定。最后修改设计书和"C:\Projects\Oblivion\README.md"

## 回答

先读这两份设计文档，再做「设计书 vs 现状」的系统对比。

AC 表 28 条**全是 `Not started`**（最后核对还是 10-02）——这本身就是一处大缺口。跑一次契约校验拿实证：

全部证据到手。设计书 §21 的 28 条 AC **全是 `Not started`**，而契约校验其实已经覆盖三个插件（core 8/8 ✓）。把 AC 表读全，然后给你缺口清单：

缺口清单已成型。先看设计书结尾，便于把「现状对账」写进去：

现状与缺口已查清。现在把结论写进设计书（新增 §33 现状对账）：

对账完成，并已把**事实性内容**写进设计书与 README（提交 `548b62e`）。下面是我查出来的「没做的」，按优先级排。

## 一、先说结论：契约层没问题，缺口全在**功能面**与**文档面**

刚跑的真实校验（`pnpm run verify:dsh`，证据源 `deepseek-harness @ dsh-v0.2.0-rc.2 639ed01539`）：

| 插件 | 契约结果 | 挂载 |
| --- | --- | --- |
| `@oblivion/brand` 0.1.0 | ✅ **10/10** | bundle 层 |
| `@oblivion/vimc` 0.2.9 | ✅ **6/6** | bundle 层 |
| `@oblivion/core` 0.1.2 | ✅ **8/8** | ⚠️ **用户层 insert 行**（不在 `bundles`） |

## 二、没做的（功能面）

| # | 缺口 | 设计书出处 | 说明 |
| --- | --- | --- | --- |
| 1 | **KB 目录结构与设计不符** | §25.3 / REQ-002·003·006 | 实现是 `~/OblivionKB/10-Topics/<topic>.md`；设计要 `md_sync.base_dir: ./oblivion_docs` + `00_导入文件/01_问答沉淀/02_Wiki页面/03_创作产物/99_其他/`。**设计书里 0 处 `10-Topics`** → 实现自定，需你裁定哪边为准 |
| 2 | **文档导入与解析** | REQ-002、§12.3、D1 | 上传 PDF/Word → MD、anydoc WASM：**0 实现** |
| 3 | **向量检索** | F5/D2、AC-006 | 现状是 token Jaccard + 否定翻转；**0 实现**（依赖选型 + 许可证登记） |
| 4 | **MD 格式规范** | §25.2、REQ-006、AC-009a/b | 现状 `.md` 无 YAML frontmatter（`title/source/created_at/tags/related_wiki`）、无「摘要」段、**无 `[[slug]]` 互链** |
| 5 | **图谱双链写回** | §25.6、§12.4 | `graph/backlink.ts` 不存在 → 双链那条规则只做了一半 |
| 6 | **筛选/分类参数未走 YAML** | REQ-013、AC-017 | `md_rules.yaml` / `qa_rules.yaml` **0 实现**（现状：TS 默认值 + cordis config） |
| 7 | **健康度告警 4 项** | REQ-011、AC-016 | **0 实现** |
| 8 | **20 条标注样本 >90% 准确率** | AC-014 | 无标注集，**未做** |
| 9 | **评价入口 UI（👍/👎/⏺）** | §12.6、REQ-019 | 现只有 `oblivion_feedback` 工具；object 插件没有 UI 面 → 要 client 插件 |
| 10 | **内容创作** | Phase 6、G1、§25.9 | **未做**（设计书自注「默认不加载」「需先实测 notex REST API」） |
| 11 | **Obsidian 适配** | Phase 7、J1、§12.5 | **未做**，且 `ctx.knowledge` / `ctx.ui.ribbonIcon` 在真实 DSH **0 命中**（只有 `activeDocument` 命中）→ 得先做服务存在性对账 |
| 12 | **`oblivion_docs/` 目录结构** | §12.12 | **未做**（与第 1 项同批） |
| 13 | **双部署 / Web 通道** | §5.7（DEC-017）、§5.8 | **未做**（另有 `web通道与webserver形态.md`） |
| 14 | **预置 Profile / 条件加载 / 根配置重写** | §11.2·11.3·11.4 | 仓库 `profiles/` 为空，**未做** |
| 15 | **Agent Presets** | §6.3 | **未做** |
| 16 | **真机 e2e（Phase 9）** | Phase 9 | 各插件有 test/selfcheck ✓，**跨插件/真机 e2e 未做** |
| 17 | **根 `VERSION` 递增器** | OPEN-113 | **未做**（现靠手改 + CHANGELOG） |
| 18 | **core 的挂载策略** | DSH-COMPAT R1 | core 走用户层 → **正是 R1 说的「换机器即静默失效」**（取舍：bundle 层改一次要重启） |
| 19 | **台账缺 core 一行** | DSH-COMPAT §五 | 校验其实已覆盖 core（**8/8**）→ 台账只记了 brand/vimc |

## 三、设计书自己写错的（对比 DSH-COMPAT 时暴露的）

| # | 失真 | 证据 | 我的处理 |
| --- | --- | --- | --- |
| 1 | **`session:complete` 不存在** | 官方 287 包 **0 命中**；`turn` 类只有 `turn/start`·`turn/end` | ✅ 上轮已改为 `turn/end` |
| 2 | **§25.10 事件总线 6 个事件里 5 个不存在**（`session:thinking`/`knowledge:created`/`knowledge:updated`/`md:generated`/`feedback:collected`） | 真实 DSH **各 0 命中** —— 与 `session:complete` 同类错误 | ✅ 已加注「只能作为插件自定义事件，宿主不会 emit」 |
| 3 | **§12.5 服务映射**（`ctx.knowledge.read/write`、`ctx.ui.ribbonIcon`、`ctx.command`） | 真实 DSH 0 命中 | ✅ 已标注「待服务存在性对账，不得据此开工」 |
| 4 | **§23 OPEN-022/024 仍裁定 npm 为运行器 + `package-lock.json` 入库** | 本会话已落地 pnpm workspace | ✅ 已标注被 2026-10-06 裁定取代 |
| 5 | **§21.1 AC 表 28 条全是 `Not started`**（Last checked 还是 **10-02**） | 实际 brand/vimc/core 都已落地并自证 | ✅ 已加注「以 §33 为准」（全表重写属独立修订） |
| 6 | **§18.1「已完成」只记 Phase 1** | 实际 Phase 2–6 已并入 core | ✅ 已补记 |
| 7 | **设计书 0 处提到 DSH-COMPAT 机制** | 它就是 Phase 8「破坏性变更契约」的落地物 | ⏳ 待你裁定是否升格（决策 ⑤） |

## 四、我已经改了（只做事实同步，没动范围）

- **设计书**：新增 **[§33 现状对账与缺口（2026-10-06）](C:\Projects\Oblivion\.design\ARCHITECTURE.MD)**（三插件现状表 / 已完成映射 / 20 条缺口 / 7 处失真 / 5 项待裁定）+ 4 处手术式修正（§18.1、§21.1 注记、§23 OPEN-022·024、§25.10 事件表）
- **[DSH-COMPAT.md](C:\Projects\Oblivion\.design\DSH-COMPAT.md)**：台账补 `@oblivion/core` 0.1.2 **8/8**；写明 core 仍走用户层 = R1 暴露面；R1 行同步；去掉重复的页脚
- **[README.md](C:\Projects\Oblivion\README.md)**：现状表 2 → **3 个插件**、补 `@oblivion/core` 段落（能力/工具/闸门）、加「**设计书写的 ≠ 已做的**」指针 + 未做清单摘要

## 五、等你裁定的 5 件事（设计书 §33.5）

| # | 待裁定 | 选项 |
| --- | --- | --- |
| ① | **KB 目录结构以哪边为准** | (a) 改设计书为现状 `OblivionKB/10-Topics/`；(b) 改实现为 `oblivion_docs/` + `00_/01_/99_`；(c) 折中：根沿用 OblivionKB，内部按 `01_问答沉淀/` 分类 |
| ② | **core 挂载策略** | (a) 迁 bundle 层（与另两个统一、换机器不丢，代价改一次要重启）；(b) 保持用户层（热挂，代价换机器要重装） |
| ③ | **Phase 2 与已有 knowledge 模块的划界** | (a) 并入式（向量检索/anydoc 作 core 可选子模块，`enableVector: false` 默认关）；(b) 拆分式（新包只做解析+检索，先定服务接口） |
| ④ | **Phase 6 / 7 去留** | 保留（先补前置：notex 实测、服务存在性对账）／降级为 `Superseded` 并写明理由 |
| ⑤ | **DSH-COMPAT 是否升格为设计书正式机制** | 是（推荐：已在运行、有 PASS 矩阵与 `文件:行` 证据）／否（仅作运维台账） |

你定了①②③④⑤之后，我再按裁定改设计书正文（AC 表全表重写、§12.x 规格对账、路线图收敛）并把结论落进 README。

- 涉及工具: `edit`, `pwsh`, `read`

---