/**
 * 品牌插件的宿主路由路径。
 *
 * **宿主半边与浏览器半边共用这一处定义**：路径写两遍就一定会漂（本仓库已经在
 * 「版本号写两遍」上付过一次代价，见 HANDOFF 的工程基建一节）。本文件**只放常量**，
 * 因此可以安全地被打进客户端产物（不引任何 `node:` 模块）。
 */

/** 重启 DSH 桌面端（POST，宿主派生游离 helper）。 */
export const RESTART_PATH = '/obl-brand/restart';

/**
 * 当前是否有活动任务（GET，只读）。
 *
 * 与桌面端 `hasDesktopActiveTasks` 同口径：有 running 的 agent、排队的 inbox 消息、
 * 或 running/stopping 的后台 job。供面板在重启前弹「任务将会中断」确认用。
 */
export const TASKS_PATH = '/obl-brand/tasks';

/** 个人已安装插件清单（GET，只读；供设置面板列出并复制恢复命令）。 */
export const PLUGINS_PATH = '/obl-brand/plugins';

/**
 * 检查插件更新（GET，只读）：读 profile 依赖 + 查 npm latest，返回可更新项。
 * 跳过 link: / file: / @oblivion/* / @deepseek-ai/*（本机链接或宿主包）。
 */
export const UPDATES_PATH = '/obl-brand/updates';

/**
 * 应用插件更新（POST）：把选中项写进 profile package.json 并跑内置 pnpm install。
 * 不改会话、不重启；重启由面板的「重启 DSH」按钮负责。
 */
export const UPDATES_APPLY_PATH = '/obl-brand/updates/apply';

/**
 * 清理 web-login 遗留的孤儿 Chromium 进程（POST，**不重启**）。
 *
 * 与重启路由分开的理由：重启会把会话打断，而这个动作只想把被占住的传输 profile
 * 目录解开 —— 现场「三个账号全红」时，用户要的是后者。
 */
export const ORPHANS_PATH = '/obl-brand/orphans';

/**
 * 重启前综合检查（GET，只读）。
 *
 * 聚合所有 brand 侧可检测的「阻止重启」条件，供面板的 RestartControl 在点击重启按钮前调用，
 * 以便给出精确的打断说明而非笼统的「任务将会中断」。
 *
 * 返回字段：
 *   - `ok`        boolean           是否安全重启（所有 gate 均通过）
 *   - `active`    boolean           有 running agent 或 running/stopping job
 *   - `reason`    string | null     如果有 gate 阻止，给出人类可读的原因
 *   - `detail`    string[]          具体有哪些 gate 触发（可多条）
 *
 * 服务不可用时返回 `{ ok: false, error: '...' }`，面板侧按「无法确认就不弹」处理。
 */
export const RESTART_GATES_PATH = '/obl-brand/restart-gates';

/**
 * 向指定 DSH 会话注入一条用户消息（POST，宿主半边）。
 *
 * 这是本仓库唯一一条**写** DSH 会话的路由，走的是 App 自己的会话接口
 * （`sessionController.prompt` —— UI「发送」与审批通知用的是同一条），
 * 因此注入的消息会像真人输入一样出现在会话里，并立即驱动一轮 agent。
 *
 * 之所以不走「往 `session.v4.jsonl.zstd` 追加一帧」那条路：运行中的 DSH 用内存
 * 状态渲染、不重读日志，追加的消息既不会实时显示，seq 还会与宿主自己的计数器冲突，
 * 更有让整条会话读不出来的风险（读取器对完整帧的格式校验是硬失败）。
 */
export const SESSION_MESSAGE_PATH = '/obl-brand/session/message';

/**
 * 读回指定 DSH 会话最近的问答（GET，宿主半边，**只读**）。
 *
 * 与上一条是**一对**：注入是只写的，回答留在 DSH 里；这条把回答读回来，于是
 * 「在别的工具里继续一个 DSH 会话」可以闭环（注入 → 等一轮 → 读回）。
 *
 * 数据源是 App 自己一直在写的会话日志（`<DSH_HOME>/sessions/…/session.v4.jsonl.zstd`），
 * 只读 ⇒ 不会写坏会话（理由与格式细节见 `src/session-tail.ts`）。
 *
 * 参数：`session`（必填，会话 id）、`limit`（可选，1..50，默认 6）。
 */
export const SESSION_TAIL_PATH = '/obl-brand/session/tail';
