/**
 * 设置分节：自定义品牌名文字。
 *
 * 注册到 `settings.section`（由 ui-settings 声明），因此入口是
 * 「设置 → Oblivion 品牌」。改动写入 `localStorage` 并即时广播，
 * 侧栏品牌行无需刷新页面即可更新。
 */

import type { JSX } from 'react';
import { useState } from 'react';
import { OblivionBrandMark } from './Brand.js';
import {
  DEFAULT_BRAND_NAME,
  MAX_BRAND_NAME_LENGTH,
  brandName,
  resetBrandName,
  setBrandName,
  useBrandName,
} from './settings.js';

const LABEL = 'var(--dsw-alias-label-primary, currentColor)';
const MUTED = 'var(--dsw-alias-label-tertiary, #8b93a1)';
const BORDER = 'var(--dsw-alias-border-l2, #e5e7eb)';
const ACCENT = 'var(--dsw-alias-brand-primary, #4f6ef7)';

const rowStyle = { display: 'flex', alignItems: 'center', gap: '8px' } as const;

const buttonStyle = {
  font: 'inherit',
  fontSize: '13px',
  padding: '5px 12px',
  borderRadius: '6px',
  border: `1px solid ${BORDER}`,
  background: 'transparent',
  color: LABEL,
  cursor: 'pointer',
} as const;

/** 设置分节主体。 */
export function BrandSettingsPanel(): JSX.Element {
  const name = useBrandName();
  const [draft, setDraft] = useState(() => brandName());
  const dirty = draft !== name;
  const empty = draft === '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px', maxWidth: '560px' }}>
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 500, color: LABEL }}>Oblivion 品牌</h2>
        <p style={{ margin: 0, fontSize: '12px', lineHeight: '18px', color: MUTED }}>
          侧栏品牌行的文字，以及会话 Hero 区的品牌图形。图形固定为北极星；文字留空则只显示图形。
        </p>
      </div>

      <div style={{ ...rowStyle, gap: '12px', padding: '12px', border: `1px solid ${BORDER}`, borderRadius: '8px' }}>
        <OblivionBrandMark size={32} />
        <span
          style={{
            fontFamily: "'Montserrat', 'Segoe UI', system-ui, sans-serif",
            fontSize: '16px',
            fontWeight: 500,
            color: LABEL,
          }}
        >
          {name === '' ? <em style={{ color: MUTED, fontWeight: 400 }}>（不显示文字）</em> : name}
        </span>
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: LABEL }}>
        品牌名文字
        <input
          type="text"
          value={draft}
          maxLength={MAX_BRAND_NAME_LENGTH}
          placeholder={DEFAULT_BRAND_NAME}
          onChange={(event) => setDraft(event.target.value.slice(0, MAX_BRAND_NAME_LENGTH))}
          style={{
            font: 'inherit',
            fontSize: '13px',
            padding: '7px 10px',
            borderRadius: '6px',
            border: `1px solid ${BORDER}`,
            background: 'var(--dsw-alias-bg-layer-2, transparent)',
            color: LABEL,
          }}
        />
      </label>

      <div style={{ ...rowStyle, fontSize: '12px', color: MUTED }}>
        {draft.length}/{MAX_BRAND_NAME_LENGTH} 字符
        {empty ? ' · 留空表示隐藏文字' : ''}
      </div>

      <div style={rowStyle}>
        <button
          type="button"
          disabled={!dirty}
          onClick={() => setBrandName(draft)}
          style={{
            ...buttonStyle,
            border: 'none',
            background: dirty ? ACCENT : BORDER,
            color: dirty ? '#fff' : MUTED,
            cursor: dirty ? 'pointer' : 'not-allowed',
          }}
        >
          保存
        </button>
        <button
          type="button"
          onClick={() => {
            resetBrandName();
            setDraft(DEFAULT_BRAND_NAME);
          }}
          style={buttonStyle}
        >
          恢复默认（{DEFAULT_BRAND_NAME}）
        </button>
        {dirty ? <span style={{ fontSize: '12px', color: MUTED }}>有未保存的改动</span> : null}
      </div>

      <p style={{ margin: 0, fontSize: '12px', lineHeight: '18px', color: MUTED }}>
        保存在浏览器本地（localStorage）。{/* 说明持久化范围，避免误以为会写进 DSH 配置 */}
      </p>
    </div>
  );
}
