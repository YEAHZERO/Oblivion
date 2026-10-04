/**
 * Polaris（北极星）品牌的 SVG path 与渐变常量。
 *
 * 几何与 `assets/brand/polaris-path.ts` 同源：八芒星，16 个顶点（外内交替），
 * 从正上方顶点起顺时针。渲染时按 size / viewBox.width 等比缩放，**不要拉伸**。
 */

/** 图形坐标系尺寸。 */
export const POLARIS_VIEWBOX = { width: 1024, height: 1024 } as const;

/** 八芒星路径。 */
export const POLARIS_PATH =
  'M512.0000 132.0960L558.6323 399.4197L780.6327 243.3673L624.5803 465.3677L891.9040 512.0000L624.5803 558.6323L780.6327 780.6327L558.6323 624.5803L512.0000 891.9040L465.3677 624.5803L243.3673 780.6327L399.4197 558.6323L132.0960 512.0000L399.4197 465.3677L243.3673 243.3673L465.3677 399.4197Z';

/** 星体中心亮点半径（viewBox 单位）。 */
export const POLARIS_CENTER_DOT_RADIUS = 33.792;

/** 径向光晕半径（viewBox 单位）。 */
export const POLARIS_GLOW_RADIUS = 532.48;

/** 渐变起点色（暖金）。 */
export const POLARIS_GRADIENT_FROM = '#E8D5A3';

/** 渐变终点色（天蓝）。 */
export const POLARIS_GRADIENT_TO = '#7EC8E3';
