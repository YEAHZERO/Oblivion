# AI Agent 技能定义

## 概述

本文件定义了 alphα 项目中所有 AI Agent 可用的技能。每个技能都有特定的用途和使用场景。

## 技能列表

### 工具类技能

#### 1. project-init (项目初始化)
- **用途**: 快速初始化项目结构
- **使用场景**: 创建新项目、重构项目结构
- **输出**: 目录结构、配置文件、Git 初始化
- **优先级**: 高

#### 2. doc-generator (文档生成)
- **用途**: 自动生成项目文档
- **使用场景**: 代码完成后、发布前
- **输出**: API 文档、用户手册、变更日志
- **优先级**: 高

#### 3. test-generator (测试生成)
- **用途**: 自动生成测试用例
- **使用场景**: 新功能开发后、代码重构后
- **输出**: 单元测试、集成测试、端到端测试
- **优先级**: 高

#### 4. code-review (代码审查)
- **用途**: 通用代码审查
- **使用场景**: 代码提交前、PR 审查
- **输出**: 审查报告、问题清单、改进建议
- **优先级**: 高

#### 5. deploy-automation (部署自动化)
- **用途**: 自动化部署流程
- **使用场景**: 版本发布、环境部署
- **输出**: Docker 配置、CI/CD 配置、部署脚本
- **优先级**: 中

#### 6. performance-optimizer (性能优化)
- **用途**: 性能分析和优化
- **使用场景**: 应用响应慢、内存使用高
- **输出**: 性能报告、优化建议、优化方案
- **优先级**: 中

#### 7. security-audit (安全审计)
- **用途**: 安全漏洞扫描
- **使用场景**: 代码提交前、发布前
- **输出**: 安全报告、漏洞清单、修复建议
- **优先级**: 中

### 设计类技能

#### 8. yeahzero-thought-design (思考设计)
- **用途**: 产品设计、架构设计
- **使用场景**: 新功能开发前
- **输出**: 设计文档、需求规格
- **优先级**: 高

### 审查类技能

#### 9. yeahzero-review-final (最终审查)
- **用途**: 代码审查、质量把关
- **使用场景**: 代码完成、发布前
- **输出**: 审查报告、改进建议
- **优先级**: 高

### 交付类技能

#### 10. yeahzero-deliver-go (交付流程)
- **用途**: 项目交付、版本发布
- **使用场景**: 版本发布、功能交付
- **输出**: 交付清单、变更日志
- **优先级**: 高

### 知识类技能

#### 11. yeahzero-extract-exp (经验提取)
- **用途**: 从完成的任务中提取可复用经验
- **使用场景**: 任务完成、Bug 修复后
- **输出**: 经验文档、最佳实践
- **优先级**: 中

#### 12. yeahzero-note-consolidate (笔记整合)
- **用途**: 知识管理、文档整理
- **使用场景**: 文档更新、知识积累
- **输出**: 整合后的文档、知识库更新
- **优先级**: 中

### 工具类技能

#### 13. yeahzero-skill-creator (Skill 创建)
- **用途**: 创建新的 AI Skill
- **使用场景**: 需要新技能时
- **输出**: 新的 Skill 定义
- **优先级**: 低

### 专项技能

#### 14. yeahzero-harmony-arkts (HarmonyOS ArkTS)
- **用途**: HarmonyOS 应用开发
- **使用场景**: HarmonyOS 项目开发
- **输出**: ArkTS 代码、HarmonyOS 应用
- **优先级**: 低

#### 15. actionroad-arkts-patterns (ArkTS 模式)
- **用途**: ArkTS 编程模式
- **使用场景**: HarmonyOS 项目开发
- **输出**: ArkTS 代码、设计模式
- **优先级**: 低

#### 16. YEAHZERO-KaoGong (考公知识)
- **用途**: 公务员考试准备
- **使用场景**: 考公学习
- **输出**: 考试资料、学习笔记
- **优先级**: 低

---

## 技能使用流程

### 1. 接收任务
- 分析任务类型
- 确定需要使用的技能

### 2. 选择技能
根据任务类型选择合适的技能：

| 任务类型 | 推荐技能 |
|----------|----------|
| 新功能开发 | yeahzero-thought-design → project-init → test-generator |
| Bug 修复 | code-review → test-generator |
| 代码重构 | code-review → performance-optimizer |
| 文档编写 | doc-generator → yeahzero-note-consolidate |
| 安全检查 | security-audit → code-review |
| 性能优化 | performance-optimizer → code-review |
| 版本发布 | deploy-automation → yeahzero-deliver-go |

### 3. 执行技能
- 按照技能定义执行
- 记录执行过程
- 生成输出物

### 4. 记录结果
- 在 .memory/daily/ 记录工作内容
- 在 .memory/review/ 记录审查结果
- 在 .memory/design/ 记录设计文档

---

## 技能配置

### 技能目录结构
```
.skills/
├── <skill-name>/
│   ├── SKILL.md          # 技能定义
│   ├── agents/
│   │   └── openai.yaml   # Agent 配置
│   ├── references/       # 参考资料
│   ├── templates/        # 模板文件
│   └── scripts/          # 辅助脚本
```

### 技能加载规则
1. 自动加载: .skills/ 目录下的所有技能
2. 优先级: 按 agent.json 中定义的顺序
3. 覆盖: 同名技能后加载的覆盖先加载的

### 技能调用方式
```bash
# 通过 Agent 调用
agent.execute("project-init", { project_name: "my-project" })

# 通过命令行调用
skill run project-init --project-name my-project
```

---

## 技能维护

### 添加新技能
1. 在 .skills/ 创建新目录
2. 创建 SKILL.md 定义技能
3. 创建 agents/openai.yaml 配置
4. 更新 agent.json 中的技能列表

### 更新技能
1. 修改 SKILL.md 内容
2. 更新版本号
3. 测试技能功能
4. 更新相关文档

### 删除技能
1. 确认技能不再需要
2. 从 agent.json 中移除
3. 删除 .skills/ 中的目录
4. 更新相关文档

---

## 版本信息

- **版本**: 1.0.0
- **更新**: 2026-09-08
- **状态**: 初始版本

**维护者**: abcxyzNone
**AI工具**: 各种 AI Agent
**致谢**: 感谢所有贡献者
