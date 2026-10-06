/**
 * 判定曲线（SVG）—— 只负责把 `chart.ts` 算好的几何画出来，不含任何数据读取与判断。
 *
 * 为什么单独一个文件：`Panel.tsx` 已经够长；这条曲线有 4 层（网格 / 阈值虚线 / 面积+趋势 / 折线+点），
 * 混进主组件里会盖住「面板就是几栏列表」这件事。
 *
 * 配色只有一个强调色（与左栏入口、tab 图标同一个 `#4176e6`），被拦下的点用红色 —— 颜色只用来区分通过/未通过。
 */

import type { JSX } from 'react';
import { actionLabel, relativeTime, scoreText } from './format.js';
import { POLARIS_ICON_COLOR } from './polaris.js';
import type { CurveGeometry } from './chart.js';

/** 被拦下的点：与强调色对比明确，且是浅色/深色背景都能看清的红。 */
const REJECT_COLOR = '#d9534f';

export interface ScoreChartProps {
  /** `buildScoreCurve()` 的输出。 */
  curve: CurveGeometry;
}

/** 曲线本体。空/单点时也画（一个点也是事实），没有点则由调用方给文案。 */
export function ScoreChart(props: ScoreChartProps): JSX.Element {
  const { curve } = props;
  return (
    <svg
      viewBox={'0 0 ' + curve.width + ' ' + curve.height}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label={
        '判定价分曲线：' +
        curve.points +
        ' 个点，区间 ' +
        (curve.min ?? 0).toFixed(2) +
        '–' +
        (curve.max ?? 0).toFixed(2) +
        (curve.threshold === null ? '' : '，阈值 ' + curve.threshold.toFixed(2))
      }
    >
      {curve.ticks.map((tick) => (
        <g key={tick.label}>
          <line
            x1={curve.padX}
            x2={curve.width - curve.padX}
            y1={tick.y}
            y2={tick.y}
            stroke="rgba(127,127,127,0.18)"
            strokeWidth={1}
          />
          <text x={curve.width - 1} y={tick.y - 2} fontSize={8} textAnchor="end" fill="currentColor" opacity={0.45}>
            {tick.label}
          </text>
        </g>
      ))}

      {curve.thresholdY === null ? null : (
        <line
          x1={curve.padX}
          x2={curve.width - curve.padX}
          y1={curve.thresholdY}
          y2={curve.thresholdY}
          stroke={REJECT_COLOR}
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.75}
        />
      )}

      {curve.area === '' ? null : <path d={curve.area} fill={POLARIS_ICON_COLOR} opacity={0.12} stroke="none" />}
      {curve.trend === '' ? null : (
        <path d={curve.trend} fill="none" stroke={POLARIS_ICON_COLOR} strokeWidth={1.4} opacity={0.5} />
      )}
      {curve.line === '' ? null : (
        <path d={curve.line} fill="none" stroke={POLARIS_ICON_COLOR} strokeWidth={1.6} strokeLinejoin="round" />
      )}

      {curve.dots.map((dot, index) => (
        <circle
          key={index}
          cx={dot.x}
          cy={dot.y}
          r={dot.pass ? 2.2 : 2.6}
          fill={dot.pass ? POLARIS_ICON_COLOR : REJECT_COLOR}
        >
          <title>
            {relativeTime(dot.at) + ' · ' + actionLabel(dot.action) + ' · 分值 ' + scoreText(dot.score)}
          </title>
        </circle>
      ))}
    </svg>
  );
}
