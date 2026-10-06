# 更新日志 · @oblivion/daily-life（有数）

版本号的唯一真源是包根的 `VERSION`；`package.json` 的 `version` 由
`scripts/bump-version.mjs` 同步。客户端运行时读 Node 半边下发的版本，
**不写 `lib/VERSION`**、构建里也**不 define 版本常量**。

## 0.0.1 — 首版（骨架与全部正文）

冻结规格下的第一次落地：物品服役账本从零到能装、能写、能看。

### 数据面

- `GET /daily-life/status`：账本全量 + 每条的派生指标 + 全局汇总（`ok` / `plugin` /
  `version` / `generatedAt` / `dataFile` / `loadError` / `skipped` / `items` / `stats`）。
- `POST /daily-life/items`：`add` / `update` / `sell` / `use` / `remove`；
  `update`、`sell` 为局部合并（只传要改的字段）。
- 行为表：`405`（带 `allow`）/ `403` 跨源 / `400` 校验没过（带 `errors`）/
  `404` 找不到 / `409` 超 `maxItems` / `413` 体超 128 KiB / `500` 内部异常；
  响应一律 `cache-control: no-store`。
- 存储：单文件 `~/.oblivion/daily-life/assets.json`，原子写（`rename` 失败退回直接写，
  对付 Windows 的瞬时 `EPERM`）；坏文件改名 `*.corrupt-<时间戳>` 留底 + `loadError` 上报；
  单条形状不合法计入 `skipped`。

### 口径

- 真实日均成本 `=(买入价 − 卖出回收) / 持有天数`；持有天数**含首日、最小 1 天**。
- 服役进度 `=持有天数 / 目标服役天数`：`usageProgress` 截断到 1，另给
  `usageRatio`（不截断）与 `overdueDays`（「超标 N 天」）。
- 保值率 `=卖出价 / 买入价`，仅已卖出且买入价 > 0 时给数字，否则 `null`。
- 闲置 = 距今 `≥ IDLE_WARN_DAYS(90)` 天没用过（从没记过则从买入日算）。
- 金额显式 HALF_UP 到 2 位（`1.005 → 1.01`）；汇总前过 `safeSum` 做 `Number.isFinite` 兜底。
- 可空字段统一 `null`，不用空串；日期一律 `YYYY-MM-DD` 本地日历日。

### 界面（侧栏「有数」一页）

- KPI 恰好三格（账面投入 / 日耗合计 / 闲置损耗）+ 状态计数行。
- 物品列表：状态标签、日耗、总价 / 已用 / 闲置或保值差额、纯 CSS 服役进度条、
  「用过一次」、卖出（内联输入成交价）、编辑、删除。
- 新增 / 编辑共用一张表单；错误横幅；`loadError` 与 `skipped` 有专门提示。
- **无任何图表**（本版不做复杂可视化）。
- 降级：better-sidebar 缺席只记一条日志，不注册、不抛 —— 绝不因为可选 UI 服务缺席
  让整个插件装载失败。

### 工程

- 纯 TS + esbuild：`lib/index.js`（ESM/node22）、`lib/testkit.js`、`lib/client.js`
  （cjs/browser，包进 `window.__ModuleLoader__.load({ id, factory: (require) => … })`，
  `react`/`react-dom`/`react/jsx-runtime` 留 external）。
- 闸门四件套：`tsc -p tsconfig.json`、`node --test`、`node scripts/build.mjs`、
  `node scripts/selfcheck.mjs`；自挂 `dsh.bundle.patch.yml`；`dsh.compat.host = ">=0.2.0-rc.2 <0.3.0"`。

### 文档修订（同属 0.0.1，未改代码）

- 标题补上英文 / 仓库名 **DailyLife**（中文界面名仍为「有数」）。
- 「安装」一节改正：`desktop` profile 由 Electron 应用独占管理，
  `dsh plugin --profile desktop add …` 会被 CLI 拒绝
  （`profile "desktop" is managed exclusively by the Electron application`），
  改为「手改 `package.json` 两处 + `pnpm install --prefer-offline` 生成软链 + `verify-dsh-compat.ps1` 核对」；
  `dsh.bundle.patch.yml` 顶部的安装注释同步改正。
- 「与参考项目」一节补上游地址 <https://github.com/gorkys/youshu> 与复核口径
  （递归 grep `日均|每日成本|每天成本|折旧|保值|日耗|元/天` 覆盖全部
  `.kt/.md/.xml/.kts` 含 `样板.md`，7 个词 0 命中 ⇒ 日耗类口径无参考先例，
  三张参考截图不是该仓库实现的东西），并新增「概念层借鉴」表
  （录入路径压缩 / 折叠区 / 提醒去重 / 回收站 / 用后评价 / AI 模型管理入口 / 业务状态与软删除分离，
  逐条写明本版做或不做及原因）。

