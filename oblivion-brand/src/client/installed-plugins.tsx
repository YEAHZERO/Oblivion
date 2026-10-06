/**
 * 设置面板里的「个人已安装插件」区。
 *
 * 目的（所有者 2026-10-06 的裁定）：**重建环境时能照着装回来**。因此每一条都给出
 * 一键复制的重装命令，而不是只列个名字；也刻意不生成 `.ps1`、不写清单文件 ——
 * 清单的唯一事实来源是 profile 目录本身，这里只是它的一个视图。
 *
 * 数据来自宿主路由 `GET /obl-brand/plugins`（见 `src/profile-plugins.ts`），
 * 浏览器半边只负责渲染与复制，不做任何推断。
 */

import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { PLUGINS_PATH } from '../paths.js';
import {
  normalizePluginList,
  statusLabel,
  totalRestoreScript,
  type InstalledPlugin,
  type PluginListPayload,
} from '../plugin-list.js';
import { ACCENT, BORDER, LABEL, MUTED, buttonStyle, cardStyle, headingStyle, hintStyle, monoStyle } from './theme.js';

type PanelState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: string }
  | { readonly status: 'ready'; readonly data: PluginListPayload };

/**
 * 复制文本到剪贴板。
 *
 * 先走 `navigator.clipboard`；它在非安全上下文（`http://` 的远端页面）里不存在或
 * 会被拒，于是退到隐藏 `textarea` + `execCommand('copy')` —— 本 GUI 就在
 * `http://127.0.0.1:19387` 上，两条路都要能用。返回是否成功，调用方据此显示人话。
 */
export async function copyText(text: string): Promise<boolean> {
  const clipboard: { writeText?: (value: string) => Promise<void> } | undefined = (
    globalThis as { navigator?: { clipboard?: { writeText?: (value: string) => Promise<void> } } }
  ).navigator?.clipboard;
  if (typeof clipboard?.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // 落到退路：权限被拒、非安全上下文都可能走到这里。
    }
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    document.body.appendChild(area);
    area.select();
    const ok = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/** 规格种类的中文说明（本地链接 / npm 包的重装含义不同，必须区分）。 */
export function kindLabel(entry: Pick<InstalledPlugin, 'kind'>): string {
  return entry.kind === 'link' ? '本地链接' : 'npm';
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function statusColor(entry: Pick<InstalledPlugin, 'active'>): string {
  return entry.active ? ACCENT : MUTED;
}

export interface InstalledPluginsSectionProps {
  /** 覆盖路由路径（自检与调试用；默认取 `PLUGINS_PATH`）。 */
  readonly path?: string;
}

export function InstalledPluginsSection(props: InstalledPluginsSectionProps): JSX.Element {
  const path = props.path ?? PLUGINS_PATH;
  const [state, setState] = useState<PanelState>({ status: 'loading' });
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(path, { headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error(`宿主返回 HTTP ${response.status}`);
        const raw: unknown = await response.json();
        const data = normalizePluginList(raw);
        if (data === null) throw new Error('清单形状不对（宿主与本插件版本可能不一致）');
        if (alive) setState({ status: 'ready', data });
      } catch (error) {
        if (alive) setState({ status: 'failed', error: message(error) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [path]);

  const copy = useCallback(async (key: string, text: string) => {
    const ok = await copyText(text);
    if (!ok) {
      setCopyError('复制没成功（浏览器可能不给权限），请手动选中命令复制。');
      return;
    }
    setCopyError(null);
    setCopied(key);
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
  }, []);

  const data = state.status === 'ready' ? state.data : null;
  const all = data !== null ? totalRestoreScript(data) : '';

  return (
    <section style={cardStyle}>
      <h3 style={headingStyle}>个人已安装插件</h3>
      <p style={hintStyle}>
        本 profile 的 <code style={monoStyle}>dependencies</code> 里装过的插件。重装时点「复制」拿命令，
        或在插件市场里按包名搜索安装。「已装未启用」= 装了但既不在 <code style={monoStyle}>dsh.profile.bundles</code>
        里、也没有补丁行，宿主不会加载它。
      </p>

      {state.status === 'loading' ? <p style={hintStyle}>正在读取 profile…</p> : null}

      {state.status === 'failed' ? (
        <p style={{ ...hintStyle, color: 'var(--dsw-alias-label-error, #d93025)' }}>
          读不到清单：{state.error}（宿主侧需重启 DSH 才会挂上这条路由）
        </p>
      ) : null}

      {data !== null ? (
        <>
          <p style={hintStyle}>
            profile <strong>{data.profile}</strong> · 共 {data.entries.length} 条
            {data.profileDir !== '' ? (
              <>
                {' · '}
                <span style={monoStyle} title={data.profileDir}>
                  {data.profileDir}
                </span>
              </>
            ) : null}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.entries.map((entry) => (
              <div
                key={entry.name}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '8px 10px',
                  border: `1px solid ${BORDER}`,
                  borderRadius: '6px',
                }}
              >
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', color: LABEL, fontWeight: 600 }}>{entry.name}</span>
                    {entry.version !== null ? <span style={monoStyle}>{entry.version}</span> : null}
                    <span style={{ fontSize: '11px', color: statusColor(entry) }}>{statusLabel(entry)}</span>
                    <span style={monoStyle}>· {kindLabel(entry)}</span>
                  </div>
                  <div style={{ ...monoStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.spec}>
                    {entry.spec}
                  </div>
                  <div style={{ ...monoStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.restore}>
                    {entry.restore}
                  </div>
                </div>
                <button
                  type="button"
                  style={{ ...buttonStyle, flex: '0 0 auto' }}
                  onClick={() => void copy(entry.name, entry.restore)}
                >
                  {copied === entry.name ? '已复制' : '复制'}
                </button>
              </div>
            ))}
          </div>

          {data.problems.length > 0 ? (
            <ul style={{ ...hintStyle, paddingLeft: '18px', margin: 0 }}>
              {data.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              style={buttonStyle}
              disabled={all === ''}
              onClick={() => void copy('__all__', all)}
            >
              {copied === '__all__' ? '已复制全部' : `复制全部（${data.entries.length} 条）`}
            </button>
            {copyError !== null ? <span style={{ ...hintStyle, color: MUTED }}>{copyError}</span> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
