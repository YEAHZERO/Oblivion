/**
 * **自动整理**（DEC-030）：让模型给知识库的存量笔记起名字、补标签。
 *
 * ## 与 `oblivion_retitle` 的分工
 *
 * `oblivion_retitle`（0.2.2）走的是「**模型自己看候选 → 自己起名 → 插件落盘**」：
 * 起名的智力来自**外层会话的模型**，插件一个请求都不发。这条路没变，也依然可用。
 *
 * 本模块是**第二条路**：插件自己经 `ctx.llm` 问一次模型（`deps.runtime`），
 * 于是「自动整理」不必有人坐在会话里催。两条路的落盘逻辑**共用**
 * `RetitleService.apply()`，唯一的区别是 `named_by` 都写 `'model'`，
 * 规则管线（`naming.ts`）据此让路。
 *
 * ## 三条不变量
 *
 *   ① **默认零请求**：`config.organize.enabled === false` 时 `preview()` 直接返回，
 *      **不构造 prompt、不碰 runtime**（有单测盯着这条）。
 *   ② **先预览再落地**：`preview()` 只读盘、只回建议，**一个字都不写知识库**；
 *      建议落 `<dataRoot>/organize-proposals.json`（自动路径用，人/面板可看）。
 *      纵使 `autoApply` 打开，落地也只经 `apply()` 一条路。
 *   ③ **失败不阻塞**：全路失败只把 `attempts` 记进留痕并返回 `ok:false`，
 *      调用方（触发路径）catch 掉即可 —— 整理失败不该影响问答。
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Config, OrganizeConfig } from '../config.js';
import type { DigestResult, DigestService } from '../digest/index.js';
import { contentSection, parseNote, type NoteRef, type RetitleResult, type RetitleService } from '../knowledge/retitle.js';
import {
  buildDigestPrompt,
  DIGEST_ITEMS_MAX,
  parseDigestDraft,
  type DigestDraft,
  type DigestSourceItem,
} from './digest-scope.js';
import {
  buildRoutes,
  generate,
  listModels,
  listProviders,
  type LlmAttempt,
  type LlmRoute,
  type LlmRuntimeLike,
} from '../llm/client.js';
import { readJsonSafe, writeJsonAtomic } from '../util/fs.js';
import { expandHome } from '../util/paths.js';

/** 送进 prompt 的正文片段上限（一次几条 × 几百字，prompt 仍是可控的小文件）。 */
export const EXCERPT_CHARS = 600;
/** 名字长度上限（`fileNameOf` 还会再做一次文件系统安全处理）。 */
export const TITLE_MAX = 40;
/** 每篇最多几个标签。 */
export const TAGS_MAX = 8;

export interface OrganizeDeps {
  config: Config;
  retitle: RetitleService;
  /**
   * 会话整理服务（作用域一的**落盘**端）：组合 markdown + 写笔记 + 写条目 + 建边 + 重建索引。
   *
   * 传进来的是完整服务而不是回调：`compose()` 也被用来出**预览**（纯函数、不落盘），
   * 于是「预览看到的」与「落地写下的」从构造上就是同一份 —— 不会预览一套、落地另一套。
   */
  digest: DigestService;
  /**
   * 作用域一的**输入**：本会话已沉淀进知识库的问答。
   *
   * 为什么是注入的函数而不是直接拿 `KnowledgeService`：这一层要的是「一场会话的沉淀」这一个
   * 切面（含「`sessionId` 传空串时挑最近有沉淀的那一场」这条策略），把它留在 `index.ts`
   * 的装配处，本模块就能用一个假函数把作用域一测干净（不必造一个知识库）。
   */
  sessionItems: (sessionId: string) => Promise<{ sessionId: string; items: DigestSourceItem[] }>;
  /**
   * 宿主 LLM 面 —— **每次现取**（懒取），不是装载时抓一份快照。
   *
   * 为什么是函数（2026-10-17 实测 + 上游源码两条证据）：
   *   ① `mount-diag.json`：直接读 `ctx.webServer` 抛「cannot get property … without inject」，
   *      而 `inject` 本身是 function ⇒ **未声明的服务裸读会抛**；
   *   ② `vendor/cordis/src/reflect.ts` 的 get 代理逐级向上找 `fiber.store[prop]`，
   *      isolate key 对不上就直接抛；只有**声明过**的服务才走 accessor 那条路；
   *   ③ 宿主自己的插件**无一例外**都写在 `inject` 里（`llm-pi-ai` 的 `inject = ['llm']`、
   *      `agent-loop` 的 static inject 含 `'llm'` …）。
   * ⇒ 真宿主上只能经 `ctx.inject(['llm'])` 拿，而那个回调**可能在装载之后**才兑现。
   * 抓一份快照，就会把「稍后才可用的 llm」永久记成 `null`（整条自动整理路静默死掉）。
   */
  runtime: () => LlmRuntimeLike | null;
  /** 宿主默认选路（`ctx.agentDefaultModel`）。`provider` / `model` 留空时才用。 */
  defaultRoute?: () => unknown;
  logger?: { warn?: (...args: unknown[]) => void; debug?: (...args: unknown[]) => void };
  at?: () => number;
  /** 建议文件路径；默认 `<dataRoot>/organize-proposals.json`。 */
  proposalsPath?: string;
  /** 会话整理草稿文件路径；默认 `<dataRoot>/organize-digest.json`。 */
  digestPath?: string;
}

/** 一条改名建议（`apply()` 直接吃它）。 */
export interface RetitleProposal {
  id: string;
  /** 现在的文件名（给人看「从哪改到哪」）。 */
  file: string;
  title: string;
  tags: string[];
  /** 原问句，一并回带便于人核对。 */
  ask: string;
}

/** `routes` 是怎么来的：显式配的 / 宿主的默认选路 / 一个都没有。 */
export type OrganizeRouteSource = 'config' | 'host-default' | 'none';

export interface OrganizeStatus {
  enabled: boolean;
  scopes: { digest: boolean; retitle: boolean };
  routes: LlmRoute[];
  routeSource: OrganizeRouteSource;
  llmAvailable: boolean;
  everyTurns: number;
  autoApply: boolean;
}

/** 宿主注册的一个 provider 及其模型（设置页下拉框的数据源）。 */
export interface OrganizeProviderCatalog {
  id: string;
  /** 显示名（`displayName`），没给就是 id。 */
  name: string;
  models: Array<{ id: string; name: string }>;
}

/**
 * 可选模型清单 —— **直接来自宿主注册表**（`ctx.llm.listProviders()` + `listModels()`）。
 *
 * 这里刻意不维护自己的白名单：用户自定义的 provider（`apiBaseURL` 指向自建服务的，
 * 如 profile 里的 `agnes`）与官方 provider 在宿主里是同一份注册表，所以
 * 「设置页能选 agnes」这件事**不需要插件做任何特判** —— 列出来就有了。
 * 插件也不碰密钥：只报 `provider` / `model`，密钥与地址由宿主适配器解析。
 */
export interface OrganizeCatalog {
  /** 全部 provider，含用户自定义的（空数组 = 宿主没装 `llm` 服务）。 */
  providers: OrganizeProviderCatalog[];
  /** 此刻若打开自动整理，会按序尝试的路。 */
  routes: LlmRoute[];
  routeSource: OrganizeRouteSource;
  llmAvailable: boolean;
}

export interface OrganizePreview {
  ok: boolean;
  scope: 'retitle';
  enabled: boolean;
  /** 本次实际按序尝试的路（自动切换的顺序证据）。 */
  routes: LlmRoute[];
  attempts: LlmAttempt[];
  proposals: RetitleProposal[];
  /** 送进 prompt 的候选数。 */
  considered: number;
  /** 模型给了但没被采纳的条数（id 对不上 / 名字为空）。 */
  dropped: number;
  reason: string;
  /** 解析失败时带回一小段模型原话，便于当场看出「它没按格式回」。 */
  raw?: string;
}

/**
 * **作用域一（会话整理）**的预览：模型整理出的草稿 + 组合好的 markdown。
 *
 * `markdown` 是 `DigestService.compose()` 的产物 —— **纯函数、不落盘**，所以给人看这份预览
 * 与真落地写下的那份是同一份（不会「预览一套、落地另一套」）。
 */
export interface DigestPreview {
  ok: boolean;
  scope: 'digest';
  enabled: boolean;
  /** 本次实际按序尝试的路（自动切换的顺序证据）。 */
  routes: LlmRoute[];
  attempts: LlmAttempt[];
  /** 实际整理的那一场会话（`sessionId` 传空串时由插件挑「最近有沉淀的那一场」）。 */
  sessionId: string;
  sessionIdSource: 'explicit' | 'latest-captured';
  /** 送进 prompt 的沉淀条数。 */
  considered: number;
  draft: DigestDraft | null;
  markdown: string;
  /** 写进整理件「关联知识」的源笔记标题（`[[…]]` 互链）。 */
  links: string[];
  reason: string;
  /** 解析失败时带回一小段模型原话。 */
  raw?: string;
}

/** 自动路径里「作用域一」这一次的结果（与作用域二分开报，两种失败不互相淹没）。 */
export interface DigestAutoResult {
  ran: boolean;
  reason: string;
  preview?: DigestPreview;
  applied?: boolean;
  saved?: {
    id: string;
    notePath: string;
    itemId: string;
    title: string;
    sections: number;
    entities: number;
  };
}

export interface OrganizeAutoResult {
  at: number;
  ran: boolean;
  /** 作用域二的结论（作用域二没跑时，回落成作用域一的结论）。 */
  reason: string;
  preview?: OrganizePreview;
  applied?: boolean;
  results?: RetitleResult[];
  /** 作用域一这一次的结果（`organize.digest` 关着时没有这个字段）。 */
  digest?: DigestAutoResult;
}

export interface OrganizeService {
  status(): OrganizeStatus;
  /** 宿主可选的 provider/模型清单 + 当前生效选路（**本地注册表读取，不发请求**）。 */
  catalog(): Promise<OrganizeCatalog>;
  /** 只读：拿一批候选给模型要建议。**不写知识库。** */
  preview(limit?: number): Promise<OrganizePreview>;
  /** 落地一批建议（走 `RetitleService.apply`，`named_by` 记 `'model'`）。 */
  apply(proposals: readonly RetitleProposal[]): Promise<{ results: RetitleResult[]; index: { path: string; count: number } | null }>;
  /**
   * 作用域一：让模型把**本会话已沉淀的问答**整理成一页会话整理。
   *
   * **只读知识库**（组合结果只回给调用方），但成功时会把草稿写进 `<dataRoot>/organize-digest.json`
   * —— 与作用域二只有自动路径落盘的差别是**刻意的**：改名建议是一份「可能被模型回抄的清单」，
   * 而整理草稿是一整份文档，手动路径（工具）落地时必须有个地方读回来。
   */
  previewDigest(sessionId?: string): Promise<DigestPreview>;
  /** 落地一份会话整理草稿（`DigestService.save`：笔记 + 条目 + 建边 + 索引重建）。 */
  applyDigest(draft: DigestDraft, sessionId: string): Promise<DigestResult>;
  /** 读回**最后一份可用**的会话整理草稿（工具 `apply scope:"digest"` 吃它）。 */
  readDigestProposal(): Promise<{ at: number | null; sessionId: string; draft: DigestDraft | null }>;
  /** 触发闸门：告诉它「又过了一轮」。到点才跑，返回 `null` 表示这次没跑。 */
  onTurn(input: { sessionId: string; at: number }): Promise<OrganizeAutoResult | null>;
  /** 上一次自动整理的结果（无则 `null`）。 */
  lastAuto(): OrganizeAutoResult | null;
  /** 读回建议文件（面板/工具「看上次产出」。 */
  readProposals(): Promise<{ at: number | null; proposals: RetitleProposal[] }>;
}

/** 提示词：给模型一批候选，要一份 JSON 数组回来。 */
export function buildRetitlePrompt(
  notes: ReadonlyArray<{ id: string; file: string; topic: string; ask: string; text: string }>,
): { system: string; prompt: string } {
  const system = [
    '你是中文知识库的整理助手：给一批笔记起「一眼看出讲了什么」的名字，并补标签。',
    '只输出一个 JSON 数组，不要解释、不要 Markdown 代码块围栏、不要多余文字。',
  ].join('\n');
  const blocks = notes.map((n) => {
    const lines = ['### id=' + n.id + ' | 现名：' + n.file];
    if (n.topic !== '') lines.push('主题：' + n.topic);
    if (n.ask !== '') lines.push('当初的提问：' + n.ask);
    if (n.text !== '') lines.push('内容片段：' + n.text);
    return lines.join('\n');
  });
  const prompt = [
    '下面是一个知识库里的一批笔记。请**为每一篇**给出名字与标签，输出 JSON 数组：',
    '',
    '[{"id":"<原样回抄>","title":"<名字>","tags":["标签1","标签2"]}]',
    '',
    '规则：',
    '- `id` 必须**原样回抄**，不得改写、不得漏字。',
    '- `title` 用中文说清这篇讲了什么；不要用「问句的简写」，不要带 `.md` 后缀或 `#`，不超过 ' + TITLE_MAX + ' 个字。',
    '- `tags` 给 2-' + TAGS_MAX + ' 个短标签（中文或小写英文），取内容里的关键词。',
    '- **看不懂内容的笔记就跳过**（不要输出它的条目），不要凭空编。',
    '',
    '笔记：',
    blocks.join('\n\n'),
  ].join('\n');
  return { system, prompt };
}

function cleanTitle(input: unknown): string {
  if (typeof input !== 'string') return '';
  // 顺序有讲究：先压空白并 trim，再剥开头的 `#`，最后才剥 `.md` ——
  // 反过来的话 `"  # 逐包.md "` 里那个 `.md` 落在**末尾之外**（后面还有空格），剥不掉。
  return input
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[#\s]+/, '')
    .replace(/\.md$/i, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TITLE_MAX)
    .trim();
}

function cleanTags(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[,，\s]+/) : [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item.replace(/^#/, '').replace(/\s+/g, '').trim();
    if (tag === '' || tag.length > 24) continue;
    if (out.includes(tag)) continue;
    out.push(tag);
    if (out.length >= TAGS_MAX) break;
  }
  return out;
}

/** 去掉围栏、取第一个 `[` 到最后一个 `]`。 */
function sliceJsonArray(text: string): string | null {
  const bare = text.replace(/```[a-zA-Z]*\s*/g, '').replace(/```/g, '').trim();
  const start = bare.indexOf('[');
  const end = bare.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  return bare.slice(start, end + 1);
}

/**
 * 容错解析模型回话。
 *
 * 三级降级（实测里模型三种毛病都犯过）：整段 JSON → 去掉围栏后的数组 →
 * 逐个 `{...}` 抠（漏了逗号/多说了几句话时还能救回一部分）。
 * 解析不出来的条目一律丢，并把丢掉的条数报出去 —— 「模型回了个空」与
 * 「模型回了但名字没用」是两种完全不同的故障，不能混成一个。
 */
export function parseProposals(
  text: string,
  allowed: ReadonlySet<string>,
): { proposals: Array<{ id: string; title: string; tags: string[] }>; dropped: number } {
  const candidates: unknown[] = [];
  const sliced = sliceJsonArray(text);
  let parsed = false;
  if (sliced !== null) {
    try {
      const value = JSON.parse(sliced) as unknown;
      if (Array.isArray(value)) {
        candidates.push(...value);
        parsed = true;
      }
    } catch {
      parsed = false;
    }
  }
  if (!parsed) {
    // 救回模式：逐个对象抠出来单独 parse。
    const matches = text.match(/\{[^{}]*\}/g) ?? [];
    for (const m of matches) {
      try {
        candidates.push(JSON.parse(m) as unknown);
      } catch {
        // 单条坏掉不影响其他条。
      }
    }
  }

  const proposals: Array<{ id: string; title: string; tags: string[] }> = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const item of candidates) {
    if (item === null || typeof item !== 'object') {
      dropped += 1;
      continue;
    }
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const title = cleanTitle(rec.title);
    if (id === '' || !allowed.has(id) || title === '' || seen.has(id)) {
      dropped += 1;
      continue;
    }
    seen.add(id);
    proposals.push({ id, title, tags: cleanTags(rec.tags) });
  }
  return { proposals, dropped };
}

/** 取一篇笔记的正文片段（比 `NoteRef.excerpt` 的 80 字长，起名才看得清内容）。 */
async function richExcerpt(path: string): Promise<string> {
  const raw = await readFile(path, 'utf8').catch(() => '');
  if (raw === '') return '';
  return contentSection(parseNote(raw).body).replace(/\s+/g, ' ').slice(0, EXCERPT_CHARS);
}

function asRoute(value: unknown): LlmRoute | null {
  if (value === null || typeof value !== 'object') return null;
  const rec = value as { provider?: unknown; model?: unknown };
  const provider = typeof rec.provider === 'string' ? rec.provider : '';
  const model = typeof rec.model === 'string' ? rec.model : '';
  if (provider === '' || model === '') return null;
  return { provider, model };
}

export function createOrganizeService(deps: OrganizeDeps): OrganizeService {
  const cfg: OrganizeConfig = deps.config.organize;
  const at = deps.at ?? (() => Date.now());
  const proposalsPath = deps.proposalsPath ?? join(expandHome(deps.config.dataRoot), 'organize-proposals.json');
  const digestPath = deps.digestPath ?? join(expandHome(deps.config.dataRoot), 'organize-digest.json');
  /** 宿主 LLM 面：**每次现取**（`ctx.inject` 的回调可能装载后才兑现，见 `OrganizeDeps.runtime`）。 */
  const runtimeNow = deps.runtime;
  /** 宿主默认选路的缓存：`status()` 是同步的，不能在那里 await。 */
  let cachedDefault: LlmRoute | null = null;
  let lastAuto: OrganizeAutoResult | null = null;
  /** 每个会话的轮次计数（触发闸门用）。 */
  const turns = new Map<string, number>();
  let lastRunAt = 0;

  function routesNow(): LlmRoute[] {
    const explicit = buildRoutes({ provider: cfg.provider, model: cfg.model }, cfg.fallbacks);
    // 主路为空时才补宿主默认选路；显式配了就不猜（不然「我明明配了 A，怎么跑的是 B」）。
    if (cfg.provider !== '' && cfg.model !== '') return explicit;
    if (cachedDefault === null) return explicit;
    if (explicit.some((r) => r.provider === cachedDefault?.provider && r.model === cachedDefault?.model)) {
      return explicit;
    }
    return [...explicit, cachedDefault];
  }

  async function resolveDefaultRoute(): Promise<void> {
    if (cachedDefault !== null || !deps.defaultRoute) return;
    try {
      const selection = await Promise.resolve(deps.defaultRoute());
      cachedDefault = asRoute(selection);
    } catch {
      cachedDefault = null;
    }
  }

  /**
   * 同步解析宿主默认选路。
   *
   * `status()` 是同步面，不能 await —— 但宿主 `agentDefaultModel.currentSelection()`
   * **本身就是同步函数**，所以直连返回值就够。真碰上回 Promise 的宿主，这里**不猜**：
   * 保持 `null`，交给 `catalog()` / `preview()` 里那条 `await` 的路去解析。
   */
  function syncDefaultRoute(): void {
    if (cachedDefault !== null || !deps.defaultRoute) return;
    if (cfg.provider !== '' && cfg.model !== '') return;
    try {
      const value = deps.defaultRoute();
      if (value !== null && typeof value === 'object' && typeof (value as { then?: unknown }).then !== 'function') {
        cachedDefault = asRoute(value);
      }
    } catch {
      cachedDefault = null;
    }
  }

  function routeSourceOf(): OrganizeRouteSource {
    if (cfg.provider !== '' && cfg.model !== '') return 'config';
    return routesNow().length > 0 ? 'host-default' : 'none';
  }

  const status = (): OrganizeStatus => {
    // 先同步解析宿主默认选路：关着的时候也要能答「打开会用哪条」，不能等某次 preview 之后才有。
    syncDefaultRoute();
    return {
      enabled: cfg.enabled,
      scopes: { digest: cfg.digest, retitle: cfg.retitle },
      routes: routesNow(),
      routeSource: routeSourceOf(),
      llmAvailable: runtimeNow() !== null,
      everyTurns: cfg.everyTurns,
      autoApply: cfg.autoApply,
    };
  };

  /**
   * 列宿主可选模型。**只读注册表、不发请求**（`listProviders` 是同步注册表读取，
   * `listModels` 对配置式 provider 也是读配置）—— 所以它可以在「关着」的时候随便调。
   *
   * `listModels` 是异步的（宿主签名如此），所以本方法也异步。
   */
  const catalog = async (): Promise<OrganizeCatalog> => {
    const runtime = runtimeNow();
    const providers: OrganizeProviderCatalog[] = [];
    for (const p of listProviders(runtime)) {
      if (p.id === '') continue;
      const models = await listModels(runtime, p.id);
      providers.push({
        id: p.id,
        name: p.name !== undefined && p.name !== '' ? p.name : p.id,
        models: models
          .filter((m) => m.id !== '')
          .map((m) => ({ id: m.id, name: m.name !== undefined && m.name !== '' ? m.name : m.id })),
      });
    }
    await resolveDefaultRoute();
    return {
      providers,
      routes: routesNow(),
      routeSource: routeSourceOf(),
      llmAvailable: runtime !== null,
    };
  };

  const preview = async (limit?: number): Promise<OrganizePreview> => {
      const base: OrganizePreview = {
        ok: false,
        scope: 'retitle',
        enabled: cfg.enabled,
        routes: [],
        attempts: [],
        proposals: [],
        considered: 0,
        dropped: 0,
        reason: '',
      };
      // ① 零请求保证：关着就到此为止，不构造 prompt、不碰 runtime。
      if (!cfg.enabled) {
        return { ...base, reason: 'organize.enabled is false —— 自动整理没开，未发出任何请求' };
      }
      const runtime = runtimeNow();
      if (!runtime) {
        return { ...base, reason: '宿主没有 llm 服务（ctx.llm 不可用）' };
      }
      await resolveDefaultRoute();
      const routes = routesNow();
      if (routes.length === 0) {
        return { ...base, routes, reason: '没选出模型：organize.provider/model 为空，且宿主默认选路也拿不到' };
      }

      const want = limit && limit > 0 ? limit : cfg.batchSize;
      const notes: NoteRef[] = await deps.retitle.list(want);
      if (notes.length === 0) {
        return { ...base, routes, reason: '没有候选笔记（`01_问答沉淀` 里没有带 oblivion 标记的笔记）' };
      }
      const enriched = await Promise.all(
        notes.map(async (n) => ({
          id: n.id,
          file: n.file,
          topic: n.topic,
          ask: n.ask,
          text: await richExcerpt(n.path),
        })),
      );
      const allowed = new Set(notes.map((n) => n.id));
      const { system, prompt } = buildRetitlePrompt(enriched);
      const result = await generate(runtime, routes, { prompt, system }, {
        maxTokens: cfg.maxTokens,
        timeoutMs: cfg.timeoutMs,
        purpose: 'oblivion-organize:retitle',
      });
      if (!result.ok) {
        return {
          ...base,
          routes,
          attempts: result.attempts,
          considered: notes.length,
          reason: '所有路都失败了：' + String(result.error ?? 'unknown'),
        };
      }
      const { proposals, dropped } = parseProposals(result.text, allowed);
      const byId = new Map(notes.map((n) => [n.id, n]));
      const full: RetitleProposal[] = proposals.map((p) => ({
        id: p.id,
        file: byId.get(p.id)?.file ?? '',
        title: p.title,
        tags: p.tags,
        ask: byId.get(p.id)?.ask ?? '',
      }));
      return {
        ok: full.length > 0,
        scope: 'retitle',
        enabled: true,
        routes,
        attempts: result.attempts,
        proposals: full,
        considered: notes.length,
        dropped,
        reason: full.length > 0 ? '' : '模型没给出可用建议（解析结果为空）',
        raw: full.length > 0 ? undefined : result.text.slice(0, 400),
      };
  };

  const apply = async (
    proposals: readonly RetitleProposal[],
  ): Promise<{ results: RetitleResult[]; index: { path: string; count: number } | null }> => {
    return deps.retitle.apply(
      proposals.map((p) => ({
        id: p.id,
        title: p.title,
        tags: p.tags.length > 0 ? p.tags : undefined,
        namedBy: 'model',
      })),
    );
  };

  /**
   * **作用域一（会话整理）**：让模型把「本会话已沉淀的问答」整理成一页。
   *
   * 三层闸门与 `preview()` 同形（零请求保证、选路、内容），差别只有「输入从哪来」：
   * 那里是知识库里的**存量笔记**（要起名），这里是**本会话的沉淀条目**（要成文）。
   *
   * 落地是 `applyDigest()` 的事；这里只**读**知识库 + 组合 markdown（`compose` 是纯函数）。
   */
  const previewDigest = async (sessionIdArg?: string): Promise<DigestPreview> => {
    const wanted = sessionIdArg ?? '';
    const base: DigestPreview = {
      ok: false,
      scope: 'digest',
      enabled: cfg.enabled,
      routes: [],
      attempts: [],
      sessionId: wanted,
      sessionIdSource: wanted === '' ? 'latest-captured' : 'explicit',
      considered: 0,
      draft: null,
      markdown: '',
      links: [],
      reason: '',
    };
    // ① 零请求保证：总开关关着，或作用域一没开 —— 都到此为止，不构造 prompt、不碰 runtime。
    if (!cfg.enabled) {
      return { ...base, reason: 'organize.enabled is false —— 自动整理没开，未发出任何请求' };
    }
    if (!cfg.digest) {
      return { ...base, reason: 'organize.digest is false —— 作用域一（会话整理）没开，未发出任何请求' };
    }
    const runtime = runtimeNow();
    if (!runtime) {
      return { ...base, reason: '宿主没有 llm 服务（ctx.llm 不可用）' };
    }
    await resolveDefaultRoute();
    const routes = routesNow();
    if (routes.length === 0) {
      return { ...base, routes, reason: '没选出模型：organize.provider/model 为空，且宿主默认选路也拿不到' };
    }

    const picked = await deps.sessionItems(wanted);
    if (picked.items.length === 0) {
      return {
        ...base,
        routes,
        sessionId: picked.sessionId,
        reason:
          picked.sessionId === ''
            ? '知识库里还没有任何会话沉淀（没有带 `#turn-` 来源的条目）—— 没有可整理的内容'
            : '这场会话还没有沉淀条目（`#turn-` 捕获为空）—— 没有可整理的内容',
      };
    }
    const items = picked.items.slice(-DIGEST_ITEMS_MAX);
    const { system, prompt } = buildDigestPrompt(items, picked.sessionId);
    const result = await generate(runtime, routes, { prompt, system }, {
      maxTokens: cfg.maxTokens,
      timeoutMs: cfg.timeoutMs,
      purpose: 'oblivion-organize:digest',
    });
    if (!result.ok) {
      return {
        ...base,
        routes,
        sessionId: picked.sessionId,
        attempts: result.attempts,
        considered: items.length,
        reason: '所有路都失败了：' + String(result.error ?? 'unknown'),
      };
    }
    const parsed = parseDigestDraft(result.text);
    if (parsed.draft === null) {
      return {
        ...base,
        routes,
        sessionId: picked.sessionId,
        attempts: result.attempts,
        considered: items.length,
        reason: '模型回话解析失败：' + parsed.error,
        raw: parsed.raw,
      };
    }
    const links = items
      .map((item) => item.title)
      .filter((title) => title !== '')
      .slice(0, 12);
    const composed = deps.digest.compose({ ...parsed.draft, sessionId: picked.sessionId, links }, at());
    // 成功才落草稿文件：**失败不覆盖上一份可用草稿**（一次限流/一次解析失败
    // 不该把上一次能用的东西擦掉 —— 这跟 diag 的覆盖式落盘是同一个取舍的正反面）。
    await writeJsonAtomic(digestPath, {
      at: at(),
      sessionId: picked.sessionId,
      routes,
      attempts: result.attempts,
      considered: items.length,
      draft: parsed.draft,
    }).catch(() => undefined);
    return {
      ok: true,
      scope: 'digest',
      enabled: true,
      routes,
      attempts: result.attempts,
      sessionId: picked.sessionId,
      sessionIdSource: base.sessionIdSource,
      considered: items.length,
      draft: parsed.draft,
      markdown: composed.markdown,
      links,
      reason: '',
    };
  };

  const applyDigest = async (draft: DigestDraft, sessionId: string): Promise<DigestResult> => {
    const picked = await deps.sessionItems(sessionId);
    const links = picked.items
      .map((item) => item.title)
      .filter((title) => title !== '')
      .slice(0, 12);
    return deps.digest.save({ ...draft, sessionId: picked.sessionId, links });
  };

  const readDigestProposal = async (): Promise<{ at: number | null; sessionId: string; draft: DigestDraft | null }> => {
    const stored = await readJsonSafe<{ at?: unknown; sessionId?: unknown; draft?: unknown }>(digestPath);
    if (!stored || stored.draft === null || typeof stored.draft !== 'object') {
      return { at: null, sessionId: '', draft: null };
    }
    // 走同一个解析器：文件是我们自己写的，但它也可能被人手改过 ——
    // 脏值不该从这里溜进落盘（`parseDigestDraft` 会把不合规的都清掉）。
    const reparsed = parseDigestDraft(JSON.stringify(stored.draft));
    return {
      at: typeof stored.at === 'number' ? stored.at : null,
      sessionId: typeof stored.sessionId === 'string' ? stored.sessionId : '',
      draft: reparsed.draft,
    };
  };

  /**
   * 触发闸门：每 `everyTurns` 轮跑一次，两个作用域**各自独立**跑与报。
   *
   * 为什么不是「一起跑、一起报」：作用域二（改存量笔记名）与作用域一（写一页会话整理）
   * 的失败原因完全不同（一个是模型没按清单回，一个是模型没按文档回）。混成一个 `reason`
   * 就会出现「明明只坏了 A，却看着像两个都坏了」—— 所以 `digest` 单独一个字段报。
   *
   * `turn/end` 那边是 `void onTurn(...)`（fire-and-forget），且 `qa-loop` 的捕获本身也是
   * fire-and-forget ⇒ 本轮刚沉淀的那一条**可能还没进索引**。这不影响正确性（下一拍就看到），
   * 但决定了作用域一看到的是「到此刻为止的沉淀」。
   */
  const onTurn = async (input: { sessionId: string; at: number }): Promise<OrganizeAutoResult | null> => {
    // 两个作用域都关着 ⇒ 连轮次都不必数（保持「不开=零动作」这条可验证的性质）。
    if (!cfg.enabled || (!cfg.retitle && !cfg.digest) || cfg.everyTurns <= 0) return null;
    const count = (turns.get(input.sessionId) ?? 0) + 1;
    turns.set(input.sessionId, count);
    if (count % cfg.everyTurns !== 0) return null;
    if (input.at - lastRunAt < cfg.minIntervalMs) {
      return { at: input.at, ran: false, reason: '距上次自动整理不足 minIntervalMs，跳过' };
    }
    lastRunAt = input.at;

    const auto: OrganizeAutoResult = { at: input.at, ran: true, reason: '' };

    // ── 作用域二：存量笔记的标题/标签 ───────────────────────────────────────────
    if (cfg.retitle) {
      let produced: OrganizePreview | null = null;
      try {
        produced = await preview();
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        deps.logger?.warn?.('oblivion organize 自动产出建议失败：%s', reason);
        auto.reason = 'preview threw: ' + reason;
      }
      if (produced !== null) {
        // 建议先落盘 —— 无论 autoApply 与否，人/面板都看得到这一轮产出了什么。
        await writeJsonAtomic(proposalsPath, {
          at: input.at,
          sessionId: input.sessionId,
          routes: produced.routes,
          attempts: produced.attempts,
          proposals: produced.proposals,
        }).catch(() => undefined);
        auto.reason = produced.reason;
        auto.preview = produced;
        if (produced.ok && cfg.autoApply && produced.proposals.length > 0) {
          try {
            const { results } = await apply(produced.proposals);
            auto.applied = true;
            auto.results = results;
          } catch (error: unknown) {
            auto.reason = 'apply failed: ' + (error instanceof Error ? error.message : String(error));
          }
        }
      }
    }

    // ── 作用域一：本会话的沉淀 → 一页会话整理 ───────────────────────────────────
    if (cfg.digest) {
      const digestAuto: DigestAutoResult = { ran: true, reason: '' };
      let produced: DigestPreview | null = null;
      try {
        produced = await previewDigest(input.sessionId);
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        deps.logger?.warn?.('oblivion organize 自动产出会话整理失败：%s', reason);
        digestAuto.reason = 'preview threw: ' + reason;
      }
      if (produced !== null) {
        digestAuto.reason = produced.reason;
        digestAuto.preview = produced;
        // 草稿文件由 `previewDigest` 在成功时写入（见那里的取舍说明），这里不重复写。
        if (produced.ok && produced.draft !== null && cfg.autoApply) {
          try {
            const saved = await applyDigest(produced.draft, produced.sessionId);
            digestAuto.applied = true;
            digestAuto.saved = {
              id: saved.id,
              notePath: saved.notePath,
              itemId: saved.itemId,
              title: saved.title,
              sections: saved.sections,
              entities: saved.entities,
            };
          } catch (error: unknown) {
            digestAuto.reason = 'apply failed: ' + (error instanceof Error ? error.message : String(error));
          }
        }
      }
      auto.digest = digestAuto;
      // 作用域二没跑（关着或没产出结论）时，顶层 reason 回落成作用域一的结论。
      if (auto.reason === '') auto.reason = digestAuto.reason;
    }

    lastAuto = auto;
    return auto;
  };

  const readProposals = async (): Promise<{ at: number | null; proposals: RetitleProposal[] }> => {
    const stored = await readJsonSafe<{ at?: unknown; proposals?: unknown }>(proposalsPath);
    if (!stored || !Array.isArray(stored.proposals)) return { at: null, proposals: [] };
    const proposals: RetitleProposal[] = [];
    for (const item of stored.proposals) {
      if (item === null || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      if (typeof rec.id !== 'string' || typeof rec.title !== 'string') continue;
      proposals.push({
        id: rec.id,
        file: typeof rec.file === 'string' ? rec.file : '',
        title: rec.title,
        tags: cleanTags(rec.tags),
        ask: typeof rec.ask === 'string' ? rec.ask : '',
      });
    }
    return { at: typeof stored.at === 'number' ? stored.at : null, proposals };
  };

  return {
    status,
    catalog,
    preview,
    apply,
    previewDigest,
    applyDigest,
    readDigestProposal,
    onTurn,
    lastAuto: () => lastAuto,
    readProposals,
  };
}
