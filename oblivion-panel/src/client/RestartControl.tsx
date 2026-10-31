/**
 * 面板内的两个宿主动作（拆成两个组件，便于排成一行）：
 *   - `RestartControl`：「重启 DSH」（POST /obl-brand/restart）
 *   - `OrphanControl`：「清理孤儿进程」（POST /obl-brand/orphans，不重启）
 *
 * 两者都**不在这里复制机制**：宿主只回计数与路径，文案在这里拼 —— 机制只有一份。
 * 降级：brand 未装/被停用时路由 404，这里给明确文案而不是静默失败。
 */

import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';

/** 与 `@oblivion/brand` 的 `RESTART_PATH` 保持一致。 */
const RESTART_PATH = '/obl-brand/restart';

/** 与 `@oblivion/brand` 的 `TASKS_PATH` 保持一致（GET，只读）。 */
const TASKS_PATH = '/obl-brand/tasks';

/** 与 `@oblivion/brand` 的 `RESTART_GATES_PATH` 保持一致（GET，只读；聚合详细 gate 信息）。 */
const RESTART_GATES_PATH = '/obl-brand/restart-gates';

/** 与 `@oblivion/brand` 的 `ORPHANS_PATH` 保持一致。 */
const ORPHANS_PATH = '/obl-brand/orphans';

type Phase = 'idle' | 'confirming' | 'sending' | 'done' | 'error';

const BTN: Record<Phase, string> = {
  idle: '重启 DSH',
  confirming: '确认退出',
  sending: '正在重启…',
  done: '已发出重启',
  error: '重试',
};

const SWEEP_BTN: Record<Phase, string> = {
  idle: '清理孤儿进程',
  confirming: '确认清理',
  sending: '正在清理…',
  done: '再清理一次',
  error: '重试',
};

/** 宿主回给浏览器的清扫报告（与 brand 的 `SweepReport` 同形）。 */
interface SweepReport {
  mode: string;
  scanned: number;
  matched: number;
  killed: number[];
  failed: number[];
}

interface HostPayload {
  error?: string;
  summary?: string;
  report?: SweepReport;
  sweep?: { ok: boolean; error?: string; report?: SweepReport };
}

/** Gate 响应类型（来自 GET /obl-brand/restart-gates）。 */
interface GateResponse {
  ok?: boolean;
  active?: boolean;
  reason?: string | null;
  detail?: string[];
  error?: string;
}

/** 读响应体：失败时也要尽量把宿主的说明读出来，别只报一个 HTTP 码。 */
async function readPayload(response: Response): Promise<HostPayload | null> {
  try {
    return (await response.json()) as HostPayload;
  } catch {
    return null;
  }
}

/**
 * 查询重启前置 gate（聚合 agents + jobs 状态，给出精确的 detail）。
 *
 * 优先用新的 /restart-gates 端点；失败时回退到旧的 /tasks 端点（向后兼容老 brand 版本）。
 */
async function probeRestartGates(): Promise<{ active: boolean; detail?: string[] }> {
  try {
    const response = await fetch(RESTART_GATES_PATH, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (response.ok) {
      const body = (await response.json()) as GateResponse | null;
      if (body?.ok === true && typeof body.active === 'boolean') {
        return { active: body.active, detail: body.detail };
      }
    }
  } catch {
    /* fall through to legacy probe */
  }
  const legacy = await probeActiveTasks();
  return { active: legacy };
}

/**
 * 问宿主「现在有没有活动任务」（旧版 /tasks 端点，向后兼容）。
 */
async function probeActiveTasks(): Promise<boolean> {
  try {
    const response = await fetch(TASKS_PATH, {
      method: 'GET',
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: boolean; active?: boolean } | null;
    return body?.ok === true && body.active === true;
  } catch {
    return false;
  }
}

/** 重启响应里的「重启前清扫」结果 → 一句话；没有这一项就返回 `null`。 */
function describeRestartSweep(payload: HostPayload | null): string | null {
  const sweep = payload?.sweep;
  if (sweep === undefined) return null;
  if (!sweep.ok) {
    return `DSH 将在数秒内重启（重启前清扫未执行：${sweep.error ?? '未知原因'}）`;
  }
  const killed = sweep.report?.killed.length ?? 0;
  return killed > 0
    ? `DSH 将在数秒内重启（重启前清掉 ${killed} 个孤儿进程）`
    : 'DSH 将在数秒内重启，本页会断开。';
}

/** 清扫响应 → 一句话。优先用宿主自己的 summary，老宿主没给就本地拼。 */
function describeSweep(payload: HostPayload | null, fallback: string): string {
  if (typeof payload?.summary === 'string' && payload.summary !== '') return payload.summary;
  const report = payload?.report;
  if (report === undefined) return fallback;
  return report.killed.length === 0
    ? `没有发现孤儿进程（扫描 ${report.scanned} 个进程）`
    : `已清理 ${report.killed.length} 个孤儿进程（扫描 ${report.scanned} 个进程，命中 ${report.matched} 个传输进程）`;
}

const BUTTON_STYLE = {
  border: '1px solid rgba(127,127,127,0.35)',
  borderRadius: 5,
  background: 'transparent',
  cursor: 'pointer',
  padding: '2px 8px',
  fontSize: 11,
} as const;

const MSG_STYLE = { fontSize: 11, opacity: 0.75 } as const;

/** 「重启 DSH」：有活动任务先弹确认 → 202 后遮罩 + window.close（窗口秒隐藏）。 */
export function RestartControl(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string>('');
  const [closing, setClosing] = useState(false);
  /** 从 gate 路由拿到的详细中断信息。 */
  const [gateDetail, setGateDetail] = useState<string[] | undefined>(undefined);

  // P0: beforeunload 防护 —— 一旦组件挂载，就告知浏览器当前标签页有未保存的工作。
  // 这样即使意外导航/刷新，浏览器也会弹原生确认框。
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      // Chrome 要求 returnValue 为字符串（非空），否则不显示提示。
      e.returnValue = '有任务正在运行，关闭将导致中断';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const hideUiForRestart = useCallback((): void => {
    setClosing(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          window.close();
        } catch {
          /* 关窗被拦时保持遮罩，进程仍会被 helper 终止 */
        }
      });
    });
  }, []);

  const restart = useCallback(async (): Promise<void> => {
    setPhase('sending');
    setMessage('');
    try {
      const response = await fetch(RESTART_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        credentials: 'same-origin',
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        setPhase('error');
        setMessage(
          response.status === 404
            ? '找不到重启路由 —— @oblivion/brand 未装载？重启机制由它提供。'
            : `HTTP ${response.status}${payload?.error ? `：${payload.error}` : ''}`,
        );
        return;
      }
      setPhase('done');
      setMessage(describeRestartSweep(payload) ?? 'DSH 将在数秒内重启，本页会断开。');
      hideUiForRestart();
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [hideUiForRestart]);

  const beginRestart = useCallback(async (): Promise<void> => {
    const { active, detail } = await probeRestartGates();
    setGateDetail(detail);
    if (!active) {
      void restart();
      return;
    }
    setPhase('confirming');
    setMessage(detail && detail.length > 0 ? detail.join(' · ') : '当前正在运行的任务将会中断');
  }, [restart]);

  return (
    <>
      {closing ? (
        <div
          data-obl-panel-restart-cover=""
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483000,
            background: '#111',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            letterSpacing: '0.02em',
          }}
        >
          正在重启 DSH…
        </div>
      ) : null}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          style={{
            ...BUTTON_STYLE,
            color: phase === 'error' ? '#d9534f' : 'inherit',
            cursor: phase === 'sending' ? 'default' : 'pointer',
          }}
          disabled={phase === 'sending'}
          onClick={() => {
            if (phase === 'idle') {
              void beginRestart();
              return;
            }
            void restart();
          }}
        >
          {BTN[phase] ?? '重启 DSH'}
        </button>
        {message ? <span style={MSG_STYLE}>{message}</span> : null}
      </span>
      {phase === 'confirming' ? (
        <div
          data-obl-panel-restart-dialog=""
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
            aria-label="退出 DeepSeek Harness？"
            style={{
              width: 360,
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
              退出 DeepSeek Harness？
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.6, opacity: 0.85, marginBottom: 18 }}>
              {gateDetail && gateDetail.length > 0 ? (
                <>
                  以下活动任务将会中断：
                  <ul style={{ marginTop: 6, paddingLeft: 20, marginInlineStart: 20 }}>
                    {gateDetail.map((item, i) => (
                      <li key={i} style={{ lineHeight: 1.7 }}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : (
                '当前正在运行的任务将会中断'
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                style={{
                  ...BUTTON_STYLE,
                  padding: '4px 16px',
                  fontSize: 12,
                  background: '#2d6cdf',
                  border: '1px solid #2d6cdf',
                  color: '#fff',
                  borderRadius: 5,
                }}
                onClick={() => {
                  void restart();
                }}
              >
                退出
              </button>
              <button
                type="button"
                style={{ ...BUTTON_STYLE, padding: '4px 16px', fontSize: 12, borderRadius: 5 }}
                onClick={() => {
                  setPhase('idle');
                  setMessage('');
                  setGateDetail(undefined);
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** 「清理孤儿进程」：只杀 web-login 遗留的传输进程，不重启。 */
export function OrphanControl(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string>('');

  const sweep = useCallback(async (): Promise<void> => {
    setPhase('sending');
    setMessage('');
    try {
      const response = await fetch(ORPHANS_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        credentials: 'same-origin',
      });
      const payload = await readPayload(response);
      if (!response.ok) {
        setPhase('error');
        setMessage(
          response.status === 404
            ? '找不到清扫路由 —— @oblivion/brand 未装载？清扫由它提供。'
            : payload?.error ?? `HTTP ${response.status}`,
        );
        return;
      }
      setPhase('idle');
      setMessage(describeSweep(payload, '清理完成。'));
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button
        type="button"
        style={{
          ...BUTTON_STYLE,
          color: phase === 'error' ? '#d9534f' : 'inherit',
          cursor: phase === 'sending' ? 'default' : 'pointer',
        }}
        disabled={phase === 'sending'}
        title="结束 web-login 遗留的无头 Edge 传输进程（它们占着 transport-profile 目录，会让账号校验全部报错）。不重启 DSH。"
        onClick={() => {
          if (phase === 'idle') {
            setPhase('confirming');
            setMessage('只结束 web-login 遗留的传输进程，不重启 DSH；正在用的传输进程不受影响。');
            return;
          }
          void sweep();
        }}
      >
        {SWEEP_BTN[phase] ?? '清理孤儿进程'}
      </button>
      {message ? <span style={MSG_STYLE}>{message}</span> : null}
    </span>
  );
}
