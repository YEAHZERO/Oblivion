# 接续 Oblivion 插件开发 · 轮 26

- 来源会话: `session-d3b01bcc-b753-4993-adc7-a56e328ac928`

## 问题

@zerorigin-studio/dsh-deepseek-chat 的设置面板读不到配置：它按「dsh-chat-entry」读取，而这个环境里没有这个名字的条目 id。它自己的条目是「chat-entry」，插件客户端应该改成读那个——这是插件自身的问题，市场无法代改。

## 回答

明白，这是插件自身的配置读取 bug。先看源码确认。

确认了。插件代码第 815 行用 `"dsh-chat-entry"`，但 cordis.patch.yml 注册的是 `"chat-entry"`。直接修。

确认：插件第 815 行 `"dsh-chat-entry"` 和 cordis.patch.yml 的 `"chat-entry"` 不一致——插件自身的 bug。

用户说市场无法代改，这是对的：直接改 node_modules 下次重装就被覆盖。应该报给作者。

让我检查当前状态，整理剩余事项。

## 当前状态

| 事项 | 状态 |
|---|---|
| v2.1 重启链路 + 三按钮 + 更新插件 | ✅ 2 commits 已提交 |
| 5 个插件更新 | ✅ 全部最新（cost-meter 1.9.31 / creator-mode 0.3.13 / web-login 1.0.3 / free-search 0.9.15 / market 1.70.1） |
| agnes contextWindow | ✅ 按你的设置 512000 |
| dshmarket hot.js 引号补丁 | ✅ 已修 |
| dsh-deepseek-chat settings bug | ⏳ 需报 issue |
| Veyra / dsh-context 安装 | ⏳ minimumReleaseAge 持有期 |
| agnes-api thinking 块 400 错误 | ⏳ DSH/pi-ai 上游问题 |

## 下一步建议

**dsh-deepseek-chat bug**：插件注册 `chat-entry`，但代码读 `dsh-chat-entry`。仓库 `github.com/zerorigin-studio/dsh-deepseek-chat`，可以报 issue 或直接改一行 node_modules（重装会覆盖）。要我现在：
1. 直接改 node_modules 一行（临时生效，下次重装重置）？
2. 还是等作者发版？

**Veyra / dsh-context**：这两个包不在 dependencies 里，market 日志显示 minimumReleaseAge 持有期。解法：手动加依赖 + 用修过的 apply 路由跑，或者等窗口过去（通常 24h）。

已修。重启生效。

- 涉及工具: `ask_user_question`, `edit`, `pwsh`, `read`

---