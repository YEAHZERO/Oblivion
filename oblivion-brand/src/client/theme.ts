/**
 * 设置面板的配色与常用样式。
 *
 * 抽出来的理由：面板区（`BrandSettingsPanel.tsx`）与新加的「个人已安装插件」区
 * （`installed-plugins.tsx`）必须长得一样；两处各写一份 `border`/`padding`
 * 一定会漂（本仓库已在「版本号写两遍」上付过一次代价）。
 *
 * 颜色都走 DSH 主题变量并带后备值：宿主换主题时面板跟着变，取不到变量也不至于透明。
 */

export const LABEL = 'var(--dsw-alias-label-primary, currentColor)';
export const MUTED = 'var(--dsw-alias-label-tertiary, #8b93a1)';
export const BORDER = 'var(--dsw-alias-border-l2, #e5e7eb)';
export const ACCENT = 'var(--dsw-alias-brand-primary, #4f6ef7)';
export const DANGER = 'var(--dsw-alias-label-error, #d93025)';

export const buttonStyle = {
  font: 'inherit',
  fontSize: '13px',
  padding: '5px 12px',
  borderRadius: '6px',
  border: `1px solid ${BORDER}`,
  background: 'transparent',
  color: LABEL,
  cursor: 'pointer',
} as const;

export const cardStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '14px',
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
} as const;

export const headingStyle = { margin: 0, fontSize: '13px', fontWeight: 600, color: LABEL } as const;
export const hintStyle = { margin: 0, fontSize: '12px', lineHeight: '18px', color: MUTED } as const;

/** 等宽小字（包名、规格、命令这类要逐字看的内容）。 */
export const monoStyle = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '11px',
  color: MUTED,
} as const;
