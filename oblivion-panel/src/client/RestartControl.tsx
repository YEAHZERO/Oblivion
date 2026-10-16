/**
 * **面板内的两个宿主动作：「重启 DSH」与「清理孤儿进程」。**
 *
 * 重启复用 `@oblivion/brand` 已有的路由 `POST /obl-brand/restart`（完整机制在那边：
 * 临时 PowerShell 助手强制结束进程再拉起，因为插件够不到 Electron 主进程的 `app.relaunch()`）。
 *
 * 「清理孤儿进程」走 `POST /obl-brand/orphans`，解的是另一个现场：web-login 的无头 Edge
 * 传输进程在 DSH 被**硬杀**（重启按钮 / 任务管理器 / 崩溃）之后活了下来，继续占着
 * `~/.dsh/web-login/transport-profile`，于是下一次探活 `rmSync` 抛 EPERM，面板上表现为
 * 「几个账号全部校验失败」。这个动作**不重启**，只把被占住的目录解开，所以现场能一条命令
 * 治好，不必打断会话。
 *
 * 两边都**不在这里复制机制**：宿主只回计数与路径，文案在这里拼 —— 机制只有一份，坏了只修一处。
 * 判定与安全边界（只认 transport profile 命令行、只杀父进程已死的）见 brand 的 `src/orphans.ts`。
 *
 * 降级：brand 未装/被停用时路由 404，这里给明确文案而不是静默失败。
 */

import { useCallback, useState } from 'react';
import type { JSX } from 'react';

/** 与 `@oblivion/brand` 的 `RESTART_PATH` 保持一致。 */
const RESTART_PATH = '/obl-brand/restart';

/** 与 `@oblivion/brand` 的 `ORPHANS_PATH` 保持一致。 */
const ORPHANS_PATH = '/obl-brand/orphans';

type Phase = 'idle' | 'confirming' | 'sending' | 'done' | 'error';

const BTN: Record<Phase, string> = {
  idle: '重启 DSH',
  confirming: '确认重启',
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

/** 读响应体：失败时也要尽量把宿主的说明读出来，别只报一个 HTTP 码。 */
async function readPayload(response: Response): Promise<HostPayload | null> {
  try {
    return (await response.json()) as HostPayload;
  } catch {
    return null;
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

export function RestartControl(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle');
  const [sweepPhase, setSweepPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string>('');

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
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const sweep = useCallback(async (): Promise<void> => {
    setSweepPhase('sending');
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
        setSweepPhase('error');
        setMessage(
          response.status === 404
            ? '找不到清扫路由 —— @oblivion/brand 未装载？清扫由它提供。'
            : payload?.error ?? `HTTP ${response.status}`,
        );
        return;
      }
      // 成功就回到 idle：这个按钮可以反复按（现场可能连续踩第二次）。
      setSweepPhase('idle');
      setMessage(describeSweep(payload, '清理完成。'));
    } catch (error) {
      setSweepPhase('error');
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
        onClick={() => {
          if (phase === 'idle') {
            setPhase('confirming');
            setMessage('重启会强制结束当前 DSH 进程：正在跑的会话与任务会中断。');
            return;
          }
          void restart();
        }}
      >
        {BTN[phase] ?? '重启 DSH'}
      </button>
      <button
        type="button"
        style={{
          ...BUTTON_STYLE,
          color: sweepPhase === 'error' ? '#d9534f' : 'inherit',
          cursor: sweepPhase === 'sending' ? 'default' : 'pointer',
        }}
        disabled={sweepPhase === 'sending'}
        title="结束 web-login 遗留的无头 Edge 传输进程（它们占着 transport-profile 目录，会让账号校验全部报错）。不重启 DSH。"
        onClick={() => {
          if (sweepPhase === 'idle') {
            setSweepPhase('confirming');
            setMessage('只结束 web-login 遗留的传输进程，不重启 DSH；正在用的传输进程不受影响。');
            return;
          }
          void sweep();
        }}
      >
        {SWEEP_BTN[sweepPhase] ?? '清理孤儿进程'}
      </button>
      {message ? <span style={{ fontSize: 11, opacity: 0.75 }}>{message}</span> : null}
    </span>
  );
}
