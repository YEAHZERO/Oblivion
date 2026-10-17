/**
 * 经宿主 `ctx.llm` 跑一次文本生成 —— core 的**唯一**外部模型出入口（DEC-030）。
 *
 * 三条硬事实（2026-10-17 读宿主 `@deepseek-ai/dsh-llm` 源码/类型确认，不是猜的）：
 *
 *   ① `ctx.llm` **没有**高层 `chat()` / `complete()`，只有 `stream()`；
 *      「收一次完整回答」要自己把 `text-delta` 拼起来（`BlockAssembler` 是官方做法，
 *      但我们只要纯文本，所以自己累加，避免把框架包引进依赖）。
 *   ② 流里的 chunk 形状是判别联合（`StreamChunk`）：
 *      `{type:'text-delta', index, text}` / `{type:'finish', reason}` / `{type:'usage', usage}` …
 *      **适配器抛错会被 `LlmRuntime.stream()` 归一成终态 `finish`（reason 含 error/aborted）**，
 *      所以「抛异常」与「流里报错」两种失败都要处理。
 *   ③ **密钥不由我们经手**：密钥/地址是宿主 provider 适配器内部经 `ctx.credentials` 解析的
 *      （`dsh-llm-pi-ai` 的 `resolveApiKey`）。插件只报 `provider` / `model`，
 *      这比自己去读 `~/.dsh/.credentials.yaml` **更安全**，也正是「复用 DSH 里可用的地址与密钥」。
 *
 * 结构类型而非 import：与 `core-types.ts` 同一套理由（不把框架包放进依赖）。
 */

export interface LlmProviderInfo {
  id: string;
  name?: string;
}

export interface LlmModelInfo {
  provider: string;
  id: string;
  name?: string;
}

/** 宿主 LLM 面（结构化的 `ctx.llm`）。 */
export interface LlmRuntimeLike {
  listProviders(): LlmProviderInfo[];
  listModels(provider: string): Promise<LlmModelInfo[]>;
  stream(options: Record<string, unknown>): AsyncIterable<unknown>;
}

export interface LlmRoute {
  provider: string;
  model: string;
}

export interface LlmAttempt {
  route: LlmRoute;
  ok: boolean;
  /** 失败原因（成功时为 undefined）。 */
  error?: string;
  /** 成功时收到的文本长度，便于一眼看出「回了个空」。 */
  chars?: number;
}

export interface LlmCallResult {
  ok: boolean;
  text: string;
  route: LlmRoute | null;
  /** 按序尝试过的每条路（`attempts[0]` 是主路）——「自动切换」的过程证据。 */
  attempts: LlmAttempt[];
  error?: string;
}

export interface LlmRequest {
  prompt: string;
  system?: string;
  maxTokens?: number;
}

export interface LlmCallOptions {
  maxTokens?: number;
  timeoutMs?: number;
  /** 传给宿主的用途标记（宿主日志/计费会带上它）。 */
  purpose?: string;
}

export const DEFAULT_MAX_TOKENS = 1024;
export const DEFAULT_TIMEOUT_MS = 30_000;

/** 终态 finish 里「算失败」的形态：宿主把适配器异常归一成这些。 */
const BAD_FINISH = /error|abort|cancel|timeout/i;

/**
 * 把任意 ctx 收敛成 `LlmRuntimeLike`；宿主没提供 `llm` 服务时回 `null`。
 *
 * 调用方**必须**优雅降级（回 `skipped`），不能因为缺服务就抛 —— 缺 `llm` 是常态
 * （极简宿主 / 用户没配 provider），不是错误。
 */
export function llmRuntimeOf(ctx: unknown): LlmRuntimeLike | null {
  const candidate = (ctx as { llm?: Partial<LlmRuntimeLike> } | null | undefined)?.llm;
  if (!candidate) return null;
  if (typeof candidate.stream !== 'function' || typeof candidate.listProviders !== 'function') return null;
  return candidate as LlmRuntimeLike;
}

/** 收流：只累加 `text-delta`，同时记住终态 `finish.reason`。 */
export async function drainText(stream: AsyncIterable<unknown>): Promise<{ text: string; finish?: string }> {
  let text = '';
  let finish: string | undefined;
  for await (const raw of stream) {
    const chunk = raw as { type?: unknown; text?: unknown; reason?: unknown } | null | undefined;
    if (!chunk || typeof chunk.type !== 'string') continue;
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') {
      text += chunk.text;
    } else if (chunk.type === 'finish' && typeof chunk.reason === 'string') {
      finish = chunk.reason;
    }
  }
  return { text, finish };
}

/** 单条路跑一次；失败回 `{ok:false, error}`，**不抛**（抛是调用方的事）。 */
async function attempt(
  runtime: LlmRuntimeLike,
  route: LlmRoute,
  request: LlmRequest,
  options: LlmCallOptions,
): Promise<{ ok: boolean; text: string; error?: string }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const payload: Record<string, unknown> = {
    provider: route.provider,
    model: route.model,
    messages: [{ role: 'user', content: [{ type: 'text', text: request.prompt }] }],
    maxTokens: options.maxTokens ?? request.maxTokens ?? DEFAULT_MAX_TOKENS,
    purpose: options.purpose ?? 'oblivion-organize',
  };
  if (request.system !== undefined && request.system !== '') payload.system = request.system;
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) payload.signal = AbortSignal.timeout(timeoutMs);

  const { text, finish } = await drainText(runtime.stream(payload));

  // 宿主把适配器异常归一成终态 finish（见模块注释 ②）⇒ 报错的终态一律算失败，交给下一条路。
  if (finish !== undefined && BAD_FINISH.test(finish)) {
    return { ok: false, text, error: `finish=${finish}` };
  }
  // 既没有终态、也没收到任何文本：不能当成功（否则「静默回了个空」会被当成整理完了）。
  if (finish === undefined && text.trim() === '') {
    return { ok: false, text, error: 'empty stream (no finish, no text)' };
  }
  return { ok: true, text };
}

/**
 * **按序尝试每条路**（这就是「自动切换」）：主路失败 → 下一条备用路 → …
 * 全失败回 `ok:false`，并把每条路的失败原因留在 `attempts` 里（可解释、可留痕）。
 */
export async function generate(
  runtime: LlmRuntimeLike,
  routes: readonly LlmRoute[],
  request: LlmRequest,
  options: LlmCallOptions = {},
): Promise<LlmCallResult> {
  const attempts: LlmAttempt[] = [];
  if (routes.length === 0) {
    return { ok: false, text: '', route: null, attempts, error: 'no route configured' };
  }
  for (const route of routes) {
    try {
      const result = await attempt(runtime, route, request, options);
      if (result.ok) {
        attempts.push({ route, ok: true, chars: result.text.length });
        return { ok: true, text: result.text, route, attempts };
      }
      attempts.push({ route, ok: false, error: result.error });
    } catch (error: unknown) {
      attempts.push({ route, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ok: false, text: '', route: null, attempts, error: attempts[attempts.length - 1]?.error ?? 'all routes failed' };
}

/** 列出可用 provider（缺服务回 `[]`）。设置页据此给下拉框。 */
export function listProviders(runtime: LlmRuntimeLike | null): LlmProviderInfo[] {
  if (!runtime) return [];
  try {
    return runtime.listProviders();
  } catch {
    return [];
  }
}

/** 列某个 provider 的模型（缺服务/报错都回 `[]`）。 */
export async function listModels(runtime: LlmRuntimeLike | null, provider: string): Promise<LlmModelInfo[]> {
  if (!runtime || provider === '') return [];
  try {
    return await runtime.listModels(provider);
  } catch {
    return [];
  }
}

/**
 * 组「按序尝试」的路：主路（可能为空 ⇒ 省略）+ 备用路。
 * 空 provider/model 的条目会被丢掉，不会变成一次必然失败的调用。
 */
export function buildRoutes(
  primary: { provider?: string; model?: string } | null | undefined,
  fallbacks: readonly { provider: string; model: string }[] = [],
): LlmRoute[] {
  const routes: LlmRoute[] = [];
  const push = (provider: string, model: string): void => {
    if (provider === '' || model === '') return;
    if (routes.some((r) => r.provider === provider && r.model === model)) return;
    routes.push({ provider, model });
  };
  if (primary) push(String(primary.provider ?? ''), String(primary.model ?? ''));
  for (const f of fallbacks) push(String(f.provider ?? ''), String(f.model ?? ''));
  return routes;
}
