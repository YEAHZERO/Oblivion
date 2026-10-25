# 接续 Oblivion 插件开发 · 轮 23

- 来源会话: `session-d3b01bcc-b753-4993-adc7-a56e328ac928`

## 问题

按我的设置来。我查的官网。> ## Documentation Index
> Fetch the complete documentation index at: https://wiki.agnes-ai.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Agnes 3.0 Flash

> Agnes AI 全新一代文本模型，强化 Agnes Code 任务执行、工具编排与可信交付能力。

> [!NOTE]
>
> Agnes 3.0 Flash 是 Agnes AI 推出的全新一代升级文本模型，面向 Agent 编程与工具驱动任务，重点提升复杂任务的端到端执行质量。

> **模型名称**
>
> `agnes-3.0-flash`

> **API Endpoints**
>
> Chat Completions：`POST /v1/chat/completions`
>
> Responses：`POST /v1/responses`
>
> Messages：`POST /v1/messages`

> **模型类型**
>
> 新一代文本模型，支持文本和图像 URL 输入。

> **核心方向**
>
> 聚焦稳定执行、可靠工具调用、长任务上下文保持与高质量交付。

> **定价**
>
> 输入缓存命中：`$0.005 / 百万 Token`；输入：`$0.05 / 百万 Token`；输出：`$0.15 / 百万 Token`。三项现价均为 `$0`。

## 概述

Agnes 3.0 Flash 面向真实的 Agent 任务和开发工作流而设计，覆盖从任务理解、规划、工具调用到最终交付的完整执行链路。模型重点改善复杂任务中的稳定性、指令遵循、事实依据和输出完整性，帮助开发者构建更可靠的智能体应用。

使用以下 API 信息接入模型：

| 项目 | 数值 |
| - | - |
| Base URL | `https://apihub.agnes-ai.com/v1` |
| Chat Completions | `POST /v1/chat/completions` |
| Responses API | `POST /v1/responses` |
| Messages API | `POST /v1/messages` |
| 模型名称 | `agnes-3.0-flash` |
| 输入模态 | 文本、图像 URL |
| 输出模态 | 文本 |
| 上下文窗口 | `512K` |
| 最大输出 | `65,536 Token` |

## 核心方向

> **Agnes Code 任务执行**
>
> 更适配 Agnes Code 与代码智能体工作流，强化从理解需求到完成交付的任务执行能力。

> **工具调用与编排**
>
> 增强函数调用、工具选择和多步骤工具编排能力，让智能体执行更稳定。

> **指令与上下文遵循**
>
> 在长任务和多轮执行中持续遵循目标、限制条件与运行上下文。

> **可信交付**
>
> 强化事实依据、结果确认和输出完整性，减少无依据结论与错误完成确认。

## 能力亮点

> **更可靠的端到端任务交付**
>
> 强化任务规划、执行和结果确认，在复杂 Agent 任务中更注重真实完成与最终交付质量。

> **更稳定的工具编排**
>
> 更准确地理解工具定义、选择合适的工具并组织多步骤调用，减少无效调用、重复调用和异常循环。

> **更强的指令与上下文遵循**
>
> 在长任务和多轮执行中持续关注原始目标、限制条件与运行上下文，降低任务偏离和关键要求遗漏。

> **更可信的执行结果**
>
> 重视工具结果与事实依据，减少缺乏依据的结论和未完成任务的错误确认，使执行状态更透明可信。

> **更完整、干净的输出**
>
> 改善重复内容、异常文本和不必要的内部推理暴露，让最终回复更连贯、清晰并适合直接交付。

## Chat Completions API

### Endpoint 与请求头

```text theme={null}
POST https://apihub.agnes-ai.com/v1/chat/completions
```

```bash theme={null}
-H "Authoriza

> （已截断，原长 15169 字符；问题全文见会话原始日志）

## 回答

明白，按你的配置来。把 cordis.patch.yml 恢复到你设置的值（512000 / 65536）。

已更新。触发重启生效。

- 涉及工具: `edit`, `pwsh`, `read`

---