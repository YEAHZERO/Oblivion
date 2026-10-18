/**
 * 面板内的「更新插件」：列可更新项 → 勾选 → 应用 → 提示重启。
 *
 * 机制全部在宿主半边（`@oblivion/brand` 的 `/obl-brand/updates` 与 `/obl-brand/updates/apply`）：
 * 读 profile 依赖、查 npm latest、写 package.json、用与宿主同一个内置 pnpm 安装。
 * 这里**只做展示与触发**，不复制任何安装逻辑（与「重启 / 清理孤儿」同一条纪律）。
 *
 * 安全边界：路由只接受本机调用方（`isTrustedCaller`），且只更新白名单内的依赖
 * （跳过 link: / file: / @oblivion/* / @deepseek-ai/*）。
 */
import { useCallback, useState } from 'react';
import type { JSX } from 'react';

/** 与 `@oblivion/brand` 的路径常量保持一致。 */
const UPDATES_PATH = '/obl-brand/updates';
const APPLY_PATH = '/obl-brand/updates/apply';

interface UpdateItem {
  name: string;
  current: string;
  latest: string;
}

type Phase = 'idle' | 'checking' | 'listing' | 'applying' | 'done' | 'error';

const BTN = {
  border: '1px solid rgba(127,127,127,0.35)',
  borderRadius: 5,
  background: 'transparent',
  cursor: 'pointer',
  padding: '2px 8px',
  fontSize: 11,
} as const;

export function PluginUpdates(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle');
  const [items, setItems] = useState<UpdateItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [applying, setApplying] = useState(false);

  const check = useCallback(async (): Promise<void> => {
    setPhase('checking');
    setMessage('');
    try {
      const response = await fetch(UPDATES_PATH, {
        headers: { accept: 'application/json' },
        credentials: 'same-origin',
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; items?: UpdateItem[]; errors?: Array<{ name: string; error: string }>; error?: string }
        | null;
      if (!response.ok || body?.ok !== true) {
        setPhase('error');
        setMessage(`检查失败：${body?.error ?? `HTTP ${response.status}`}`);
        return;
      }
      const list = body.items ?? [];
      const errs = (body.errors ?? []).map((e) => e.name);
      setItems(list);
      setSelected(new Set(list.map((item) => item.name)));
      setPhase(list.length > 0 ? 'listing' : 'done');
      if (errs.length > 0) {
        setMessage(`检查完成，${String(list.length)} 个可更新；${errs.join('、')} 查询失败。`);
      } else if (list.length === 0) {
        setMessage('所有插件已是最新。');
      } else {
        setMessage('');
      }
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const apply = useCallback(async (): Promise<void> => {
    const names = [...selected];
    if (names.length === 0) {
      setMessage('没有勾选任何项。');
      return;
    }
    setPhase('applying');
    setApplying(true);
    setMessage('');
    try {
      const response = await fetch(APPLY_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ names }),
        credentials: 'same-origin',
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; changed?: UpdateItem[]; installed?: Array<{ name: string; version: string | null }>; error?: string }
        | null;
      if (!response.ok || body?.ok !== true) {
        setPhase('error');
        setMessage(`更新失败：${body?.error ?? `HTTP ${response.status}`}`);
        return;
      }
      const changed = (body.changed ?? []).map((item) => `${item.name}@${item.latest}`).join('、');
      setItems([]);
      setPhase('done');
      setMessage(`已更新 ${String(body.changed?.length ?? 0)} 个：${changed}。重启 DSH 后生效。`);
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setApplying(false);
    }
  }, [selected]);

  const toggle = (name: string): void => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  };

  return (
    <>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          style={{ ...BTN, cursor: phase === 'checking' || phase === 'applying' ? 'default' : 'pointer' }}
          disabled={phase === 'checking' || phase === 'applying'}
          onClick={() => {
            void check();
          }}
        >
          {phase === 'checking' ? '正在检查…' : '检查更新'}
        </button>
        {message !== '' ? <span style={{ fontSize: 11, opacity: 0.75 }}>{message}</span> : null}
      </span>
      {phase === 'listing' ? (
        <div
          data-obl-update-dialog=""
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
            aria-label="可更新的插件"
            style={{
              width: 420,
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
              可更新的插件（{String(items.length)}）
            </div>
            <div style={{ maxHeight: 260, overflow: 'auto', fontSize: 12, lineHeight: '1.8' }}>
              {items.map((item) => (
                <label key={item.name} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(item.name)}
                    onChange={() => {
                      toggle(item.name);
                    }}
                  />
                  <span style={{ flex: 1 }}>{item.name}</span>
                  <span style={{ opacity: 0.7 }}>
                    {item.current} → {item.latest}
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                type="button"
                style={{
                  ...BTN,
                  padding: '4px 16px',
                  fontSize: 12,
                  borderRadius: 5,
                  background: '#2d6cdf',
                  border: '1px solid #2d6cdf',
                  color: '#fff',
                }}
                disabled={applying}
                onClick={() => {
                  void apply();
                }}
              >
                {applying ? '更新中…' : '更新所选'}
              </button>
              <button
                type="button"
                style={{ ...BTN, padding: '4px 16px', fontSize: 12, borderRadius: 5 }}
                onClick={() => {
                  setPhase('idle');
                  setMessage('');
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
