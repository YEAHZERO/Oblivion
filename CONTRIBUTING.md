# 贡献指南（CONTRIBUTING）

> 本文件由 alphα 模板生成，发布前请按项目实际情况完善带【】的占位内容。
> 本文件同时是**第三方复用登记**的唯一载体（原 THIRD_PARTY_NOTICES.md 已并入此处）。

## 开始参与

1. 阅读根目录 `README.md`，以及本机 `.design/` 下的 `architecture.md`（意图/决策/验收基线），和 UI 三份 `DESIGN.MD`（视觉语言）/ `LAYOUT.MD`（界面结构）/ `COMPONENTS.MD`（组件）——**这四份不在仓库里**，需自行同步；实现须同时符合设计书与 UI 三份。
2. 任何非琐碎改动遵循设计流程：先登记 `REQ/DEC`，再动代码。
3. 提交信息使用 Conventional Commits（🐛 fix / ✨ feat / 📝 docs / ♻️ refactor / ✅ test / 🔧 chore）。

## 开发流程

- 环境要求：见 `README.md`【技术栈与版本】。
- 安装：`【安装命令】`
- 测试：`【测试命令】`；提交前必须全绿。
- 目录规范：见 `docs/目录结构说明.md`；架构设计书与 UI 设计书一律入本机 `.design/`，**不入库**。

## 报告问题与拉取请求

- Issue：【issue 链接】，附复现步骤与日志片段。
- PR：描述动机→改动→验证证据；关联对应 issue/REQ 编号。

## 安全漏洞

请勿公开提 issue，按 `SECURITY.md` 渠道报告。

---

## 第三方复用登记（先登记，后复用）

### 规则

1. 复用任何第三方开源代码/数据/文本前，在下方登记表新增一行并**锁定上游 commit**。
2. 许可证分级：
   - MIT/Apache-2.0/BSD/ISC 等宽松许可 → 可复制修改再发布，须在"许可声明原文"附版权行+许可全文；
   - GPL/AGPL/MPL 等 copyleft → **先请示项目所有者**并评估传染，仅隔离使用（独立进程/子模块）；
   - **无 LICENSE 仓库禁止复制任何代码**，只允许"理念启发"级吸收并在备注注明。
3. 商标边界：不使用上游名称/logo 作本项目标识。
4. 新增运行时依赖前核对依赖许可证，登记为独立行。
5. 随上游更新复核：发布前或被用模块出缺陷时，`git log <锁定commit>..HEAD -- <被用文件>` 检查上游变更；结果追加到"状态"列并注明日期，不改写历史行。
6. 发布门禁：打包/发布检查清单必须包含"登记表全部'已复用'行有对应许可声明原文"。

### 登记表

| #   | 来源仓库                    | 许可证 | 上游 commit/版本 | 检索/复用日期 | 被用文件/内容 | 使用方式（复制/移植/参考/数据） | 状态（计划中/已复用/参考/禁止） |
| --- | --------------------------- | ------ | ---------------- | ------------- | ------------- | ------------------------------- | ------------------------------- |
| 1   | [gdh1995/vimium-c](https://github.com/gdh1995/vimium-c) | MIT（上游声明；本机抓取 github.com 被拒，**未能联网复核**） | 未锁定（**仅理念启发，未复制代码**） | 2026-10-05 | 键位语义（`scrollPageUp/Down`、`scrollLeft/Right`、`scrollToTop/Bottom`、`focusInput`）、翻页量级、滚动容器发现、`focusInput` 的 `prefer`/`select` 选项命名 | 参考（理念启发）——落地文件 `oblivion-vimc/src/client/{keys,scroller,focus}.ts` | 参考 |
| 2   | [capricorn86/happy-dom](https://github.com/capricorn86/happy-dom) | MIT | 20.14.5（package-lock 锁定） | 2026-10-05 | `oblivion-vimc/tests/*.mjs` 的 DOM 替身（派发真实 `KeyboardEvent`） | 依赖（devDependency，仅测试） | 已复用 |
| 3   | [evanw/esbuild](https://github.com/evanw/esbuild) | MIT | 0.28.2（package-lock 锁定） | 2026-10-05 | `oblivion-vimc/scripts/build.mjs` 的打包器（双产物 Node/浏览器） | 依赖（devDependency，仅构建） | 已复用 |
| 4   | [microsoft/TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 | 5.9.3（package-lock 锁定） | 2026-10-05 | `oblivion-vimc` 类型检查（`tsc -p tsconfig.json`） | 依赖（devDependency，仅构建） | 已复用 |
| 5   | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)（`@types/node`） | MIT | 26.6.4（package-lock 锁定） | 2026-10-05 | 同上（`node:http` 等类型） | 依赖（devDependency，仅构建） | 已复用 |
| 6   | [facebook/react](https://github.com/facebook/react) | MIT | 19.x（package-lock 锁定） | 2026-10-05 | `oblivion-vimc/src/client/settings.tsx` 的设置页；**运行期由 DSH 客户端模块表提供**（标 external，不打进插件包） | 依赖（devDependency 供类型/测试；运行期用宿主自带） | 已复用 |
| 7   | [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)（`@types/react`、`@types/react-dom`） | MIT | 19.x（package-lock 锁定） | 2026-10-05 | 同上 | 依赖（devDependency，仅构建） | 已复用 |

> 新项目初始化后：删除示例行，按实际参考对象逐条登记。本项目当前参考源见 `.design/architecture.md` §30（参考库结构）。
> 第 1 行是**理念启发**：`@oblivion/vimc` 的实现代码全部自写，未复制 Vimium-C 的任何源码；
> 若将来真的复制其文件，**先补锁定 commit 与许可原文**再动代码。

### 许可声明原文

（首次实际复制某仓库代码/数据时，在此粘贴其 LICENSE 原文与版权行，一仓库一节。）

> 当前状态：**本仓库未复制任何上游代码**。登记表第 1 行（vimium-c）是理念级参考；
> 第 2–5 行是 devDependencies（只在构建/测试时使用，不随本仓库再发布），因此无需附许可原文。
