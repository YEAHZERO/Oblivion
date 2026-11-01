/**
 * 会话标题栏工具区的「智能重载」图标按钮（仿 dsh-unlag 的 ReloadButton 摆位）。
 *
 * 与面板里的 `UnlagControl` 共用同一个端点（POST /obl-brand/reload → HMR
 * reconcileProfile，保留运行中任务）；区别只有呈现形式：这里 28×28 纯图标，
 * 只在**会话页**出现（槽位 `conversation.session.header.utilities` 本身保证）。
 *
 * 降级口径与 UnlagControl 一致：404（brand 老版本没挂路由）/ 503（HMR 未就绪）
 * 都**静默**，不弹窗打扰 —— 图标按钮没有地方放长文案，只在失败且非静默类
 * （500 等）时短暂显示一行 8 秒自动消失的状态文字（与 dsh-unlag 同规格）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

/** 与 `@oblivion/brand` 的 `RELOAD_PATH` 保持一致（POST；调 HMR reconcileProfile，保留运行中任务）。 */
const RELOAD_PATH = '/obl-brand/reload';

/** 与 dsh-unlag 同规格：状态文字 8 秒后消失。 */
const STATUS_LIFETIME_MS = 8000;

const ICON_STYLE: JSX.IntrinsicElements['button']['style'] = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  padding: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: 'inherit',
  opacity: 0.75,
  borderRadius: 4,
};

/** 循环箭头（↻ 形），20×20 自绘 SVG，随继承色。 */
function ReloadGlyph(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 3.5a6.5 6.5 0 1 0 6.5 6.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M16.5 3.5v5h-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SmartReloadButton(): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const flash = (text: string): void => {
    setStatus(text);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(''), STATUS_LIFETIME_MS);
  };

  const reload = useCallback(async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(RELOAD_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        credentials: 'same-origin',
      });
      // 静默类：brand 老版本（404）或 HMR 未就绪（503）—— 不打扰。
      if (response.status === 404 || response.status === 503) {
        return;
      }
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; status?: string; error?: string }
        | null;
      if (!response.ok) {
        flash(body?.error ? `重载失败：${body.error}` : `重载失败（HTTP ${response.status}）`);
        return;
      }
      flash(body?.status === 'skipped' ? '无变更可重载' : '已重载插件代码');
    } catch (error) {
      flash(error instanceof Error ? `重载失败：${error.message}` : '重载失败');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button
        type="button"
        style={ICON_STYLE}
        disabled={busy}
        title="智能重载：换掉插件代码并保留运行中任务（等价 dsh-unlag 的解除卡顿，走 @oblivion/brand 的 /obl-brand/reload）"
        onClick={() => {
          void reload();
        }}
      >
        <ReloadGlyph />
      </button>
      {status ? (
        <span style={{ fontSize: 11, opacity: 0.6, whiteSpace: 'nowrap' }}>{status}</span>
      ) : null}
    </span>
  );
}
