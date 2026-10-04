/**
 * 把「插件市场」面板挂进左侧栏。
 *
 * DSH 的公开扩展点是 `sidebar.panellist`（`{kind:"list", scope:"root"}`）：
 * 注册一个图标组件 + `id`/`order`/`label`，**同一个 id 再寻址布局中
 * root 作用域 `main` keyed slot 的组件** —— 后者就是面板正文。
 *
 * `dshmarket` 主动 `ctx.provide('market', …)` 了一个 `render()`，其注释明确写着
 * 「The market's panel as an element, for a host that renders it inside its own
 * container」——本文件正是那个 host。因此不复制也不包装市场 UI，只把它的整块
 * 面板搬个位置。
 *
 * 顺序：`插件` 面板 order=0、任务面板 order=10，这里取 5，正好落在「插件」下方。
 */

import type { JSX, ReactElement } from 'react';

/** 侧栏面板条目 id。 */
export const MARKET_PANEL_ID = 'obl-market';

/** 面板顺序：0 = 插件，10 = 任务。 */
export const MARKET_PANEL_ORDER = 5;

/** `dshmarket` 通过 `ctx.provide('market', …)` 暴露的控制面（只取用到的部分）。 */
export interface MarketControl {
  readonly version?: number;
  readonly render?: (props?: Record<string, unknown>) => ReactElement | null;
  readonly settingsVisible?: () => boolean;
  readonly setSettingsVisible?: (visible: boolean) => void;
}

/** `sidebar.panellist` 条目组件收到的 props。 */
export interface PanelIconProps {
  readonly size: number;
  readonly active: boolean;
}

/**
 * 侧栏条目的图标：2×2 圆角方块网格，与市场自身的方块标记同构，
 * 用 `currentColor` 以便随选中态与主题变化。
 */
export function MarketPanelIcon({ size, active }: PanelIconProps): JSX.Element {
  const unit = size / 18;
  const square = 7 * unit;
  const gap = 2 * unit;
  const radius = 1.6 * unit;

  return (
    <svg
      data-obl-market-icon=""
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      style={{ display: 'block', opacity: active ? 1 : 0.75 }}
    >
      <g fill="currentColor">
        <rect x={0} y={0} width={square} height={square} rx={radius} />
        <rect x={square + gap} y={0} width={square} height={square} rx={radius} />
        <rect x={0} y={square + gap} width={square} height={square} rx={radius} />
        <rect x={square + gap} y={square + gap} width={square} height={square} rx={radius} />
      </g>
    </svg>
  );
}

/**
 * 构造 `main` 面板正文组件。
 *
 * 市场可能比本插件晚就绪，所以每次渲染都**重新查一次**服务，
 * 而不是在注册时缓存 —— 市场缺席时给出可读的提示而不是空白。
 *
 * @param getMarket - 惰性读取 `market` 服务的函数（通常是 `() => ctx.get('market')`）。
 */
export function createMarketPanel(getMarket: () => MarketControl | undefined): () => JSX.Element {
  return function MarketPanel(): JSX.Element {
    const market = getMarket();
    const element = typeof market?.render === 'function' ? market.render() : null;

    if (element === null) {
      return (
        <div
          style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '24px',
            fontSize: '13px',
            color: 'var(--dsw-alias-label-tertiary, #8b93a1)',
          }}
        >
          <strong style={{ fontWeight: 500, color: 'var(--dsw-alias-label-primary, currentColor)' }}>
            插件市场没有提供面板
          </strong>
          <span>需要先安装并启用 dshmarket，然后刷新页面。</span>
        </div>
      );
    }

    return (
      <div data-obl-market-panel="" style={{ height: '100%', minHeight: 0, overflow: 'auto' }}>
        {element}
      </div>
    );
  };
}
