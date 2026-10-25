# Oblivion-LAYOUT · 轮 18

- 来源会话: `session-3a92e4b6-1d2a-4fb2-b332-966ef5d58405`

## 问题

给网页标题加上图标

## 回答

要给网页加 favicon（浏览器标签图标），用 Polaris 星形品牌标。先看品牌资产的真实几何。

品牌资产里有规范的 `polaris.svg` / `polaris.ico`。最稳的做法是**构建期复制**（复制不会与生成器漂移），而不是重新渲染几何。

Parse error from embedded quotes again. Let me build the strings without literal double quotes.

三条注释行我漏了收尾引号。修掉。

搞定 —— **刷新 http://127.0.0.1:42081，浏览器标签上就是那颗北极星**（不再是灰色地球）。

## 做法：构建期**复制**规范品牌资产

```
.build/web/
  favicon.svg   1333 B   ← assets/brand/polaris.svg（8 芒星 + 渐变 + 中心白点）
  favicon.ico            ← assets/brand/polaris.ico（老浏览器兜底）
```

```html
<link rel="icon" type="image/svg+xml" href="./favicon.svg" />
<link rel="icon" type="image/x-icon" sizes="32x32" href="./favicon.ico" />
<link rel="apple-touch-icon" href="./favicon.ico" />
```

**关键选择：复制，而不是重新渲染几何。** 品牌几何的唯一真源是 `assets/brand/generate-brand-assets.py`，我若在构建脚本里再造一份 SVG，就等于把几何抄成两处 —— 迟早不一致。复制则**结构上不可能漂移**。脚本里也写了这条理由，并在资产缺失时直接报错（提示去跑那个 Python 生成器），不静默产出一个没图标的站。

## 实机验证

```
/favicon.svg → 200  image/svg+xml   1333 B，内容含 polaris-star ✅
/favicon.ico → 200  image/x-icon
GET / 里两条 <link rel="icon"> 都在 ✅
```

门禁：**671/671 绿** · build 0 · typecheck 0 · lint 0。测试也补了断言：**声明了图标就必须真有那个文件**（否则浏览器只会退回灰色地球，而构建「成功」——这类静默失效值得钉住）。

## 我在这上面连错三次，值得记一句

同一类手滑反复出现，而且**每次都伪装成「改完了」**：

1. 补丁锚点写错 → 静默不生效（无报错）；
2. 嵌入的 `"` 转义 → **解析期**报错（这次换了 `String.fromCharCode(34)` 常量绕开）；
3. 我插入的三行注释**漏了收尾引号** → 生成出 `'    <!--` 这样未闭合的字符串，prettier 报 `Unterminated string constant` 才暴露。

三次都不是设计错误，但**每次都需要外部检查才暴露** —— 所以我现在固定做「改后复核 + 单独跑一次构建 + 看真实产物目录」，不再只信补丁返回的那个 ✓。这次也正是靠「单独跑 `node scripts/build-web.mjs`、看 `.build/web` 里到底有没有 favicon」才定位到第 3 条。

## 状态

- 服务：**http://127.0.0.1:42081**（任务 `pwsh-16`，单实例；旧任务已清）
- 顺带说明：如果你之前开着的标签页还显示旧地球图标，需要**硬刷新**（`Ctrl+F5`）—— favicon 缓存很顽固。

下一步按之前列的待办，我建议 **R1-f**（`webStartup` 服务，验收判据 `API.layers == dump.layers`，现在 29 vs 28）；要换别的也行。

- 涉及工具: `run_code`

---