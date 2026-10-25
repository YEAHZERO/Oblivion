# dsh-weknora 是 WeKnora · 轮 8

- 来源会话: `session-3fc0a659-0b43-4f19-8e5d-463bd5915e0f`

## 问题

帮我开启Developer Mode 。

## 回答

开发者模式需要管理员权限写 HKLM（当前进程不是管理员），所以我用 UAC 提权来执行 —— **你会看到一个 Windows 的 UAC 确认框，请点「是」**。

提权写入成功（退出码 0）。验证是否真的生效 —— 别只看注册表，直接实测创建符号链接。

开发者模式已生效，而且**不需要重新登录或重启** —— 实测创建符号链接直接成功。再做一次「在 DSHX 真正需要的位置」的端到端探测。

链接建成功了，但我的清理写错了 —— `rmSync` 对指向目录的链接报 `ERR_FS_EISDIR`。用 `unlinkSync` 正确移除，并确认**目标目录没被删**。

开发者模式已开启并**实测生效**，而且不用重新登录 —— 我之前那条「必须重启才生效」的判断被实测推翻了，这里更正一下。

## 做了什么

| 步骤 | 结果 |
|---|---|
| 检查前置 | 当前进程非管理员，`AllowDevelopmentWithoutDevLicense` 键**不存在** |
| 提权执行 | `Start-Process reg.exe -Verb RunAs` 写 HKLM，UAC 已通过，**退出码 0** |
| 注册表复核 | `AllowDevelopmentWithoutDevLicense = 0x1` ✅ |
| `fs.symlinkSync(dir)` 实测 | **OK**（此前一直是 `EPERM`） |
| 在 DSHX 真实落点建链 | `C:\Projects\deepseek-harness\my-plugins\__probe-link` → 建成 **SymbolicLink**，可读、`package.json` 在内 ✅ |

写入的具体内容（供你核对/回退）：

```
HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock
    AllowDevelopmentWithoutDevLicense    REG_DWORD    0x1
```

**回退命令**（管理员 PowerShell）：
```powershell
Remove-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock" -Name AllowDevelopmentWithoutDevLicense
```

## 两点更正与说明

**① 不需要重新登录或重启。** 我上次说「开完必须重启 DSH App，因为符号链接权限在令牌创建时确定」—— 实测不成立：我在 DSH 宿主进程派生的子进程里建链直接成功，子进程继承宿主的令牌，因此**宿主自身也具备该能力**。这条我判断错了，更正。

**② 探测链接已清理干净。** 第一次清理我用错了 API（`rmSync` 对指向目录的符号链接报 `ERR_FS_EISDIR`），改用 `unlinkSync` 后已移除，并确认**目标目录 `oblivion-brand` 完好无损**（`package.json`、`lib/client.js` 都在），`my-plugins` 现在是空的。

## 这解锁了什么

`dshx_scaffold` 之前正是卡在 `init.ts:340` 的 `symlinkSync(dir, linkPath, 'dir')`。现在这条路径通了，配合已经就位的 DSHX v0.9.5 + harness checkout（HEAD `639ed01539`，与 DSHX pin 的 SHA 逐位相同），**Creator Mode+ 的脚手架链路应该完整可用**。

## 仍待你做的一步（与开发者模式无关）

`@oblivion/brand` 是上一轮装进 desktop profile 的，客户端 bundle 需要**重启 DSH App** 才会装配。重启后请确认：

1. 侧栏品牌行 = 北极星 + "Oblivion"
2. 左侧栏「插件」下方多出 **插件市场**
3. **设置 → Oblivion 品牌** 里改文字，侧栏应即时更新
4. 空白会话 Hero 区图形变成北极星

---

需要我现在就用 `dshx_scaffold` 建第一个插件验证整条 Creator Mode+ 链路吗？说个插件名和类型（`function` / `tool` / `client` / `object` / `class`）我就动手 —— 会按 DSHX 的约定把源码建在 `C:\Projects\Oblivion\<插件名>`、链接建在 harness 的 `my-plugins\` 下。

- 涉及工具: `pwsh`

---