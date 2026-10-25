# dsh-weknora 是 WeKnora · 轮 13

- 来源会话: `session-3fc0a659-0b43-4f19-8e5d-463bd5915e0f`

## 问题

查看该插件是否如此，然后git push：可以，这正是 DSH 官方设计的“从实验到固化”的标准路径。创造模式里的插件是“探测用”的，一旦验证满意，就可以把它从内存“搬”到磁盘上，变成一个永久安装的 bundle。

### 📦 固化路径：从“会话级”到“永久安装”

核心逻辑就两步：**先按 bundle 格式打包，再用 `dsh plugin add` 装进 profile**。

**第一步：创建你的 bundle 目录**

在你想要的固定目录（比如 `C:\Projects\Oblivion\`）下，按 bundle 规范建立结构：

```
oblivion-qa-loop/
├── package.json       # 声明 dsh.bundle
├── cordis.patch.yml   # 声明如何挂载插件
└── index.js           # 插件入口（你的 apply 函数）
```

**第二步：填写 `package.json`（声明为 bundle）**

关键是在 `dsh` 键下声明 `bundle`，告诉 DSH 这是一个可安装的组合包：

```json
{
  "name": "@oblivion/qa-loop",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

**第三步：编写 `cordis.patch.yml`（声明挂载点）**

这个文件告诉 DSH 如何把这个插件挂进运行时。注意 `name` 这里填的是**你的包名**：

```yaml
- insert:
    - id: oblivion-qa-loop
      name: '@oblivion/qa-loop'  # 按包名引用，Node 才能解析到
```

**第四步：用 `dsh plugin add` 安装进 profile**

在包含你 `oblivion-qa-loop` 目录的文件夹下，执行：

```bash
dsh plugin --profile web add ./oblivion-qa-loop
```

`dsh plugin` 会把命令转发给 profile 目录下的 pnpm。pnpm 会把你的本地目录链接进去，同时因为你的包声明了 `dsh.bundle`，DSH 会把它追加到 profile 的 `dsh.profile.bundles` 列表里。

**第五步：验证**

启动前先确认它已被正确识别：

```bash
dsh --profile web --dump-config
```

你应该能在输出的组合树里看到 `oblivion-qa-loop` 这一行。然后正常启动 `dsh --profile web`，它就会像官方插件一样，每次启动都自动加载。

### 💡 一个值得留意的“捷径”

社区有一个叫 **`dsh-creator-mode-plus`** 的工具，专门简化了“在创造模式里写插件 → 固化到磁盘”这个流程。它提供了 `dshx_scaffold`（搭骨架）和 `dshx_activate_new_client`（安装并验证）等工具，可以让你在会话里更顺滑地完成“转正”。如果你觉得手动操作繁琐，可以把它作为参考，看看它内部是如何调用 `dsh plugin add` 和文件操作的。

### ⚠️ 关于“放在固定目录”的提醒

你现在的思路是“放在固定目录，再安装”。这完全可行，pnpm 的 `link:` 协议会指向你指定的绝对路径。

但要注意：**你固定目录里的源码，和 DSH 运行时实际加载的代码，是通过“符号链接”关联的，而不是“拷贝”**。这意味着你后续修改固定目录里的源码，重启 DSH 就会生效，不需要重新安装。这对你的插件开发是好事，但也意味着这个目录**不能随便移动或删除**，否则链接会断掉。

## 回答

先按这份说明逐条核对我的插件，再推送。

插件结构**完全符合**那份说明的 bundle 规范。但 GitHub 仍连不上（`Connection was reset`）。先查清是不是有本地代理可用。

连通性恢复了（`github.com:443` → True）。插件侧全部核对通过。尝试推送 —— 用 HTTP/1.1，`Connection was reset` 常见于 HTTP/2 被干扰。

HTTP/1.1 也没用 —— TCP 通但 TLS 交换被重置。试另一条路：SSH over 443。

SSH 密钥在（`id_ed25519`），而且已有 `~/.ssh/config`。看配置里有没有 github，并测 SSH 通道。

**关键发现**：SSH 通道是**通的**（22 和 443 都完成了握手，返回 `Permission denied (publickey)` 说明连接建立成功，只是密钥没在 GitHub 上登记）；而 HTTPS 是超时 + 重置。所以出路在 SSH。

核对完成 —— 插件**完全符合**那份说明的 bundle 规范，但有 **4 处说明与实测不符**，其中两处会让人踩坑。推送则卡在网络。

## 一、插件核对：逐条通过

| 说明里的要求 | 实测 | 结果 |
|---|---|---|
| `package.json` 声明 `dsh.bundle` | `dsh.bundle.patch: ./cordis.patch.yml` | ✅ |
| `cordis.patch.yml` 按**包名**引用 | `- insert: [{id: oblivion-brand, name: '@oblivion/brand'}]` | ✅ |
| 插件入口 | `main: ./lib/index.js`（存在） | ✅ |
| 装进 profile 的 dependencies | `link:C:/Projects/Oblivion/oblivion-brand` | ✅ |
| 追加到 `dsh.profile.bundles` | 已含 `@oblivion/brand` | ✅ |
| **链接而非拷贝** | `LinkType = Junction` → `C:\Projects\Oblivion\oblivion-brand` | ✅ |
| 改源码重启即生效、无需重装 | 源文件与经链接文件的 SHA256 **逐位相同** | ✅ |
| `dshx_scaffold` / `dshx_activate_new_client` 存在 | 都在我的工具表里 | ✅ |

## 二、说明里需要纠正的地方

**① 「从内存『搬』到磁盘」—— 描述不准确**

实测 `scaffoldCreatorPlugin`（[init.ts:322](C:/Projects/deepseek-harness/tools/dshx/src/commands/init.ts)）**一开始就写磁盘**：

```js
dir      = resolve(workspace, name)      // C:\Projects\Oblivion\<名>
symlinkSync(dir, linkPath, 'dir')        // harness\my-plugins\<名> → 指回来
```

**没有「内存 → 磁盘」这一步。** Creator Mode+ 的插件从第一秒就是磁盘上的真源码，harness 侧只放一个链接。所谓「固化」真正发生的只是**把 profile 的依赖与 bundles 列表写上**，源码位置自始至终没变过。

**② 漏了「重新构建」—— 这条会直接踩坑**

「修改固定目录里的源码，重启 DSH 就会生效」只对**未编译的 JS**成立。我的插件源码是 TS/TSX，改 `src/` 后**必须 `npm run build`** 重新产出 `lib/`，否则重启加载的还是旧产物。客户端半边还额外需要刷新页面。

**③ `dsh plugin add ./dir` 在桌面端不适用**

- 桌面 profile 由 Electron 独占，普通 CLI 直接拒绝：
  `error: profile "desktop" is managed exclusively by the Electron application`
- 必须用**桌面自带**的 CLI（它以 `manageDesktopProfile: true` 调 `runCli`），且路径要用**正斜杠** —— `TARGET_RE = /^[A-Za-z0-9@:./_#+~^=-]+$/` **不含反斜杠**，写 `link:C:\...` 会被拒。

**④ `dsh --profile web --dump-config` 这条验证对桌面端无效**

桌面 profile 的 `--dump-config` 同样被拒。桌面端只能靠重启后的实际表现来验证。另外 `files` 字段在 `link:` 安装下不起作用（那只对 `npm publish` 生效）。

## 三、git push：卡在网络，需要你一步

诊断结果很明确 —— **两条通道状态相反**：

| 通道 | 状态 |
|---|---|
| HTTPS（`origin`） | ❌ 超时 / `Connection was reset`。`github.com:443` TCP 能通，但 TLS 交换被重置 |
| **SSH** | ✅ **通的**。22 与 443 都完成了握手，返回 `Permission denied (publickey)` —— 连接建立成功，只是密钥没在 GitHub 登记 |

我试了 4 次推送、换过 HTTP/1.1、加过 `postBuffer`，都在 HTTPS 这层失败。**6 个提交待推**。

已经把备用 remote 加好了（`origin` 保持不动，不影响任何现有操作）：

```
ssh  git@github.com:YEAHZERO/Oblivion.git
```

**你需要做的**：把下面这个公钥加到 https://github.com/settings/keys （Add new SSH key → Authentication key）：

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH2D/f5JZYY01wmO50rzdw/sw7rK17nnkCK0FSG6NSSp liveu@Hilbert
```

加完告诉我，我执行 `git push ssh main`（一条命令，且不动 `origin`）。

或者你不想动 SSH 的话 —— HTTPS 是**间歇性**的（最早那次推送就成功了），我可以隔一会儿自动重试 `origin`，网络窗口一到就推上去。你选哪种都行。

---

顺带说一句：这次核对没有改动任何插件代码，产物的 profile 侧状态与上一轮一致（`e402d1d` 的构建仍在位），**重启 App 就能看到居中效果**。

- 涉及工具: `pwsh`, `read`

---