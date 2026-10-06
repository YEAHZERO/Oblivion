/**
 * tab 图标：一枚「¥ 硬币」。
 *
 * 用 `createElement` 而不是 JSX，因为这个文件被 `testkit` 那条 Node 构建路径一并引到时
 * 也不需要 JSX 运行时；better-sidebar 的 `icon` 接受任意 ReactNode。
 */
import { createElement } from 'react';

export function dailyLifeIcon(size = 16): unknown {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  return createElement(
    'svg',
    common,
    createElement('circle', { cx: 12, cy: 12, r: 9 }),
    createElement('path', { d: 'M8.5 8.5 12 12.5l3.5-4' }),
    createElement('path', { d: 'M12 12.5V16' }),
    createElement('path', { d: 'M9.5 14h5' }),
  );
}
