/**
 * Oblivion 品牌呈现组件。
 *
 * 两个组件的 props 接口与 DSH 官方 `@deepseek-ai/dsh-client-ui-brand-official`
 * 完全一致，因此可以直接落进同一批 single 槽位：
 *   - `OblivionBrandMark({ size })` ↔ `OfficialBrandMark({ size })`
 *   - `OblivionBrandName()`         ↔ `OfficialBrandName()`
 *
 * 官方包在默认 priority(0) 注册；本插件用更低的 priority 遮蔽它
 * （single 槽语义：同 priority 重复注册抛错，不同 priority 则 lowest renders）。
 */

import type { JSX } from 'react';
import {
  POLARIS_CENTER_DOT_RADIUS,
  POLARIS_GRADIENT_FROM,
  POLARIS_GRADIENT_TO,
  POLARIS_PATH,
  POLARIS_VIEWBOX,
} from './polaris.js';
import { useBrandName } from './settings.js';

/** 品牌图形 props（与官方 `OfficialBrandMark` 对齐）。 */
export interface BrandMarkProps {
  readonly size: number;
}

/** DSH 主题令牌，缺失时回退到继承色，保证明暗双主题都不瞎。 */
const LABEL_COLOR = 'var(--dsw-alias-label-primary, currentColor)';

/**
 * OblivionBrandMark — 北极星八芒星。
 *
 * 金色→天蓝线性渐变填充，中心加一颗同色亮点。SVG 尺寸严格等于 `size`，
 * viewBox 固定 1024×1024，因此任何尺寸都不变形。
 *
 * @param props.size - 渲染边长（px）。
 */
export function OblivionBrandMark({ size }: BrandMarkProps): JSX.Element {
  const gradientId = 'obl-polaris-gradient';
  const center = POLARIS_VIEWBOX.width / 2;

  return (
    <svg
      data-obl-brand-mark=""
      width={size}
      height={size}
      viewBox={`0 0 ${POLARIS_VIEWBOX.width} ${POLARIS_VIEWBOX.height}`}
      role="img"
      aria-label="Oblivion"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flex: 'none' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={POLARIS_GRADIENT_FROM} />
          <stop offset="100%" stopColor={POLARIS_GRADIENT_TO} />
        </linearGradient>
      </defs>
      <path d={POLARIS_PATH} fill={`url(#${gradientId})`} />
      <circle
        cx={center}
        cy={center}
        r={POLARIS_CENTER_DOT_RADIUS}
        fill={POLARIS_GRADIENT_FROM}
      />
    </svg>
  );
}

/**
 * OblivionBrandName — 品牌名文字。
 *
 * 文字取自设置（`localStorage`，见 `settings.ts`），在设置页改完即时生效。
 * 设为空串时渲染 `null`，让品牌行只留图形而不留空隙。
 */
export function OblivionBrandName(): JSX.Element | null {
  const name = useBrandName();
  if (name === '') return null;

  return (
    <span
      data-obl-brand-name=""
      style={{
        fontFamily: "'Montserrat', 'Segoe UI', system-ui, sans-serif",
        fontSize: '16px',
        fontWeight: 500,
        color: LABEL_COLOR,
        letterSpacing: '0px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {name}
    </span>
  );
}
