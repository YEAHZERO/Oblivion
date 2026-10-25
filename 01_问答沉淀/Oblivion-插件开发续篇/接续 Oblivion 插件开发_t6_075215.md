# 接续 Oblivion 插件开发 · 轮 6

- 来源会话: `session-d3b01bcc-b753-4993-adc7-a56e328ac928`

## 问题

可以，按建议执行

## 回答

三个 bug 同时修：

现在修 `scanUpdates` 吞错问题。先看路由响应格式。

现在更新 Panel 端（PluginUpdates.tsx）处理新的 `errors` 字段，同时检查 selfcheck 断言是否需要更新。

现在更新 selfcheck 断言以匹配新的响应形状。

添加三条 selfcheck 断言：pnpm 标志、回滚路径、scanUpdates 形状。

两个问题：selfcheck 缺 `fs` import，applyUpdates 里 `scanUpdates` 返回值结构变了。

全部绿。更新文档中的自检数字并补充修复说明。

提交完成：`68f7af5`。

## 结论

三条 bug 均已修复并提交。当前状态：
- brand **24/24**（原 21/21 + 3 条新断言）
- panel **18/18**
- 工作树干净

## 下一步（等宿主 reload 后可立刻执行）

```powershell
cd C:\Projects\Oblivion
pnpm -C oblivion-brand run build    # 产出新 lib，宿主下次启动自动 load
pnpm -C oblivion-panel run build   # 同上
```
然后点面板「检查更新」→ 勾选 dsh-creator-mode-plus → 「更新所选」。这次 apply 会带正确的 kebab flag、失败会回滚、网络错误会如实上报。

## 未解的两项

| 插件 | 根因 | 解法 |
| --- | --- | --- |
| **@lovedolove/veyra** 0.1.54 | `minimumReleaseAge` 持有期；不在 dependencies 里，apply 路由看不到 | ① 手动加依赖 + 我修过的 apply 跑一次；② 等窗口过；③ 走 plain dsh web |
| **dsh-context** 0.73.0 | 同上 | 同 veyra |

要我直接跑一单 `GET /obl-brand/updates` 验证新响应形状（含 errors 字段），还是等你换 model 后再动？

- 涉及工具: `edit`, `pwsh`, `read`, `todo_write`

---