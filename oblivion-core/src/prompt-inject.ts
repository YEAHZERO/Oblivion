/**
 * **提示词注入的桥** + **agent 订阅的补挂入口**（两者共用同一条"每轮必到"的通道）。
 *
 * ## 为什么需要这个模块
 *
 * `mount-diag.json` 实测：插件挂在 profile 根上下文上的事件派发**整体不生效** ——
 * `rootSeen: 0`、`agentSeen: 0`、连 `lifecycleSeen` 都是空的（`agent/created`、`session/created`、
 * `turn/start` 一个都没到）。所以"在根上下文听事件"这条路是死的。
 *
 * 唯一可靠的两个入口都在**宿主主动回调我们**的地方：
 *   ① `systemPrompt.section` 的 `text(context)` —— 每轮请求都会跑，且 `context.agent` 就是**当前 agent**；
 *   ② 工具 `execute(args, exec)` —— 工具调用必然发生在某个 agent 会话内，`exec` 里带 caller agent。
 *
 * 因此本模块只做两件事：把"拿到一个 agent 载荷"转交给 qa-loop 去挂订阅；
 * 以及保存/读取"上一轮捕获命中的既有知识"，供下一轮提示词追加。
 * 无定时器、无常驻句柄：状态只有一个小对象，随插件卸载清空。
 */

/** qa-loop 注册进来的挂载函数（载荷 → 判断是不是 agent → 挂订阅）。 */
let attachHandler: ((payload: unknown) => void) | undefined;

/** index 侧注册进来的"按 agent 注册段落/工具"函数（官方 file-reference-local 的写法）。 */
let agentInstaller: ((payload: unknown) => void) | undefined;

/** index 装载时注册：拿到 agent 载荷就为这个 agent 装一次段落与工具。 */
export function setAgentInstaller(installer: ((payload: unknown) => void) | undefined): void {
  agentInstaller = installer;
}

/** qa-loop 装载时注册（卸载时传 undefined 清空）。 */
export function setAttachHandler(handler: ((payload: unknown) => void) | undefined): void {
  attachHandler = handler;
}

/**
 * 从任意宿主载荷里尝试：① 为该 agent 注册段落与工具；② 挂上 agent 作用域订阅。
 *
 * 刻意**不解析**载荷形状（那是 qa-loop 的 `pickAgent` 的事，且要容错）：
 * 这里只是把载荷原样转交，任何异常都被吞掉 —— 注入通道绝不能影响请求本身。
 */
export function attachAgentFromPayload(payload: unknown): void {
  try {
    agentInstaller?.(payload);
  } catch {
    // 注册失败不影响本轮提示词
  }
  try {
    attachHandler?.(payload);
  } catch {
    // 补挂失败不影响本轮提示词
  }
}

/** 上一轮捕获后检索到的相关既有知识（标题），供下一轮提示词使用。 */
export interface RelatedKnowledge {
  titles: string[];
  at: number;
}

const RELATED_TTL_MS = 15 * 60 * 1000;
const RELATED_MAX = 3;

let related: RelatedKnowledge | undefined;

/** 捕获成功后调用：记下这条问答命中的既有条目标题（去重、限量）。 */
export function rememberRelatedKnowledge(titles: readonly string[], at = Date.now()): void {
  const cleaned = [...new Set(titles.map((title) => String(title).trim()).filter((title) => title !== ''))].slice(0, RELATED_MAX);
  if (cleaned.length === 0) return;
  related = { titles: cleaned, at };
}

/**
 * 读取"相关既有知识"提示行；**读取不消费**（同一批知识在生命周期内对多轮都有用），
 * 但超过 TTL 即失效（避免拿一小时前的检索结果污染当前话题）。
 */
export function readRelatedHint(now = Date.now()): string {
  if (!related) return '';
  if (now - related.at > RELATED_TTL_MS) {
    related = undefined;
    return '';
  }
  return ['## 相关既有知识（来自知识库检索）', '', ...related.titles.map((title) => '- ' + title)].join('\n');
}

/** 卸载时清空（qa-loop 的 effect 里调用）。 */
export function clearRelatedKnowledge(): void {
  related = undefined;
}
