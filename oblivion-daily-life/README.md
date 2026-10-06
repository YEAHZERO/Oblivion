# 有数（@oblivion/daily-life）

> 物品的价值不是它标价多少，而是它为你服务了多少天。

「有数」是一个**物品服役账本**：记下每件东西什么时候买的、花了多少、卖了多少，
然后回答三个问题 ——

| 问题 | 口径 |
| --- | --- |
| 这件东西**每天**到底花了我多少钱？ | `真实日均成本 = (买入价 − 卖出回收) / 持有天数` |
| 它离我的目标服役期还有多远？ | `服役进度 = 持有天数 / 目标服役天数`（进度条截断，另给「超标 N 天」） |
| 它多久没被用过了？ | `闲置天数 = 今天 − 最近一次使用`（从没记过就从买入日算） |

配套的是**资产视角的三个盘面数**：账面投入（买入合计 − 卖出回收）、日耗合计、闲置损耗。
没有花哨图表 —— 一屏最多三个数字，其余下沉到列表。

界面（侧栏里的「有数」一页）：

```
有数
账面投入 ¥12,480.00   日耗合计 ¥18.4/天   闲置损耗 ¥6.2/天
共 6 件 · 服役中 3 · 闲置 2 · 已卖出 1

17 Pro Max            ¥9.9/天   服役中
总价 ¥8,999.00 · 已用 909 天 · 闲置 2 天      [用过一次] [卖出] [编辑] [删除]
服役 83%                                 ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇░░░░
```

## 安装

```powershell
dsh plugin --profile desktop add 'link:C:/Projects/Oblivion/oblivion-daily-life'
```

本包**自挂**：`package.json` 里声明了 `dsh.bundle.patch = ./dsh.bundle.patch.yml`，
安装器把本包写进 profile 的 `dsh.profile.bundles` 时，那张补丁表就是它自己的挂载声明
（与 `@oblivion/brand` 同一策略；`@oblivion/bundle` 只插那些不自带 patch 的包）。
改完配置要**重启 DSH** 才生效。

可配置项（`dsh.bundle.patch.yml` 里整段写 `config` 才生效 —— **patch 是整段替换，不是合并**）：

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `dataFile` | `~/.oblivion/daily-life/assets.json` | 账本文件（单文件） |
| `idleWarnDays` | `90` | 多少天没用过算「闲置」 |
| `statusPath` | `/daily-life/status` | 读：全量账本 + 指标 + 汇总 |
| `itemsPath` | `/daily-life/items` | 写：`add` / `update` / `sell` / `use` / `remove` |
| `maxItems` | `2000` | 账本条目上限（防误操作把文件塞爆） |

## 数据面

### `GET /daily-life/status`

返回账本全量：每条都带现算的派生指标（`derived`）+ 全局汇总（`stats`）。

```json
{
  "ok": true, "plugin": "@oblivion/daily-life", "version": "0.0.1",
  "generatedAt": "2026-10-06T...", "dataFile": "C:\\Users\\…\\assets.json",
  "loadError": null, "skipped": 0,
  "items": [{ "id": "dl-…", "name": "17 Pro Max", "buyPrice": 8999, "buyDate": "2023-02-11",
              "soldDate": null, "soldPrice": null, "lastUsedAt": null, "useCount": null,
              "note": null, "imagePath": null,
              "derived": { "holdingDays": 909, "dailyCost": 9.9, "usageProgress": 0.83,
                           "usageRatio": 0.83, "overdueDays": 0, "retentionRate": null,
                           "idleDays": 2, "status": "serving", "soldDelta": null } }],
  "stats": { "count": 1, "servingCount": 1, "idleCount": 0, "soldCount": 0,
             "servingValue": 8999, "soldValue": 0, "netSpend": 8999,
             "dailyTotal": 9.9, "idleBurn": 0, "soldPnl": 0, "retentionRate": null,
             "overdueCount": 0, "statusMix": [], "byCategory": [],
             "topDaily": [], "idleTop": [] }
}
```

### `POST /daily-life/items`

```json
{ "action": "add",    "item": { "name": "耳机", "buyPrice": 1299, "buyDate": "2025-03-04" } }
{ "action": "update", "item": { "id": "dl-…", "note": "降噪很好" } }
{ "action": "sell",   "id": "dl-…", "item": { "soldPrice": 600 } }   // soldDate 缺省 = 今天
{ "action": "use",    "id": "dl-…", "lastUsedAt": "2026-10-06" }     // 缺省 = 今天，useCount +1
{ "action": "remove", "id": "dl-…" }
```

`update` / `sell` 是**局部合并**：只传要改的字段，其余沿用原记录。

### 行为表

| 状态 | 何时 |
| --- | --- |
| `200` | 成功 |
| `400` | 请求体不是合法 JSON；动作不认识；字段校验没过（响应带 `errors` 数组） |
| `403` | 跨源：带了 `Origin` 且它的 host 与 `Host` 不一致 |
| `404` | 动作指向的 id 不在账本里 |
| `405` | 方法不对（读只认 `GET`、写只认 `POST`），响应带 `allow` |
| `409` | 新增会突破 `maxItems` |
| `413` | 请求体超过 128 KiB |
| `500` | 内部异常（只回 `internal error`，细节进宿主日志） |

所有响应 `cache-control: no-store`。写动作一律先过 `validateItem()` —— **没有任何一条路能写进脏数据**。

## 账本文件

单文件（规格冻结的形状），整份拷走就是一次备份：

```json
{ "version": 1, "updatedAt": "2026-10-06T…", "items": [ … ] }
```

- **原子写**：临时文件 → `rename`。Windows 上 `rename` 会因瞬时占用报
  `EPERM: operation not permitted`（`@oblivion/core` 在真实知识库里踩过两次），
  所以失败时退回「删临时文件 + 直接写」—— 丢原子性、保内容。
- **坏文件不静默吞掉**：`assets.json` 解析失败时**绝不覆盖**，先改名成
  `assets.json.corrupt-<时间戳>` 留底，再把这件事报到 `loadError` 里。
- 单条形状不合法（用户手改坏了某一条）计入 `skipped`，其余照常读出来。

## 口径（全部集中在常量与纯函数里）

| 常量 | 值 | 位置 |
| --- | --- | --- |
| `DEFAULT_SERVICE_DAYS` | `1095`（≈3 年） | `src/metrics.ts` |
| `IDLE_WARN_DAYS` | `90` | `src/metrics.ts` |
| `TOP_N` | `5` | `src/metrics.ts` |
| `MONEY_DECIMALS` | `2` | `src/metrics.ts` |
| `CATEGORY_SEED` | 数码 / 家电 / 家居 / 交通 / 服饰 / 工具 / 文娱 / 其他 | `src/metrics.ts` |

四条容易写错、因此被单测钉住的规则：

1. **持有天数含首日、最小 1 天**：当天买入的一件东西持有 1 天而不是 0 —— 避免除零，
   也更符合「用了 1 天」的直觉。
2. **金额显式 HALF_UP 到 2 位**：`1.005 → 1.01`。裸 `Math.round(1.005 * 100)` 会给出
   `1.00`（二进制表示误差），所以先用 `toFixed(9)` 抹掉再舍入。
3. **保值率只有真卖出去了才有意义**：未卖出是 `null`，**不是 0** —— 「不知道」和「是零」是两件事。
   界面上一律显示 `—`。
4. **可空字段统一 `null`**，不用空串、也不用 `0` 冒充「没填」。

## 与参考项目（`youshu-master`，MIT）的差异

参考项目 `C:\Projects\SourceCode\youshu-master` 是一个**家庭物品 / 有效期库存** Android App
（`app/src/main/java/com/youshu/app/**`）。先说清楚一件事：

> 全仓库 grep `dailyCost|日均|每日成本|折旧|soldPrice|buyDate|使用寿命|服役` **零命中**。
> 也就是说：**日耗、持有天数、服役进度、保值率、闲置损耗全是本项目的口径**，
> 没有任何参考先例可援引。下面只在「参考确实给出了正/反面佐证」的地方引用它，并标行号。

只**借鉴思路**，未复制任何代码片段；若将来复制，必须在文件头注明来源 `youshu-master`（MIT，`LICENSE:1`）与版权行。

### 正面借鉴

| 参考做法 | 我们怎么做 |
| --- | --- |
| `ui/screen/profile/ProfileScreen.kt:166-168` —— 顶部三格纯文本 | 顶部 KPI **恰好三个数字**，其余下沉到列表 |
| `util/DateUtil.kt:14-15` —— 统一日期显示格式 | 日期一律 `YYYY-MM-DD`，形状不对就显示 `—`，不猜不补零 |
| `data/local/dao/ItemDao.kt:203` —— SQL `COALESCE(SUM(...), 0.0)` | 汇总前过 `safeSum()`：`NaN` / `Infinity` 一律当 `0`，一笔坏数不污染整盘账 |
| 物品列表 + 状态筛选 | 状态字符串枚举 + 状态计数行（`共 N 件 · 服役中 … · 闲置 … · 已卖出 …`） |

### 反面教训（逐条对应我们的一处设计）

| 参考的坑 | 位置 | 我们的做法 |
| --- | --- | --- |
| 状态用 Int 魔术值（`STATUS_IN_USE = 0 / STATUS_USED_UP = 1 / STATUS_DISCARDED = 2`），读日志/JSON 都得回查常量表 | `data/local/entity/Item.kt:62-64` | 状态是字符串枚举 `serving \| idle \| sold`，自解释且 TS 能穷尽检查 |
| 空值双态：`note: String = ""`、`imagePath: String = ""`，下游永远要同时判 `null` 与空串 | `data/local/entity/Item.kt:26-43` | 只有一种「空」：`null`；写入前归一（`validateItem`） |
| 阈值散落在 ViewModel 里（7 天硬编码） | `HomeViewModel.kt:38` | 阈值集中为导出常量（`IDLE_WARN_DAYS` 等），界面不写字面量 |
| 金额格式化未指定舍入模式（`NumberFormat.getCurrencyInstance(Locale.CHINA)`，Java 默认 HALF_EVEN） | `util/DateUtil.kt:16` | 显式 HALF_UP 到 2 位 + 边界单测（`0.005 / 1.005 / 2.675`） |
| `ChronoUnit.DAYS.between` 自然日差、不含当天、无下界 | `util/DateUtil.kt:27-31` | **刻意不同**：含首日并兜底 `max(1, …)`，避免当天买入除零 |

## 本版不做

- **拍照 / AI 抠图贴纸**：参考侧根本没有抠图代码（grep `segment|matting|抠图|sticker|mlkit` 零命中），
  属另行选型；本版连图片上传都没有（`imagePath` 字段先留着）。
- **到期提醒 / 通知**。
- **回收站 30 天**：删除即删除（账本文件可自行备份）。
- **用后星级评价**。
- **复杂可视化**：参考无任何 Canvas/图表，本版也只有纯 CSS 进度条与环形占比的**数字**，不画图。
- 模型面工具（让模型帮我记账）—— 数据面已经就绪，接工具是下一版的事。

## 开发与验收

```powershell
cd C:\Projects\Oblivion\oblivion-daily-life
node scripts/build.mjs          # lib/index.js + lib/testkit.js + lib/client.js
node --test                     # 单测（测的是 lib/ 产物，所以必须先 build）
node scripts/selfcheck.mjs      # 自检：清单 / 版本 / 口径 / 行为表 / 降级路径
npx tsc -p tsconfig.json        # 类型检查
node scripts/bump-version.mjs --check   # 版本漂移检查
```

根上的 `pnpm run check` 会自动发现本目录（`tools/check-workspace.ps1` 用
`Get-ChildItem -Directory -Filter 'oblivion-*'`）并跑 version / typecheck / test / build；
`tools/run-selfcheck.ps1` 走 `pnpm -r --if-present run selfcheck`。

版本号的**唯一真源是包根的 `VERSION`**；`scripts/bump-version.mjs` 默认只加第三位（patch），
`--minor` / `--major` 必须显式给，位置参数写 `minor` / `major` 直接 `exit 2`。
**刻意不写 `lib/VERSION`**（`tools/check-workspace.ps1` 的 `Assert-NoLibVersion` 会判失败），
也刻意不在构建里 define 版本常量 —— 版本只能有一个来源，构建产物在运行时从 Node 半边读。
