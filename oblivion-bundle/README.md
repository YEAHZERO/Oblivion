# @oblivion/bundle

**Oblivion 插件组的安装入口。它不是插件，是「插件清单 + 预设配置」。**

| 项 | 说明 |
| --- | --- |
| 有没有 `apply(ctx)` | **没有** —— `lib/index.js` 就是 `export {};`（与官方 `@deepseek-ai/dsh-base` 一致） |
| 作用 | 声明「装哪几个插件、按什么顺序、用什么配置」（见 [`cordis.patch.yml`](cordis.patch.yml)） |
| 类比 | DSH 自身的 `@deepseek-ai/dsh-base` / `@deepseek-ai/dsh-web-app` |
| 用户收益 | **一条命令装齐**：`brand + vimc + core + panel`（未来的 `content-creator` 已留位） |
| 可覆盖 | 用户在自己的 profile 补丁层可覆盖 bundle 的行与 config（后写覆盖先写） |

## 装

```powershell
$dsh = 'C:\Programs\AITech\DeepSeekHarness\resources\runtime\cli\bin\dsh.cmd'
& $dsh plugin --profile desktop add 'link:C:/Projects/Oblivion/oblivion-bundle'
# 装完重启一次 DSH Desktop（Host 半边代码只在重启后重新导入）
```

装完 `%USERPROFILE%\.dsh\profiles\desktop\package.json` 的 `dsh.profile.bundles` 会带上 `@oblivion/bundle`，
四个插件由它（或它们自己的 patch）挂载。

## 一条必须说清的边界：**只插 core / panel**

| 插件 | 谁负责挂载 | 为什么 |
| --- | --- | --- |
| `@oblivion/core`、`@oblivion/panel` | **本 bundle 插行** | 它们**不自带** `dsh.bundle.patch`（原设计走用户层热挂） |
| `@oblivion/brand`、`@oblivion/vimc` | **它们自己的 `dsh.bundle.patch`** | 自带 patch 的包由安装器写进 `dsh.profile.bundles`；bundle 再插一次同名行 = **挂载两次**，实测会让整棵插件树启动失败（重复前缀路由） |

所以本包对 brand / vimc 只做**依赖声明** —— 一条命令照样把它们装齐，挂载交给它们自己。

> 换句话说：**bundle 管"装什么"，自带 patch 的包管"自己怎么被装"**，两者不重叠。

## 版本

`VERSION` 与 `package.json` 同步（只加第三位）：

```powershell
pnpm -C oblivion-bundle run version:bump     # 0.0.1 → 0.0.2
pnpm -C oblivion-bundle run check:version    # 一致性校验（根 check 会跑）
```

## 验收

| 项 | 结果 |
| --- | --- |
| `dsh plugin --profile desktop add 'link:…/oblivion-bundle'` | ⏳ 待执行 |
| `pnpm run verify:dsh`（根） | 契约断言 = `npmPackages`：四个成员包都在 profile 的 `node_modules` 里 |
