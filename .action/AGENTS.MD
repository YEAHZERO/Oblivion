# AI Agent 协作规范 (统一标准)

## 概述

本文件是 alphα 项目中所有 AI Agent 的**强制性协作规范**。所有 Agent 都必须遵循此规范进行协作。

**重要**: 此文件是项目的唯一权威规范，所有 Agent 工作必须按照此文件执行。

---

## 支持的 Agent

| Agent | 类型 | 优势 | 适用场景 |
|-------|------|------|----------|
| Codex | 代码生成 | 代码质量高、理解能力强 | 新功能开发、复杂逻辑实现 |
| Trae | 代码补全 | 响应快、上下文理解好 | 代码补全、快速修复 |
| CodeBuddy | 代码审查 | 安全意识强、性能优化 | 代码审查、安全检查 |
| Cursor | 复杂重构 | 全局理解能力强 | 复杂重构、架构设计 |
| Claude | 设计文档 | 创造力强、文档质量高 | 设计文档、用户手册 |
| OpenCode | 通用开发 | 灵活性高、多语言支持 | 通用开发、快速原型 |

---

## 项目结构

> ⚠️ **本仓库是重新生成的开仓，结构与 alphα 模板默认布局不同。**
> 下面是**实际**结构；下文凡引用 `.alpha/`、`alpha-init`、`packages/`、`profiles/`、
> `docker/`、`monitoring/` 的段落都是模板遗留，在本仓库**不适用**（那些路径不存在）。

```
Oblivion/
├── .action/           # 本目录：Agent 工作流配置（不得被 gitignore）
│   ├── AGENTS.MD      # 本文件（强制规范）
│   ├── agent.json     # Agent 配置
│   ├── skill.md       # Skill 定义
│   ├── workflow.md    # 工作流程
│   ├── rules.md       # 业务规则
│   ├── GUIDE.MD       # 项目结构规范
│   └── ORDER.MD       # 任务执行顺序
├── .memory/           # 共用记忆库：规则与模板入库，逐日记录不入库
│   ├── daily/         # 每日工作日志（仅 TEMPLATE.md 入库）
│   ├── review/        # 审查日志（仅 TEMPLATE.md 入库）
│   ├── design/        # 设计文档（仅 TEMPLATE.md 入库）
│   ├── specs/         # 需求规格（仅 TEMPLATE.md 入库）
│   └── release/       # 三级版本分层（alpha / rc / patch）规则
├── .design/           # 设计书 ARCHITECTURE.MD（意图/决策/验收基线）
├── oblivion-brand/    # @oblivion/brand 插件（品牌槽位接管）
│   ├── VERSION        #   插件版本单一真源
│   ├── src/ lib/ scripts/
│   └── README.md
├── oblivion-vimc/     # @oblivion/vimc 插件（键盘导航：w/s/a/d · W/S · [ ] · / · f · i/Esc）
│   ├── VERSION        #   插件版本单一真源
│   ├── src/ lib/ scripts/ tests/
│   └── README.md
├── tools/             # 本机运维脚本
├── package.json       # pnpm workspace 根（packageManager: pnpm@11.7.0）
├── pnpm-workspace.yaml# packages: ['oblivion-*'] + allowBuilds（依赖安装脚本显式审批）
├── .npmrc             # auto-install-peers=false · hoist=false
├── pnpm-lock.yaml     # 工作区唯一 lockfile（入库）
├── CHANGELOG.md       # 对外的版本说明（唯一公开发布记录）
├── CONTRIBUTING.md    # 贡献指南 + 第三方复用登记
├── LICENSE  SECURITY.md
├── VERSION            # 产品版本单一真源
├── WORKSPACE.md       # DSH 插件工作区操作细节
└── README.md
```

> **禁止新建** `api/` `service/` `model/` `plugin/` `log/` `.test/` `.docs/`
> —— 这些是 alphα v1 的 MVC 分层与临时目录，v3.0.0 已废弃（见 `.action/GUIDE.MD`）。

---

## Agent 工作流程

### 1. 接收任务

```bash
# 检查今日日志
cat .memory/daily/$(date +%Y-%m-%d).md

# 检查待办任务
grep -n "\[ \]" .memory/daily/$(date +%Y-%m-%d).md
```

### 2. 理解任务

- 阅读任务描述
- 查看相关设计文档 (`docs/`)
- 查看相关需求规格 (`.memory/specs/`)
- 查看历史审查记录 (`.memory/review/`)

### 3. 执行任务

根据任务类型选择合适的 Skill：

| 任务类型 | 推荐 Agent | 辅助 Agent | 推荐 Skill |
|----------|------------|------------|------------|
| 新功能开发 | Codex/Cursor | Claude (设计文档) | yeahzero-thought-design |
| Bug 修复 | Trae/CodeBuddy | - | yeahzero-review-final |
| 代码重构 | Cursor/Codex | CodeBuddy (审查) | yeahzero-deliver-go |
| 文档编写 | Claude | - | yeahzero-note-consolidate |
| 代码审查 | CodeBuddy | - | code-review |
| 性能优化 | CodeBuddy | - | performance-optimizer |
| 安全检查 | CodeBuddy | - | security-audit |
| 经验总结 | - | - | yeahzero-extract-exp |

### 4. 记录过程

在 `.memory/daily/` 中记录工作内容：

```markdown
# 工作日志 - YYYY-MM-DD

## Agent: <agent-name>
## 任务: <task-description>

### 完成内容
- [x] 任务1
- [x] 任务2

### 遇到的问题
- 问题1: 描述
- 解决方案: 描述

### 使用的 Skill
- skill1: 用途说明

### 代码变更
- 文件1: 变更说明
- 文件2: 变更说明
```

### 5. 提交审查

在 `.memory/review/` 中创建审查记录：

```markdown
# Code Review - YYYY-MM-DD - PR#<number>

## Agent: <agent-name>
## 任务: <task-description>

### 变更摘要
- 变更1
- 变更2

### 审查要点
- 代码质量: ✓/✗
- 安全性: ✓/✗
- 性能: ✓/✗
- 可维护性: ✓/✗

### 审查意见
- 意见1
- 意见2

### 结论
- [ ] 通过
- [ ] 需要修改
- [ ] 拒绝
```

---

## 任务分配规范

### 1.1 任务类型匹配

| 任务类型 | 推荐 Agent | 辅助 Agent |
|----------|------------|------------|
| 新功能开发 | Codex/Cursor | Claude (设计文档) |
| Bug 修复 | Trae/CodeBuddy | - |
| 代码重构 | Cursor/Codex | CodeBuddy (审查) |
| 文档编写 | Claude | - |
| 代码审查 | CodeBuddy | - |
| 性能优化 | CodeBuddy | - |
| 安全检查 | CodeBuddy | - |

### 1.2 任务优先级

- **P0 (紧急)**: 立即处理
- **P1 (高)**: 24 小时内处理
- **P2 (中)**: 72 小时内处理
- **P3 (低)**: 一周内处理

---

## 代码协作规范

### 1. 分支管理

- 使用特性分支开发
- 分支命名: `feature/<功能名>`、`fix/<bug名>`、`refactor/<重构名>`
- 每个 PR 只做一件事
- PR 标题清晰描述变更

### 2. 提交规范

```
<type>(<scope>): <subject>

<body>

<footer>
```

类型:
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式
- `refactor`: 重构
- `test`: 测试
- `chore`: 构建/工具

示例:
```
feat(user): 添加用户注册功能

- 实现用户注册 API
- 添加邮箱验证
- 添加密码加密

Closes #123
```

### 3. 代码审查

- 每个 PR 必须有至少一个审查者
- 审查者应在 24 小时内完成审查
- 审查意见应具体、可操作
- 必须解决所有 "必须修改" 的意见

---

## 文档协作规范

### 1. 文档更新

- 代码变更必须更新相关文档
- API 变更必须更新 API 文档
- 新功能必须更新用户手册
- 重要变更必须更新变更日志

### 2. 文档审查

- 文档变更需要至少一个审查者
- 审查文档的准确性和完整性
- 确保文档易于理解

---

## 测试协作规范

### 1. 测试要求

- 新功能必须有单元测试
- Bug 修复必须有回归测试
- 重构必须保证测试通过
- 测试覆盖率必须达标

### 2. 测试审查

- 测试代码需要审查
- 确保测试独立性
- 确保测试可重复

---

## 沟通规范

### 1. 日常沟通

#### 消息格式

```
[类型] 标题

内容

@相关人员
```

类型:
- [问题]: 遇到问题需要帮助
- [讨论]: 需要讨论决策
- [通知]: 重要通知
- [完成]: 任务完成

#### 回复规范

- 及时回复消息
- 使用清晰的语言
- 提供必要的上下文
- 给出明确的结论

### 2. 问题处理

#### 问题报告

```
问题描述: <描述>
影响范围: <范围>
复现步骤: <步骤>
期望结果: <期望>
实际结果: <实际>
```

#### 问题解决

1. 分析问题原因
2. 提出解决方案
3. 评估影响范围
4. 实施修复
5. 验证修复结果

### 3. 决策记录

#### 决策模板

```
## 决策: <决策标题>

### 背景
<背景描述>

### 方案
- 方案1: <描述>
- 方案2: <描述>

### 决策
<最终决策>

### 理由
<决策理由>

### 影响
<影响范围>
```

---

## 知识管理规范

### 1. 经验记录

#### 经验模板

```
## 经验: <经验标题>

### 问题
<问题描述>

### 解决方案
<解决方案>

### 关键点
- <关键点1>
- <关键点2>

### 适用场景
<适用场景>

### 注意事项
<注意事项>
```

### 2. 知识库更新

- 定期整理经验
- 更新知识库
- 分享最佳实践

### 3. 文档管理

#### 文档分类

- **设计文档**: docs/
- **需求规格**: .memory/specs/
- **审查日志**: .memory/review/
- **工作日志**: .memory/daily/

#### 文档维护

- 定期审查文档
- 更新过期内容
- 删除无用文档

---

## 质量保证规范

### 1. 代码质量

#### 静态分析

- 使用 Lint 工具检查代码风格
- 使用类型检查工具
- 使用安全扫描工具

#### 代码审查

- 审查代码逻辑
- 审查安全性
- 审查性能
- 审查可维护性

### 2. 测试质量

#### 测试覆盖

- 单元测试覆盖率 > 80%
- 集成测试覆盖率 > 60%
- 端到端测试覆盖率 > 40%

#### 测试执行

- 所有测试必须通过
- 测试必须独立
- 测试必须可重复

### 3. 文档质量

#### 文档准确性

- 文档与代码一致
- 示例可运行
- 信息完整

#### 文档可读性

- 结构清晰
- 语言简洁
- 示例丰富

---

## Skill 使用指南

### 1. yeahzero-thought-design (思考设计)

**使用场景**: 新功能开发前的设计阶段

```bash
# 触发条件
- 需求分析
- 架构设计
- 技术选型

# 输出物
- 设计文档: docs/<功能名>.md
- 需求规格: .memory/specs/<功能名>.md
```

### 2. yeahzero-review-final (最终审查)

**使用场景**: 代码提交前的审查

```bash
# 触发条件
- 代码完成
- PR 提交
- 发布前检查

# 输出物
- 审查报告: .memory/review/YYYY-MM-DD-PR编号.md
```

### 3. yeahzero-deliver-go (交付流程)

**使用场景**: 版本发布和交付

```bash
# 触发条件
- 版本发布
- 功能交付
- 部署上线

# 输出物
- 交付清单
- 变更日志
- 发布说明
```

### 4. yeahzero-extract-exp (经验提取)

**使用场景**: 任务完成后总结经验

```bash
# 触发条件
- 任务完成
- Bug 修复后
- 项目里程碑

# 输出物
- 经验文档
- 最佳实践
- 问题解决方案
```

### 5. yeahzero-note-consolidate (笔记整合)

**使用场景**: 知识管理和文档整理

```bash
# 触发条件
- 文档更新
- 知识积累
- 会议记录

# 输出物
- 整合后的文档
- 知识库更新
```

### 6. project-init (项目初始化)

**使用场景**: 快速初始化项目结构

```bash
# 触发条件
- 创建新项目
- 重构项目结构

# 输出物
- 目录结构
- 配置文件
- Git 初始化
```

### 7. doc-generator (文档生成)

**使用场景**: 自动生成项目文档

```bash
# 触发条件
- 代码完成后
- 发布前

# 输出物
- API 文档
- 用户手册
- 变更日志
```

### 8. test-generator (测试生成)

**使用场景**: 自动生成测试用例

```bash
# 触发条件
- 新功能开发后
- 代码重构后

# 输出物
- 单元测试
- 集成测试
- 端到端测试
```

### 9. code-review (代码审查)

**使用场景**: 通用代码审查

```bash
# 触发条件
- 代码提交前
- PR 审查

# 输出物
- 审查报告
- 问题清单
- 改进建议
```

### 10. deploy-automation (部署自动化)

**使用场景**: 自动化部署流程

```bash
# 触发条件
- 版本发布
- 环境部署

# 输出物
- Docker 配置
- CI/CD 配置
- 部署脚本
```

### 11. performance-optimizer (性能优化)

**使用场景**: 性能分析和优化

```bash
# 触发条件
- 应用响应慢
- 内存使用高

# 输出物
- 性能报告
- 优化建议
- 优化方案
```

### 12. security-audit (安全审计)

**使用场景**: 安全漏洞扫描

```bash
# 触发条件
- 代码提交前
- 发布前

# 输出物
- 安全报告
- 漏洞清单
- 修复建议
```

### 13. yeahzero-skill-creator (Skill 创建)

**使用场景**: 创建新的 AI Skill

```bash
# 触发条件
- 需要新技能时

# 输出物
- 新的 Skill 定义
```

### 14. yeahzero-harmony-arkts (HarmonyOS ArkTS)

**使用场景**: HarmonyOS 应用开发

```bash
# 触发条件
- HarmonyOS 项目开发

# 输出物
- ArkTS 代码
- HarmonyOS 应用
```

### 15. actionroad-arkts-patterns (ArkTS 模式)

**使用场景**: ArkTS 编程模式

```bash
# 触发条件
- HarmonyOS 项目开发

# 输出物
- ArkTS 代码
- 设计模式
```

### 16. YEAHZERO-KaoGong (考公知识)

**使用场景**: 公务员考试准备

```bash
# 触发条件
- 考公学习

# 输出物
- 考试资料
- 学习笔记
```

---

## 记忆库使用规范

### 1. 每日工作日志

**文件位置**: `.memory/daily/YYYY-MM-DD.md`

**内容要求**:
- 记录每个 Agent 的工作内容
- 记录遇到的问题和解决方案
- 记录使用的 Skill 和工具
- 记录代码变更

### 2. 审查日志

**文件位置**: `.memory/review/YYYY-MM-DD-PR编号.md`

**内容要求**:
- 变更摘要
- 审查要点
- 审查意见
- 结论

### 3. 设计文档

**文件位置**: `docs/<功能名>.md`

**内容要求**:
- 背景与目标
- 技术方案
- 实现细节
- 测试策略
- 部署计划

### 4. 需求规格

**文件位置**: `.memory/specs/<功能名>.md`

**内容要求**:
- 功能概述
- 用户故事
- 功能需求
- 非功能需求
- 验收标准

---

## 常见问题

### Q: 如何确定使用哪个 Agent?

A: 根据任务类型选择:
- 代码生成 → Codex/Cursor
- 代码补全 → Trae
- 代码审查 → CodeBuddy
- 设计文档 → Claude
- 通用开发 → OpenCode

### Q: 如何确定使用哪个 Skill?

A: 根据任务类型选择:
- 新功能开发 → yeahzero-thought-design
- Bug 修复 → yeahzero-review-final
- 代码重构 → yeahzero-deliver-go
- 文档编写 → yeahzero-note-consolidate
- 经验总结 → yeahzero-extract-exp

### Q: 如何处理 Agent 之间的冲突?

A:
1. 查看 `.memory/daily/` 中的历史记录
2. 协商解决方案
3. 必要时请求人工介入

### Q: 如何保证代码质量?

A:
1. 使用 `code-review` 进行审查
2. 遵循代码规范
3. 编写完整的测试
4. 通过所有 CI 检查

### Q: 如何记录工作过程?

A:
1. 在 `.memory/daily/` 中创建今日日志
2. 实时更新工作进度
3. 记录遇到的问题和解决方案
4. 提交审查时更新审查日志

---

## 模板集成触发规则

### 触发条件

当以下事件发生时，**必须运行 `alpha-init`** 完成模板集成：

| 事件 | 触发时机 | 必须执行 |
|------|----------|----------|
| 设计书定稿 | 设计书状态从 Draft 转为 Baseline | ✅ |
| 新项目初始化 | 创建新项目时 | ✅ |
| 模板升级 | alphα 模板版本更新后 | ✅ |
| 项目重构 | 项目结构调整后 | ✅ |

### 执行命令

```powershell
# 基本用法（脚本位于模板根目录；新项目可只复制本脚本+设计书两个文件，自动引导核心目录）
.\.alpha\tools\alpha-init.ps1 -TargetPath "目标项目路径"

# 指定项目名称
.\.alpha\tools\alpha-init.ps1 -TargetPath "C:\Projects\MyProject" -ProjectName "MyProject"

# 指定版权人（渲染 LICENSE；缺省会留"请补全版权人"待办）
.\.alpha\tools\alpha-init.ps1 -TargetPath "C:\Projects\MyProject" -CopyrightHolder "Your Name"

# 指定设计书路径（自动提取项目信息并移入 .design/ARCHITECTURE.MD）
.\.alpha\tools\alpha-init.ps1 -TargetPath "C:\Projects\MyProject" -DesignDocPath "设计书.md"

# 预览模式（只打印，不动文件）
.\.alpha\tools\alpha-init.ps1 -TargetPath "C:\Projects\MyProject" -DryRun

# 强制覆盖
.\.alpha\tools\alpha-init.ps1 -TargetPath "C:\Projects\MyProject" -Force

# 模板源不在默认位置时
.\.alpha\tools\alpha-init.ps1 -TargetPath "C:\Projects\MyProject" -TemplateRoot "D:\Templates\alphα"
```

### 执行流程

1. **模板引导** - 目标缺核心时从模板源复制 .alpha/.action/.memory/.skills/.github/README.template.md
2. **探测技术栈** - 识别 node/python/go/java/php
3. **合并配置文件** - alpha.* → 点文件（含 LICENSE/CONTRIBUTING/SECURITY/.gitattributes）
4. **渲染 README** - 从模板生成项目 README.md
5. **适配目录结构** - 按 manifest 创建目录
6. **移动设计书** - 自动移入 docs/
7. **软删除不适用文件** - 移入 .build/alpha-removed-*/
8. **落日志 + 待完善清单** - 写入 .memory/daily/ + .changelog/，输出待办

### 设计文档双件套（docs/ 规范）

| 文件 | 角色 | 产出方式 |
|---|---|---|
| `<项目名>-Architecture.md` | **架构设计书**：意图/决策（REQ/DEC/AC）、边界、验收基线（thought-design 流程产物） | 立书→评审→Baseline |
| `<项目名>-Design.md` | **UI 设计**：界面/交互/主题令牌，由架构书派生、不新增意图 | 模板 `docs/templates/design-template.md` |

实现 UI 时**两书同为规范依据**；冲突以架构书为准并回改 Design 书。alpha-init 的待完善清单会自动检查两者是否存在。

### 版本管理规范（VERSION 单一真源）

| 位置 | 角色 |
|---|---|
| 根目录 `VERSION` | **唯一真源**，单行 `x.y.z`；新项目由 alpha-init 初始化为 `0.0.1` |
| `package.json` 等栈清单 | **同步镜像**，由 `scripts/bump-version.ps1` 一并写回，**禁止单独手改**；运行时代码读镜像没问题（如 Token-Session 的 `src/version.js` 读 package.json，脚本保证两者恒一致） |
| git tag `vX.Y.Z` | 发布定版，仅发版时打（`bump-version.ps1 -Tag`） |
| `.changelog/` | 每次 bump 同步补一行版本记录 |

递增规则（**2026-10-05 所有者裁定，取代原「提交类型 → 级别」映射**）：

| 规则 | 内容 |
| --- | --- |
| 起点 | 任何新版本线一律从 **`0.0.1`** 起步（不再从 `0.1.0` 起） |
| 已有版本 | **不回改**（历史版本号保持原样，不追溯重编号） |
| 每次递增 | **先加第三位**（patch）：`0.2.0 → 0.2.1 → 0.2.2 …` |
| 何时动第二位/第一位 | **仅在所有者明确要求时**（`--minor` / `--major`），不得由提交类型自动推断 |
| 真源 | 有 `VERSION` 用 `VERSION`；没有但有 `package.json.version` 则以其为源并补建 `VERSION` 镜像 |
| 触发点 | 每批改动完成验收并写入 changelog 后，执行改动的 agent 必须运行递增脚本（本仓库根缺 `scripts/bump-version.ps1`，插件各自带 `scripts/bump-version.mjs`） |

### 包管理器规范（pnpm workspace，强制）

| 规则 | 内容 |
| --- | --- |
| 只用 pnpm | 依赖安装/脚本执行一律走 **DSH 分发的受控 pnpm**（`%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs`，11.7.0）；`package.json` 声明 `packageManager: pnpm@11.7.0` |
| 依赖只存一份 | 在**仓库根**执行 `pnpm install`；插件目录里的 `node_modules` 应为符号链接（实测每个约 0.02 MB），**禁止**在插件目录里跑 `npm install`（会重新长出每目录一份实体依赖） |
| 框架包铁律 | `@deepseek-ai/*` **只放 `peerDependencies`**，绝不放 `dependencies`；配套 `.npmrc` 的 `auto-install-peers=false`（否则运行时出现两个模块实例、symbol 身份分裂，工具调用直接崩） |
| 安装脚本审批 | 依赖的 install/postinstall 默认**不执行**；需要时在 `pnpm-workspace.yaml` 的 `allowBuilds` 里逐包显式放行（当前仅 `esbuild`） |
| 未声明依赖 | `hoist=false`：插件必须显式声明依赖，不允许"碰巧 require 到" |
| lockfile | 工作区唯一 `pnpm-lock.yaml` **入库**；不再产生 `package-lock.json` |
| 入口脚本 | 根 `package.json` 的 `check`/`build`/`test`/`typecheck`/`check:version` 全部转 `tools/check-workspace.ps1`（**运行时解析** DSH 运行时位置；因为本机 `pnpm` 不在 PATH，脚本里不能嵌套 `pnpm run xxx`）。脚本保持 **Windows PowerShell 5.1 兼容**，并且**必须带 UTF-8 BOM**（5.1 会按 ANSI 读无 BOM 脚本，中文会乱码导致解析失败） |
| 命令 | 根：`pnpm run check`（typecheck+test+build）；单插件：`pnpm -C <plugin> run test` |

> 依据：DSH 以 pnpm 作为 **Profile 隔离机制的实现工具**（树外插件、双锚点解析、peer 共享实例）。
> 本仓库在**开发期**沿用同一模型，以便「本地怎么装，Profile 里就怎么解析」。

### 验证清单

集成完成后，确认：

- [ ] README.md 已生成（占位符已替换）
- [ ] LICENSE 已生成且版权人已填（无"请补全版权人"字样）
- [ ] CONTRIBUTING.md（含《第三方复用登记》）/ SECURITY.md 已生成且【占位】已补全（发布前）
- [ ] 配置文件已合并（含 .gitattributes）
- [ ] 目录结构已创建
- [ ] `docs/<项目名>-Architecture.md` 与 `-Design.md` 双件套就位（Design 可后置，但清单会提醒）
- [ ] 待完善清单已逐条处置（见 .memory/daily/ 当日 alpha-init 日志）
- [ ] git 仓库已初始化并完成首次提交
- [ ] 不适用文件已移入 .build/
- [ ] 测试已通过
- [ ] 项目可正常运行

## 第三方复用合规规则（强制执行）

1. **唯一登记载体**：`CONTRIBUTING.md` 的《第三方复用登记》节（原独立文件 THIRD_PARTY_NOTICES.md 已并入）；任何复用第三方开源代码/数据/文本，**先登记后使用**：来源仓库、许可证、上游 commit、被用文件、使用方式。
2. **许可证分级**：MIT/Apache/BSD/ISC 可复制修改再发布（须附版权行+许可原文）；GPL/AGPL/MPL 等 copyleft 须先请示项目所有者并评估传染；**无 LICENSE 仓库禁止复制任何代码**（仅"理念启发"级吸收须备注）。
3. **商标边界**：不用上游名称/logo 作本项目标识。
4. **依赖引入**：新增运行时依赖前核对依赖许可证，登记为独立行。
5. **随上游更新复核**：发布前或被用模块出缺陷时，`git log <锁定commit>..HEAD -- <被用文件>` 检查上游变更；结果追加到登记表，不改写历史行。
6. **发布门禁**：打包/发布检查清单必须包含"登记表全部'已复用'行有对应许可声明原文"。

### 回滚说明

如需回滚，查看 `.build/alpha-removed-*/` 中的文件：

```powershell
# 查看删除清单
Get-ChildItem -Path ".build\alpha-removed-*" -Directory

# 恢复文件
Copy-Item -Path ".build\alpha-removed-<timestamp>\*" -Destination "." -Recurse -Force
```

---

## 版本信息

- **版本**: 2.0.0
- **更新**: 2026-09-08
- **状态**: 强制执行

**维护者**: abcxyzNone
**AI工具**: 各种 AI Agent
**致谢**: 感谢所有贡献者

---

**重要说明**: 此文件是项目的唯一权威规范，所有 Agent 都必须遵循此规范进行协作。如有疑问，请参考此文件。
