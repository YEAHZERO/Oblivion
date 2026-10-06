/**
 * **面板内的「重启 DSH」按钮**。
 *
 * 复用 `@oblivion/brand` 已有的重启路由 `POST /obl-brand/restart`（它实现了完整机制：
 * 临时 PowerShell 助手强制结束进程再拉起，因为插件够不到 Electron 主进程的 `app.relaunch()`）。
 * 这里**不复制那套机制**，只做按钮 + 确认态 + 失败提示 —— 机制只有一份，坏了只修一处。
 *
 * 降级：brand 未装/被停用时路由 404，这里给明确文案而不是静默失败。
 */

import { useCallback, useState } from 'react';
import type { JSX } from 'react';

/** 与 `@oblivion/brand` 的 `RESTART_PATH` 保持一致。 */
const RESTART_PATH = '/obl-brand/restart';

type Phase = 'idle' | 'confirming' | 'sending' | 'done' | 'error';

const BTN: Record<string, string> = {
  idle: '重启 DSH',
  confirming: '确认重启',
  sending: '正在重启…',
  done: '已发出重启',
  error: '重试',
};

export function RestartControl(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string>('');

  const send = useCallback(async () => {
    setPhase('sending');
    setMessage('');
    try {
      const response = await fetch(RESTART_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        setPhase('error');
        setMessage(
          response.status === 404
            ? '找不到重启路由 —— @oblivion/brand 未装载？重启机制由它提供。'
            : 'HTTP ' + response.status,
        );
        return;
      }
      setPhase('done');
      setMessage('DSH 将在数秒内重启，本页会断开。');
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        type="button"
        style={{
          border: '1px solid rgba(127,127,127,0.35)',
          borderRadius: 5,
          background: 'transparent',
          color: phase === 'error' ? '#d9534f' : 'inherit',
          cursor: phase === 'sending' ? 'default' : 'pointer',
          padding: '2px 8px',
          fontSize: 11,
        }}
        disabled={phase === 'sending'}
        onClick={() => {
          if (phase === 'idle') {
            setPhase('confirming');
            setMessage('重启会强制结束当前 DSH 进程：正在跑的会话与任务会中断。');
            return;
          }
          void send();
        }}
      >
        {BTN[phase] ?? '重启 DSH'}
      </button>
      {message ? <span style={{ fontSize: 11, opacity: 0.75 }}>{message}</span> : null}
    </span>
  );
}
