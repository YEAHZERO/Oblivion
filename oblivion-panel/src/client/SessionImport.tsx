/**
 * 面板内的「导入 DSH 会话」：列可导入会话 → 勾选 → 预览/确认导入 → 提示结果。
 *
 * 机制全部在宿主半边（`@oblivion/core` 的 `GET /oblivion-core/sessions` 与
 * `POST /oblivion-core/sessions/import`）：扫 `~/.dsh/sessions`、按 ref 去重、
 * 写知识库。这里**只做展示与触发**（与「重启 / 检查更新」同一条纪律）。
 *
 * 安全边界：导入走 **confirm 双门**——默认 dry-run 只回预览，`confirm: true` 才落盘。
 * 外部调用方被 `isTrustedCaller` 挡住（403）。
 */
import { useCallback, useState } from 'react';
import type { JSX } from 'react';

/** 与 `@oblivion/core` 的路径常量保持一致。 */
const SESSIONS_PATH = '/oblivion-core/sessions';
const IMPORT_PATH = '/oblivion-core/sessions/import';

interface SessionItem {
  sessionId: string;
  title: string;
  goal: string;
  turnCount: number;
  qaCount: number;
  sizeKb: number;
  lastTime: number;
}

type Phase = 'idle' | 'scanning' | 'listing' | 'previewing' | 'importing' | 'done' | 'error';

const BTN = {
  border: '1px solid rgba(127,127,127,0.35)',
  borderRadius: 5,
  background: 'transparent',
  cursor: 'pointer',
  padding: '2px 8px',
  fontSize: 11,
} as const;

export function SessionImportControl(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle');
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');

  const scan = useCallback(async (): Promise<void> => {
    setPhase('scanning');
    setMessage('');
    try {
      const response = await fetch(SESSIONS_PATH, {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; count?: number; sessions?: SessionItem[]; error?: string }
        | null;
      if (!response.ok || body?.ok !== true) {
        setPhase('error');
        setMessage(`扫描失败：${body?.error ?? `HTTP ${response.status}`}`);
        return;
      }
      const list = body.sessions ?? [];
      setSessions(list);
      setSelected(new Set(list.map((s) => s.sessionId)));
      setPhase(list.length > 0 ? 'listing' : 'done');
      if (list.length === 0) setMessage('没有可导入的 DSH 会话。');
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  /** 预览（dry-run）：看将要导入哪些轮次，不写盘。 */
  const preview = useCallback(async (): Promise<void> => {
    const ids = [...selected];
    if (ids.length === 0) {
      setMessage('没有勾选任何会话。');
      return;
    }
    setPhase('previewing');
    setMessage('');
    try {
      const response = await fetch(IMPORT_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionIds: ids, dry_run: true }),
        credentials: 'same-origin',
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; dryRun?: boolean; error?: string }
        | null;
      if (!response.ok || body?.ok !== true) {
        setPhase('error');
        setMessage(`预览失败：${body?.error ?? `HTTP ${response.status}`}`);
        return;
      }
      setPhase('listing');
      setMessage('已预览（未写入）。点「确认导入」才会落盘。');
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [selected]);

  /** 确认导入（confirm: true）：真正写入知识库。 */
  const confirmImport = useCallback(async (): Promise<void> => {
    const ids = [...selected];
    if (ids.length === 0) {
      setMessage('没有勾选任何会话。');
      return;
    }
    setPhase('importing');
    setMessage('');
    try {
      const response = await fetch(IMPORT_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionIds: ids, confirm: true, mode: 'qa' }),
        credentials: 'same-origin',
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; imported?: number; skipped?: number; failures?: Array<{ turn: number; error: string }>; error?: string }
        | null;
      if (!response.ok || body?.ok !== true) {
        setPhase('error');
        setMessage(`导入失败：${body?.error ?? `HTTP ${response.status}`}`);
        return;
      }
      const imported = body.imported ?? 0;
      const skipped = body.skipped ?? 0;
      const failures = body.failures?.length ?? 0;
      setPhase('done');
      setMessage(
        `已导入 ${imported} 条，跳过 ${skipped} 条${failures > 0 ? `，失败 ${failures} 条` : ''}。刷新面板可见。`,
      );
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [selected]);

  const toggle = (id: string): void => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const busy = phase === 'scanning' || phase === 'previewing' || phase === 'importing';

  return (
    <>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          style={{ ...BTN, cursor: busy ? 'default' : 'pointer' }}
          disabled={busy}
          onClick={() => {
            void scan();
          }}
        >
          {phase === 'scanning' ? '正在扫描…' : '导入 DSH 会话'}
        </button>
        {phase === 'listing' ? (
          <>
            <button
              type="button"
              style={{ ...BTN, cursor: busy ? 'default' : 'pointer' }}
              disabled={busy}
              onClick={() => {
                void preview();
              }}
            >
              预览
            </button>
            <button
              type="button"
              style={{
                ...BTN,
                cursor: busy ? 'default' : 'pointer',
                background: '#2d6cdf',
                border: '1px solid #2d6cdf',
                color: '#fff',
              }}
              disabled={busy}
              onClick={() => {
                void confirmImport();
              }}
            >
              确认导入
            </button>
          </>
        ) : null}
        {message !== '' ? <span style={{ fontSize: 11, opacity: 0.75 }}>{message}</span> : null}
      </span>
      {phase === 'listing' ? (
        <div
          data-obl-session-dialog=""
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483000,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="可导入的 DSH 会话"
            style={{
              width: 460,
              maxWidth: 'calc(100vw - 48px)',
              background: '#ffffff',
              color: '#1a1a1a',
              borderRadius: 8,
              boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
              padding: '18px 20px 16px',
              fontFamily: 'system-ui, "Segoe UI", sans-serif',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
              可导入的 DSH 会话（{String(sessions.length)}）
            </div>
            <div style={{ maxHeight: 260, overflow: 'auto', fontSize: 12, lineHeight: '1.8' }}>
              {sessions.map((s) => (
                <label key={s.sessionId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(s.sessionId)}
                    onChange={() => {
                      toggle(s.sessionId);
                    }}
                  />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.title}
                  </span>
                  <span style={{ opacity: 0.7, whiteSpace: 'nowrap' }}>
                    {s.qaCount} QA · {s.sizeKb}KB
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                type="button"
                style={{ ...BTN, padding: '4px 16px', fontSize: 12, borderRadius: 5 }}
                onClick={() => {
                  setPhase('idle');
                  setMessage('');
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
