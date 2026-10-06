# DSH 升级兼容台账

> **这份文件回答一个问题**：DSH 升级后，我怎么知道**我自己的插件**还活着？
>
> 结论先说：**升级时坏掉的不是你的代码，而是你依赖的宿主契约** —— 而且多数契约失效是**静默**的。
> 槽位改名后品牌位什么都不渲染，界面不报错，你只会觉得「插件好像没生效」。
> 所以「知道」不能靠眼睛，得靠**可重复的取证**。

---

## 一、为什么单靠「跑一下看看」不够

DSH 升级可能动的东西，按「坏了会不会响」分两类：

| 类别 | 例子 | 坏了是否响 |
| --- | --- | --- |
| **嘶哑失败（危险）** | 槽位改名 / kind 从 `single` 变别的 / 客户端模块格式变更 / profile patch 语义变更 | ❌ **不响** —— 什么都不渲染，界面一切正常 |
| **响亮失败（安全）** | 服务名消失（加载时抛错）/ 插件无法解析（`1 entry did not activate`）/ 语法错 | ✅ 响 |

**危险的是第一类**：它不会给你错误，只会给你「安静地少了点什么」。

---

## 二、机制：三件套

### ① 契约声明（每个插件自己说清楚依赖什么）

写在插件 `package.json` 的 `dsh.compat` 里。**不靠人记，靠数据**：

```json
"dsh": {
  "compat": {
    "host": ">=0.2.0-rc.2 <0.3.0",
    "requires": {
      "services": ["slots"],
      "slots": ["sidebar.brand.mark", "sidebar.brand.name"],
      "slotKinds": { "sidebar.brand.mark": "single" },
      "clientPackages": ["@deepseek-ai/dsh-client-ui-settings"],
      "clientContract": ["__ModuleLoader__"]
    }
  }
}
```

### ② 校验脚本（升级后一条命令）

```powershell
pnpm run check                                  # 全量；**第一步**就是契约校验
pnpm run verify:dsh                             # 只跑契约校验（= tools/verify-dsh-compat.ps1）
pnpm run compat                                 # 同上，走工作区入口（-Task compat）
powershell -File tools/verify-dsh-compat.ps1 -Plugin oblivion-brand   # 单个插件
```

它做的事：读每个插件的 `dsh.compat`，逐条**对宿主源码取证**，打印 PASS/FAIL 矩阵，任一条不过就 `exit 1`。

**证据是一等公民** —— 每条 PASS 都给出 `文件:行`：

```
  PASS  slotKind   sidebar.brand.mark = single   packages\client\ui-sidebar\src\client\contract\slots.ts:25
  PASS  slotKind   main = keyed                  packages\client\ui-layout\src\client\index.ts:73
  PASS  clientPkg  @deepseek-ai/dsh-client-ui-settings   packages\client\ui-settings
```

**为什么能取证**：`~/.config/dshx/harness` 指向的 DSH checkout 与本机安装的是**同一版本**
（DSHX 用 `DESK_HARNESS_SHA` 钉住）。所以这套校验**升级前也能预演** —— 把 checkout 切到目标版本先跑一遍。

> ⚠️ **刻意不用裸槽位名匹配**。`'main'` 这种短名会命中使用方或无关条目，于是校验「通过得莫名其妙」——
> **那比不校验更坏**。所以槽位一律用**声明形式** `'<slot>': { kind: '<kind>'` 断言，它唯一且含 kind。
>
> 同理，脚本**自身做过反向验证**：kind 写错 / 槽位不存在 / host 范围不匹配，三种情况都确认会 FAIL 并 `exit 1`。
> 一个「永远通过」的校验器等于没有。

### ③ 本台账（人可读的记录）

每次校验后更新下面第五节。**记录的是「哪一版插件、对哪一版 DSH、什么时候、什么结果、证据在哪」。**

---

## 三、升级 SOP

**升级前（可选但推荐）**

1. 把 `~/.config/dshx/harness` 的 checkout 切到目标版本（`git checkout <tag>`）。
2. 跑 `pnpm run verify:dsh` —— 这是**预演**：能在真升级前就发现契约断裂。

**升级 DSH（桌面端或 CLI）**

**升级后（必做）**

1. `pnpm run verify:dsh` —— 契约仍在？（等价于 `pnpm run check` 会跑的第一项）
2. `pnpm run check` —— 插件自身仍能 typecheck / test / build？
3. **重启应用**，看有没有加载错误（`N entry did not activate`）。
4. 每个客户端插件**目视确认一次**：品牌位（`@oblivion/brand`）、键盘导航（`@oblivion/vimc`）。
5. 更新第五节台账；若 FAIL → 按证据改插件，然后 bump 版本。

> **第 4 步不能省**：静态契约过了不等于**渲染**过了。契约是必要条件，不是充分条件。

> **范围**：本机制**只管 Oblivion 自己的插件**。同一 profile 里的第三方插件
> （`dsh-creator-mode-plus` 等）不在校验范围内 —— 升级后**只按本脚本的结果判断**我们的插件是否还活着。

---

## 四、已知风险（与本台账相关）

| # | 风险 | 为什么危险 | 处置 |
| --- | --- | --- | --- |
| R1 | **`@oblivion/vimc` 曾挂在机器本地的 `cordis.patch.yml`**（不在 `dsh.profile.bundles`） | 换机器 / 重置 profile 就丢，且**不报错** —— 插件"装好了却完全不生效" | ✅ **vimc/brand 已修（2026-10-06）**：两者都加了 `cordis.patch.yml`（`dsh.bundle.patch`）+ 写进 `dsh.profile.bundles`，并**移除用户层的重复插入**（否则同 id 插两次）。现校验为 6/6 与 10/10。⚠️ **`@oblivion/core` 仍走用户层**（见第五节「挂载方式现状」，待裁定） |
| R2 | 两个插件原先**都没声明宿主版本范围** | 升级后无法自动发现不兼容 | ✅ **已修**：两者都加了 `dsh.compat.host` |
| R3 | 契约校验**只覆盖静态契约** | 覆盖不到「渲染结果不对」 | 靠 SOP 第 4 步的目视确认补上 |
| R4 | **漏跑校验** | 校验再准，不跑等于没有 | ✅ **已修**：`pnpm run check` 现在**第一步**就是契约校验（`-Task compat`） |
| R5 | 插件新增扩展点依赖时**忘了补 `dsh.compat`** | 该契约不在校验范围内，静默失效 | 加扩展点依赖 = 必须同批补 `dsh.compat`；本文件与脚本同步更新 |

---

## 五、台账

| 插件 | 插件版本 | DSH 版本 | 校验日期 | 结果 | 证据源 |
| --- | --- | --- | --- | --- | --- |
| `@oblivion/brand` | 0.1.0 | 0.2.0-rc.2 | 2026-10-06 | ✅ PASS 10/10 | `deepseek-harness @ dsh-v0.2.0-rc.2` (`639ed01539`) |
| `@oblivion/vimc` | 0.2.9 | 0.2.0-rc.2 | 2026-10-06 | ✅ PASS **6/6**（迁 bundle 层后） | 同上 |
| `@oblivion/core` | **0.1.5** | 0.2.0-rc.2 | **2026-10-06** | ✅ PASS **8/8** | 同上（host / service `tools`·`systemPrompt` / event `session/event`·`turn/end` / hostPkg `dsh-tools`·`dsh-system-prompt` / mount `dependencies`） |

**校验覆盖的契约**：

| 插件 | 断言的契约 |
| --- | --- |
| `@oblivion/brand` | host 范围；5 个槽位的 kind（`sidebar.brand.mark` / `sidebar.brand.name` / `conversation.hero.brand.mark` = `single`，`sidebar.panellist` = `list`，`main` = `keyed`）；`__ModuleLoader__`；`slots` 服务；profile 挂载（dependencies + bundles） |
| `@oblivion/vimc` | host 范围；`settings.section` = `list`；客户端包 `@deepseek-ai/dsh-client-ui-settings` 存在；`__ModuleLoader__`；profile 挂载（dependencies + **bundles**） |
| `@oblivion/core` | host 范围；服务 `tools` / `systemPrompt`；事件 `session/event` / `turn/end`；宿主包 `@deepseek-ai/dsh-tools` / `dsh-system-prompt`；profile 挂载（**仅 dependencies**） |

**挂载方式现状**：

- `@oblivion/brand`、`@oblivion/vimc`：**bundle 层**（各自 `package.json` 的 `dsh.bundle.patch` 指向自己的 `cordis.patch.yml`，并在 `dsh.profile.bundles` 中列出）—— 包自己声明怎么被组合，装到哪台机器都一样。
- `@oblivion/core`：⚠️ **仍走用户层 `cordis.patch.yml` 的 insert 行**（不在 bundles）→ **正处在 R1 描述的暴露面**。
  ✅ **2026-10-06 所有者裁定：走热挂**（`ARCHITECTURE.MD` §33.6 **DEC-028**）——收益是改参数/落盘即生效、不必重启，
  代价是换机器 / 重置 profile 会静默失效。缓解：安装片段随包提交（`oblivion-core/cordis.patch.yml` + README §9.1），
  且本脚本的 `mount profile.dependencies` 断言会在装载缺失时 FAIL。

---

_最后更新：2026-10-06 · 补 `@oblivion/core` 台账行（8/8）与挂载现状说明；新增机制或改动挂载方式时同步本文件与 `tools/verify-dsh-compat.ps1`。_
