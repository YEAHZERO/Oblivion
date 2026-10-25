#  · 轮 1

- 来源会话: `session-db504efc-b898-403a-becb-e934c3faa6d2`

## 问题

C:\Programs\AITech\CodexCLI\npm-cache\_npx\fa1ce39dd2b186eb\node_modules\deepseek-pp-shell-host和C:\Programs\Tools\deepseek-plus-plus-1.0.2-edge。分析这两个文件夹，我想后面制作一个插件

## 回答

I'll analyze both folders to understand their structure and relationship.

Sandbox setup hit an ACL issue with the workspace. Let me load the diagnostic skill and try read-only paths in parallel.

The bash sandbox can't provision the workspace grant. Running the ACL diagnostic/repair command.

Permission repair verified. Now retrying the original confined operation.

Both are accessible. Let me read the core manifest and protocol files.

Now the core protocol contracts and the host entry.

Now the installer (how it registers the native host) and framing (the wire protocol).

Now the location/manifest resolution details, plus the extension's connection side.

The extension is a bundled WXT MV3 build. Let me locate its native-host bridge precisely.

m00075</pc>

The bundle is minified into huge single lines. Let me extract the native-host bridge region directly by character offset.

Found the bridge. Extracting the full native-messaging transport implementation.

The full protocol is now clear. Let me check the sibling `multimodal` native host and the cached packages.

Let me confirm the live registration state — that reveals the required extension ID for any plugin.

Now the remaining host providers — these are the extension points a plugin would extend.

I have the architecture. Let me delegate the remaining provider details while I examine the extension's plugin-facing surface.

The extension supports 5 transports — that's the real plugin story. Let me extract the `stdio_bridge` implementation.

`stdio_bridge` expects a local HTTP bridge, not a spawn. Let me confirm the bridge URL resolution.

Now the plugin author's actual UI surface — the MCP config form options.

Let me locate the transport choices offered in the MCP configuration UI.

两个文件夹已交叉分析完毕，结论和可落地方案写入了 [deepseek-pp-插件开发指南.md](deepseek-pp-插件开发指南.md)。

## 核心发现

**这两个文件夹是同一套体系的源码端和消费端**：A 是「原生消息宿主」（Native Messaging Host）的源码，B 是已构建的 DeepSeek++ 扩展，扩展通过 `chrome.runtime.connectNative()` 把 A 这类本地程序当作 MCP 服务器来用。

**最关键的一点：扩展是通用 MCP 客户端，不是为 shell host 写死的。** 传输层支持 `http` / `sse` / `streamable_http` / `stdio_bridge` / `native_messaging` 五种，所以做插件有三条路：

| 路线 | 需要改扩展吗 | 说明 |
|---|---|---|
| **① 独立 Native Host（推荐）** | 否 | 复用协议，注册成新的 host 名，独立升级 |
| ② 给 shell host 打补丁 | 否 | 往 `TOOL_DEFINITIONS` 加工具；但升级会被覆盖 |
| ③ 通用 MCP 服务器 | 否 | 扩展已支持，用户自己填 URL，零安装复杂度 |

## 插件作者必须知道的接口细节

- **信封**：`{protocol:'deepseek-pp-mcp-native', version:1, server:{…}, message:{jsonrpc:'2.0', id, method, params}}`，协议或版本不对直接 `-32600`。
- **帧格式**：4 字节小端 UInt32 长度 + UTF-8 JSON，**单条上限 1 MB**（硬墙）。
- **注册**：清单放 `%LOCALAPPDATA%\DeepSeek++\NativeMessagingHosts\<hostName>.json`，注册表 `HKCU\Software\Google\Chrome\NativeMessagingHosts\<hostName>`（HKCU 即可，不需要管理员）；`path` 必须指向 `.bat` 包装器，不能直接指 `.mjs`。
- **实测扩展 ID**（写进清单 `allowed_origins` 用）：Chrome `koealbifonogjljlppjngjnaejemdjhp`，Edge `kbiaaejpjnpfcjaohkamimhpkoeaajcp`。
- **三个默认关闭的开关**：新服务器 `enabled:false`、`execution.enabled:false`、`allowlist` 只含 4 个只读工具 —— 工具实现了却调不到，先查这里。
- **不加 `id` 的信封 = 通知，宿主不应回复。**

## 三个最容易翻车的点

1. **没有 node_modules**：官方宿主是把 `.mjs` 平铺拷进 `%LOCALAPPDATA%` 跑的，所以不能用 native 依赖（正因如此官方放弃了 PTY，改用哨兵字符串解析 stdout）。
2. **所有 `tools/call` 是串行的**（单 Promise 链），一个长命令会阻塞其他调用。
3. **Chrome 不显示 native host 的 stderr** —— 必须靠 `DPP_LOG_FILE` 写日志排查，否则出错只能看到「host 断开」。

指南里包含了可直接抄的最小宿主骨架（帧读写 + JSON-RPC 分发 + 工具 schema 写法）、11 条踩坑清单，以及从 shell-host 抄现成零件的对照表（`native/framing.mjs`、`native/router.mjs`、`native/os-adapter.mjs` 等）。

要不要我直接按路线①把骨架工程搭出来（含安装脚本和一键注册），你在扩展 MCP 页填上 host 名就能看到工具？

- 涉及工具: `acp_status`, `compress`, `glob`, `grep`, `list_agents`, `pwsh`, `read`, `search_context`, `skill`, `subagent`, `write`

---