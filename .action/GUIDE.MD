# 项目结构规范说明书

## 文件信息
- **版本**: 3.0.0
- **最后更新**: 2026-10-02
- **适用项目**: Oblivion 及基于 alphα 模板的项目
- **结构基准**: 能力分包（`packages/`），对齐 `@deepseek-ai/dsh` 的微包形态

> v3.0.0 变更：废弃 MVC 分层（`api/ service/ model/ plugin/`），改为 `packages/` 能力分包；
> `log/` → `logs/`；`.test/` → `tests/`；移除 Python 栈示例。

## 目录结构概览

> ⚠️ **本仓库是重新生成的开仓，结构与 alphα 模板默认布局不同。**
> 下面是**实际**结构。本节以下凡引用 `.alpha/`、`alpha-init`、`packages/`、`profiles/`、
> `.skills/`、`docker/`、`monitoring/`、`docs/` 的段落均为模板遗留，在本仓库**不适用**
> —— 那些路径不存在，且 `docs/` 已被本框架明令禁止新建。

```
Oblivion/
├── .action/                  # AI Agent 工作流配置（不得被 gitignore）
├── .memory/                  # 共用记忆库：规则与模板入库，逐日记录不入库
│   ├── daily/                # 每日工作日志（仅 TEMPLATE.md 入库）
│   ├── review/               # Code Review 日志（仅 TEMPLATE.md 入库）
│   ├── design/               # 设计文档（仅 TEMPLATE.md 入库）
│   ├── specs/                # 需求规格说明书（仅 TEMPLATE.md 入库）
│   └── release/              # 三级版本分层规则（alpha / rc / patch）
├── .design/                  # 设计书 ARCHITECTURE.MD（意图 / 决策 / 验收基线）
├── oblivion-brand/           # @oblivion/brand 插件（当前唯一已实现的能力）
│   ├── VERSION               #   插件版本单一真源
│   ├── src/ lib/ scripts/
│   └── README.md
├── tools/                    # 本机运维脚本
├── CHANGELOG.md              # 对外的版本说明（唯一公开发布记录）
├── CONTRIBUTING.md           # 贡献指南 + 第三方复用登记
├── LICENSE  SECURITY.md
├── VERSION                   # 产品版本单一真源
├── WORKSPACE.md              # DSH 插件工作区操作细节
├── README.md                 # 项目说明
└── .gitignore .gitattributes
```

## 目录详细规范

### .action/ - AI Agent 工作流配置
**用途**：存放 AI Agent 的工作流配置文件（manifest 中 `required: true`）

```
.action/
├── agent.json         # Agent 配置
├── AGENTS.MD          # 协作规范
├── GUIDE.MD           # 本文件
├── ORDER.MD           # 任务执行顺序
├── rules.md           # 业务规则
├── skill.md           # 技能定义
└── workflow.md        # 工作流程
```

**规范**：
- 定义 AI Agent 的行为规范
- 配置技能使用规则
- 定义工作流程
- **本目录不得被 `.gitignore` 忽略**（alphα v1 模板曾错误地忽略它，已在 v0.1.0 修正）

### .memory/ - AI Agent 共用记忆库
**用途**：所有 AI Agent 的共享记忆空间

```
.memory/
├── README.md          # 使用说明
├── daily/YYYY-MM-DD.md
├── review/YYYY-MM-DD-PR编号.md
├── design/<功能名>.md
└── specs/<功能名>.md
```

**规范**：
- 按日期记录工作过程
- 每个 PR 一个审查日志
- 设计文档与需求规格按功能组织

### .skills/ - AI 技能定义
**用途**：AI Agent 的技能库和知识库

**规范**：
- 每个 skill 一个目录，必须含 `SKILL.md`
- 可选 `agents/openai.yaml` 配置
- 参考资料和模板放各自 `references/` `templates/`

### packages/ - 能力分包 ★
**用途**：全部业务能力。**替代原 `api/` `service/` `model/` `plugin/` 四个分层目录。**

```
packages/
├── README.md              # 分包约定（必读）
├── oblivion-core/
│   ├── package.json       # main=lib/index.js  types=lib/types/index.d.ts
│   ├── src/index.ts       # TypeScript 源码（入库）
│   ├── lib/               # 构建输出（gitignore）
│   ├── README.md          # 用途与边界说明
│   └── tsconfig.json
└── oblivion-<capability>/
```

**规范**：
- **切分轴是「能力」不是「层」**：一个包 = 一个可独立替换的能力
- 边界由 `package.json` 的 `exports` + `peerDependencies` 声明，不靠目录约定
- 跨包依赖一律写 `peerDependencies`，不隐式携带
- 命名统一 `oblivion-` 前缀，目录名与 `name` 一致
- 每包自带 README；根 README 不重复包内细节

**为什么不是 MVC 分层**：`api/ service/ model/` 按层切分，同层互相可见，插件没有结构支撑；
`packages/` 按能力切分，可整包替换、独立版本，与 DSH 的 287 个微包同构。

### profiles/ - DSH 配置 patch ★
**用途**：DSH 的 5 层 YAML patch 中的**项目层**（最高优先级）

```
profiles/
├── README.md              # 五层机制说明
├── web/cordis.patch.yml
└── desktop/cordis.patch.yml
```

**规范**：
- patch 形状是**列表**，每项以 `id` 定位插件、`config` 覆盖字段
- 项目层只写**与仓库绑定**的配置；机器相关的绝对路径放用户层 `$DSH_HOME/profiles/<name>/cordis.patch.yml`（不入库）
- 改动后必须用 `dsh --patch <path> --profile <name> --dump-config` 验证合成结果

### config/ - 配置文件
**用途**：项目所有配置

```
config/
├── logging.yaml           # 日志配置
└── config.example.yaml    # 配置示例
```

**规范**：
- 敏感信息使用环境变量（`.env`，已 gitignore）
- 提供示例配置文件
- 不同环境分离配置

### data/ - 持久化数据
**用途**：应用产生的持久化数据。**不纳入版本控制**（`.gitignore` 已忽略 `/data/`）。

**规范**：
- 定期备份重要数据
- 大文件单独管理

### docs/ - 项目文档
**用途**：项目相关文档（已合并原 `.doc/` `.docs/` 两个目录）

```
docs/
├── Introduction.md
├── 安装部署指南.md
├── 项目使用说明文档.md
├── API使用及插件开发指南.md
├── 功能开发记录.md
├── 目录结构说明.md
├── guides/                # 原 .doc/guides/
└── templates/             # 原 .doc/templates/（api/changelog/design/user-manual 模板）
```

**规范**：
- 使用 Markdown 格式，图文并茂
- **全项目只保留 `docs/` 一个文档目录**（`.doc/` `.docs/` 已废弃）

### logs/ - 运行日志
**用途**：应用运行时日志。**不纳入版本控制**（`.gitignore` 已忽略 `/logs/`）。

**规范**：
- 自动清理策略、按日期轮转
- 目录名统一 `logs/`（原 `log/` 已更名，与 manifest `logs/` 模块一致）

### tests/ - 测试
**用途**：所有测试相关文件

```
tests/
├── unit/                  # 单元测试
├── integration/           # 集成测试
├── e2e/                   # 端到端测试
├── fixtures/              # 测试数据
└── performance/           # 性能测试
```

**规范**：
- 测试文件命名：`<模块名>.test.ts`
- 保持与 `packages/<name>/src/` 相同的目录结构
- 测试数据放在 `fixtures/`
- **原 `.test/` 目录已废弃**（临时产物），测试源码只在 `tests/`

### scripts/ - 脚本工具
**用途**：各种辅助脚本

```
scripts/
├── bump-version.ps1       # 版本写入（唯一版本源）
└── ...
```

**规范**：
- 按功能分类，提供使用说明，错误处理完善

### docker/ - Docker 配置
**用途**：Docker 容器化配置（**Node 栈，非 Python**）

```
docker/
├── Dockerfile
├── docker-compose.yml
└── .dockerignore
```

**规范**：
- 多阶段构建、最小化镜像、非 root 用户
- 若容器内运行 DSH Web：注意 `--host 0.0.0.0` 被 CLI 显式拒绝（RCE 边界），
  推荐 Linux 下用 `network_mode: host` 保持 127.0.0.1

### .build/ .cache/ .test/ .changelog/ - 临时目录
**用途**：构建产物、缓存、临时文件、变更日志

**规范**：
- 全部不纳入版本控制（`.gitignore` 已忽略）
- 可随时清理、可重新生成

## 使用说明

### 1. 初始化项目
```bash
git clone <repository-url>
cd Oblivion

# 查看项目结构
ls -la
```

### 2. 配置文件
```bash
cp .env.example .env
```

### 3. 开发流程
```
1. 在 .memory/daily/ 创建今日工作日志
2. 在 packages/<name>/src/ 实现能力
3. 在 tests/unit/ 编写测试
4. 在 docs/ 更新文档
5. 在 .memory/review/ 记录审查
```

### 4. 构建与测试
```powershell
# 类型检查
npm run typecheck

# 构建所有包
npm run build

# 单元测试
npm test

# 端到端
npm run test:e2e
```

### 5. DSH 配置验证
```powershell
npm run dsh:dump-config
# 等价于: dsh --profile web --dump-config
```

## AI 编程指南

### 当 AI 收到任务时，应该：

1. **理解项目结构**：根据本文件了解目录用途
2. **定位代码位置**：
   - 新能力 → `packages/<name>/`（不存在则按 `packages/README.md` 新建）
   - 新测试 → `tests/<unit|integration|e2e>/`
   - 新文档 → `docs/`
   - 新配置 → `profiles/`（DSH patch）或 `config/`（应用配置）
   - **不要**新建 `api/` `service/` `model/` `plugin/` —— 已废弃
3. **记录开发过程**：`.memory/daily/YYYY-MM-DD.md`
4. **编写测试**：所有新功能必须在 `tests/` 有对应测试
5. **更新文档**：更新 `docs/` 中的相关文档，记录变更和使用方法

### 示例工作流

**任务**: 添加用户登录能力

```bash
# 1. 创建工作日志
echo "# 工作日志 - $(date +%Y-%m-%d)" > .memory/daily/$(date +%Y-%m-%d).md

# 2. 新建能力包（或在既有包内加模块）
mkdir -p packages/oblivion-auth/src
# 按 packages/README.md 填 package.json / tsconfig.json / README.md

# 3. 添加测试
touch tests/unit/auth.test.ts

# 4. 更新文档
echo "## 登录功能说明" >> docs/API使用及插件开发指南.md
```

## 版本控制建议

### .gitignore 要点
```
# 依赖与构建
node_modules/
/lib/
/packages/*/lib/

# 运行期
/logs/
/data/
*.env
!.env.example

# 临时
.cache/ .build/ .test/
```

> 完整规则见根目录 `.gitignore`，其「转换记录」段落说明了相对 alphα 模板的每一处修正。

## 维护和更新

1. **定期审查**：每季度审查目录使用情况
2. **优化结构**：根据项目需求调整
3. **同步契约**：目录结构变更时**必须同步 `.alpha/manifest.json`**，否则 `alpha-init.ps1` 校验失效
4. **更新文档**：保持本文件与实际情况一致

特别 README.MD 文档每次修订按照如下模板：
**版本**: {version}
**更新**: {date}
**状态**: {status}

**维护者**: YEAHZERO
**AI工具**: {ai_tool}
**致谢**: {credits}

---

**版本历史**
- v3.0.0 (2026-10-02): 废弃 MVC 分层 → `packages/` 能力分包；`log/`→`logs/`；`.test/`→`tests/`；移除 Python 栈
- v2.0.0 (2026-09-08): 更新目录结构，添加 .memory、.skills 等
- v1.0.0 (2026-02-17): 初始版本

**说明**：本文件是项目的"说明书"，所有开发人员（包括AI）都应遵循此规范。
