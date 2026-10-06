/**
 * 「点一条知识库笔记 → 在侧边栏里打开」。
 *
 * 两条路，按顺序试（都能在 Node 里直接测，不依赖 React 与 DOM）：
 *
 *   ① **`service.openFile(scope, path)`** —— `dsh-better-sidebar@0.24.1` 的消费级 API
 *      （`lib/types/client/service.d.ts:586`，能力位 `'openFile'`）。它需要
 *      `SessionScope = { sessionId, cwd?, repoRoot? }`；侧栏 tab 组件从 `props.scope`
 *      拿到它（`TabComponentProps.scope`，`service.d.ts:126`），拿不到就问
 *      `getSnapshot().sessionId`（当前激活会话）。
 *   ② **宿主给的 `props.onOpenFile`** —— `TabComponentProps.onOpenFile?`
 *      （`service.d.ts:136`）是可选字段，外部 tab 不一定拿得到，所以只当退路。
 *
 * 返回值一律是可上报的字符串，便于在 `panel-client-diag.json` 里判定「点了没反应」卡在哪一步。
 */

/** 侧栏服务里我们用到的那一小部分（结构化类型，不依赖第三方类型包）。 */
export interface OpenFileCapable {
  openFile?(scope: { sessionId: string; cwd?: string }, path: string, title?: string): void;
  getSnapshot?(): { sessionId?: string } | undefined;
  /** 能力位列表（v0.12.0+，只增不减）：`'openFile'` 在其中才敢走 ①。 */
  features?: readonly string[];
}

export interface SessionScopeLike {
  sessionId?: string;
  cwd?: string;
}

export type OpenNoteOutcome =
  | 'opened'
  | 'opened-via-host-prop'
  | 'no-service'
  | 'no-session'
  | 'failed';

export interface OpenNoteInput {
  service?: OpenFileCapable | undefined;
  scope?: SessionScopeLike | undefined;
  path: string;
  /** 宿主（side bar）递给 tab 组件的退路。 */
  hostOpen?: ((path: string) => void) | undefined;
}

/** 服务自报支持 `openFile`（能力位缺失时按支持处理：老版本没有 `features`）。 */
function supportsOpenFile(service: OpenFileCapable | undefined): boolean {
  if (!service || typeof service.openFile !== 'function') return false;
  if (!Array.isArray(service.features)) return true;
  return service.features.includes('openFile');
}

/** 兜底拿会话作用域：`getSnapshot()` 的当前激活会话。读不动就算了，不抛。 */
function snapshotScope(service: OpenFileCapable | undefined): SessionScopeLike | undefined {
  try {
    const snapshot = service?.getSnapshot?.();
    const sessionId = snapshot?.sessionId;
    return typeof sessionId === 'string' && sessionId !== '' ? { sessionId } : undefined;
  } catch {
    return undefined;
  }
}

export function openNoteInSidebar(input: OpenNoteInput): OpenNoteOutcome {
  const { service, path, hostOpen } = input;
  const path_ = typeof path === 'string' ? path.trim() : '';
  if (path_ === '') return 'failed';

  const scope = input.scope?.sessionId ? input.scope : snapshotScope(service);
  if (supportsOpenFile(service) && scope?.sessionId) {
    try {
      service?.openFile?.({ sessionId: scope.sessionId, ...(scope.cwd ? { cwd: scope.cwd } : {}) }, path_);
      return 'opened';
    } catch {
      // 落到退路
    }
  }

  if (typeof hostOpen === 'function') {
    try {
      hostOpen(path_);
      return 'opened-via-host-prop';
    } catch {
      return 'failed';
    }
  }

  if (!service) return 'no-service';
  if (!scope?.sessionId) return 'no-session';
  return 'failed';
}
