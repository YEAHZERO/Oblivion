/**
 * 外部向**指定 DSH 会话**注入一条用户消息（宿主半边）。
 *
 * ## 为什么需要它，以及为什么走这条接口
 *
 * 「在别的工具里继续一个 DSH 会话，然后在 DSH 里看到它」有两条路：
 *
 *   ① **直接往会话日志追加一帧**（`session.v4.jsonl.zstd`）。不行 —— 运行中的 DSH
 *      用**内存状态**渲染，不重读日志，所以追加的消息**不会实时显示**（只有重启 /
 *      重新加载会话才可能读到）；宿主的 seq 计数器不知道我们那条，后续追加会**撞 seq**；
 *      而且读取器对完整帧做严格校验（坏 JSONL / 坏帧结构 → 整个会话 `open()` 失败），
 *      写坏一帧等于毁掉一条会话。这条路只在「DSH 关停 + 副本实验」时才允许。
 *
 *   ② **走 App 自己的会话接口**：`sessionController.prompt(request)`（`@Remote('prompt')`）
 *      —— UI 的「发送」按钮、DSH 给 agent 注入审批通知，用的都是**同一条链**。
 *      它会把消息落成一条真正的 `user/message`（带 `rpcId`，按 `requestId` 幂等），
 *      并驱动一轮 agent，所以**会实时出现在 DSH 里**。本模块走这条。
 *
 * ## 分工
 *
 * 参数解析、开关、失败归类都是**纯函数**，导出给 `scripts/selfcheck.mjs` 断言；
 * 真正的 `prompt()` 调用在 `index.ts` 的路由里（需要 host ctx 的 `sessionController`）。
 *
 * ## 安全口径
 *
 * 这是「向一个拥有完整工具权限的 agent 投喂指令」，比重启更敏感，所以：
 *   ① 只回本机调用方（与重启/清扫路由共用 `isTrustedCaller`：拒绝存在且非本机的 Origin）；
 *   ② 留一个运营者开关 `OBLIVION_BRAND_SESSION_INJECT`，设成关闭值即整条路由 403。
 */

/** 运营者开关：设为 `off` / `0` / `false` / `no` 时整条路由拒绝服务。 */
export const SESSION_INJECT_ENV = 'OBLIVION_BRAND_SESSION_INJECT';

/** 单条消息的文本上限（字符）。够长，但能挡住「整篇日志灌进上下文」。 */
export const MAX_SESSION_MESSAGE_CHARS = 20_000;

/** 请求体上限（字节）。比文本上限宽裕，留给 JSON 包装与转义。 */
export const MAX_SESSION_MESSAGE_BYTES = 256 * 1024;

/** 投递方式：`queue` = 排到下一步 / 下一轮；`steer` = 插入正在跑的这一轮。 */
export type SessionPromptMode = 'queue' | 'steer';

/** 与 `SessionPromptRequest` 对齐的**最小**形状（不引 harness 类型，保持包自治）。 */
export interface SessionMessageRequest {
  /** 客户端铸造的幂等标识：同 id 重复提交只会被接受一次。 */
  requestId: string;
  sessionId: string;
  mode: SessionPromptMode;
  content: Array<{ type: 'text'; text: string }>;
}

/** 读请求体需要的最小面（`IncomingMessage` 结构兼容）。 */
export interface BodySource {
  on(event: string, listener: (...args: unknown[]) => void): void;
  resume?(): void;
}

/**
 * 路由开关是否被关掉。
 *
 * 真值口径与 `OBLIVION_BRAND_ORPHAN_SWEEP`（`orphans.ts` 的 `mountSweepDisabled`）
 * **逐字一致**：一个插件里的两个运营者开关不该有两套真值表。
 */
export function sessionInjectDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env[SESSION_INJECT_ENV] ?? '').trim().toLowerCase();
  return raw === 'off' || raw === '0' || raw === 'false' || raw === 'no';
}

export type ParseResult =
  | { ok: true; value: SessionMessageRequest }
  | { ok: false; error: string };

/**
 * 校验并规范化请求体（纯函数）。
 *
 * `requestId` 幂等键**优先取调用方给的那一个**（脚本重试要走同一键，才真的幂等）；
 * 没给就用路由传进来的 `fallbackRequestId`（那里是 `randomUUID()`）。
 * 自检要能对同一输入断言确定性的输出，所以随机源不放在这个函数里。
 */
export function parseSessionMessageRequest(raw: unknown, fallbackRequestId: string): ParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: '请求体必须是一个 JSON 对象' };
  }
  const record = raw as Record<string, unknown>;

  const sessionId = typeof record['sessionId'] === 'string' ? record['sessionId'].trim() : '';
  if (sessionId === '') {
    return { ok: false, error: 'sessionId 必须是非空字符串' };
  }

  const text = typeof record['text'] === 'string' ? record['text'] : '';
  if (text.trim() === '') {
    // 与 session-controller 自己的 `hasPromptContent` 同一条判据：全空白不算内容。
    return { ok: false, error: 'text 必须包含非空白字符' };
  }
  if (text.length > MAX_SESSION_MESSAGE_CHARS) {
    return { ok: false, error: `text 超过 ${String(MAX_SESSION_MESSAGE_CHARS)} 字符上限` };
  }

  const mode = record['mode'] === undefined ? 'queue' : record['mode'];
  if (mode !== 'queue' && mode !== 'steer') {
    return { ok: false, error: "mode 只能是 'queue' 或 'steer'" };
  }

  const provided = typeof record['requestId'] === 'string' ? record['requestId'].trim() : '';
  const requestId = provided === '' ? fallbackRequestId : provided;

  return { ok: true, value: { requestId, sessionId, mode, content: [{ type: 'text', text }] } };
}

/**
 * 读取请求体（带上限）。
 *
 * `IncomingMessage` 的 `'data'` 分片可能是 `Buffer` 也可能是 string（编码被设过时），
 * 两种都收；超限即拒绝（不等人把整个 body 发完）。
 */
export function readRequestBody(source: BodySource, maxBytes: number = MAX_SESSION_MESSAGE_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    source.on('data', (chunk) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += buf.length;
      if (size > maxBytes) {
        fail(new Error(`请求体超过 ${String(maxBytes)} 字节上限`));
        return;
      }
      chunks.push(buf);
    });
    source.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    source.on('error', (error) => {
      fail(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

/**
 * 把 `prompt()` 抛出的错误摊平成可回给浏览器的形状。
 *
 * 会话接口抛的是 `RemoteError`（带 `code`，例如 `session/not-found`、
 * `gateway/bad-request`）；普通异常没有 `code`。
 */
export function describePromptFailure(error: unknown): { error: string; code?: string } {
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const code = typeof record['code'] === 'string' && record['code'] !== '' ? record['code'] : undefined;
    const message = typeof record['message'] === 'string' && record['message'] !== '' ? record['message'] : String(error);
    return code === undefined ? { error: message } : { error: message, code };
  }
  return { error: String(error) };
}

/**
 * 会话接口的错误码 → HTTP 状态码（纯函数）。
 *
 * 不把一切都压成 500：「会话不存在」是调用方的 404，请求内容不合法是 400，
 * 其余才是「上游拒绝」的 502 —— 面板/脚本能据此区分「我传错了」与「宿主出问题了」。
 */
export function httpStatusForPromptFailure(code: string | undefined): number {
  if (code === 'session/not-found') return 404;
  if (code === 'gateway/bad-request' || code === 'session/invalid-time-zone') return 400;
  return 502;
}
