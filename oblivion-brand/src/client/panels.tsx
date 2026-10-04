/**
 * 把「可嵌入的面板提供方」挂进左侧栏。
 *
 * ## 为什么只能嵌「提供方」而不是任意设置页
 *
 * DSH 的公开扩展点是 `sidebar.panellist`（`{kind:"list", scope:"root"}`）：
 * 注册图标 + `id`/`order`/`label`，**同一个 id 再寻址布局中 root 作用域 `main`
 * keyed slot 的组件**，后者是面板正文。
 *
 * 但设置页正文是由设置弹窗用它**自己那个窄化过的 `renderSlot`** 渲染的，
 * 而 `main` 声明为 `{kind:"keyed", scope:"root"}` 且**没有 children** ——
 * 所以从 `main` 或 `sidebar.panellist` 里没有任何公开途径去渲染别的设置分节。
 *
 * 因此能搬进侧栏的，是那些**主动暴露可渲染控制面**的插件：`dshmarket` 就是
 * （`ctx.provide('market', { render })`，其注释写着「for a host that renders it
 * inside its own container」）。这类提供方可以自动发现 —— cordis 的
 * `ctx.reflect.provide()` 把服务登记在 `ctx.reflect.store`，枚举它、筛出带
 * `render()` 的服务即可。装了更多这类插件，候选列表会自动变长。
 */

import type { JSX, ReactElement } from 'react';

/** 侧栏面板条目的 order 基数：0 = 插件，10 = 任务，我们插在两者之间。 */
export const PANEL_ORDER_BASE = 5;

/** 侧栏面板条目 id 前缀。 */
export const PANEL_ID_PREFIX = 'obl-panel-';

/** 一个可嵌入的面板提供方。 */
export interface EmbeddableProvider {
  /** cordis 服务名，同时用作条目 id 后缀与 `main` 的 key。 */
  readonly key: string;
  /** 该服务的 `render()`，返回可直接挂载的 React 元素。 */
  readonly render: () => ReactElement | null;
}

/** 反射枚举不可用时的兜底探测名单。 */
const FALLBACK_PROVIDER_KEYS = ['market'];

/** 已知提供方的显示名；未知的回退到服务名本身。 */
const PROVIDER_LABELS: Record<string, string> = {
  market: '插件市场',
};

/** 取提供方的显示名。 */
export function providerLabel(key: string): string {
  return PROVIDER_LABELS[key] ?? key;
}

/** 面板条目 id。 */
export function panelEntryId(key: string): string {
  return PANEL_ID_PREFIX + key;
}

/** 本插件用到的最小 ctx 面（反射部分故意做成可选）。 */
interface DiscoverCtx {
  get(name: string): unknown;
  reflect?: { store?: Record<PropertyKey, unknown> } | undefined;
}

function asProvider(key: string, value: unknown): EmbeddableProvider | null {
  if (value === null || typeof value !== 'object') return null;
  const render = (value as { render?: unknown }).render;
  if (typeof render !== 'function') return null;
  return {
    key,
    render: () => {
      try {
        const element = (render as () => ReactElement | null).call(value);
        return element ?? null;
      } catch {
        // 提供方自己崩了不能连累整个客户端树
        return null;
      }
    },
  };
}

/**
 * 发现所有可嵌入的面板提供方。
 *
 * 先走 cordis 反射（能拿到完整服务表），失败或为空时退回已知名单探测。
 *
 * @param ctx - Client root context.
 */
export function discoverPanelProviders(ctx: DiscoverCtx): EmbeddableProvider[] {
  const found = new Map<string, EmbeddableProvider>();

  try {
    const store = ctx.reflect?.store;
    if (store !== undefined && store !== null) {
      for (const rawKey of Reflect.ownKeys(store)) {
        const impl = (store as Record<PropertyKey, unknown>)[rawKey] as { name?: unknown } | undefined;
        const name = typeof impl?.name === 'string' ? impl.name : typeof rawKey === 'string' ? rawKey : null;
        if (name === null || found.has(name)) continue;
        // 逐个服务单独保护：某个服务尚未就绪时 `get` 会抛，
        // 不能让一次失败中断整轮枚举、把后面的提供方全漏掉。
        let value: unknown;
        try {
          value = ctx.get(name);
        } catch {
          continue;
        }
        const provider = asProvider(name, value);
        if (provider !== null) found.set(name, provider);
      }
    }
  } catch {
    /* 反射不可用：走兜底 */
  }

  for (const key of FALLBACK_PROVIDER_KEYS) {
    if (found.has(key)) continue;
    const provider = asProvider(key, ctx.get(key));
    if (provider !== null) found.set(key, provider);
  }

  return [...found.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** `sidebar.panellist` 条目组件收到的 props。 */
export interface PanelIconProps {
  readonly size: number;
  readonly active: boolean;
}

/**
 * 侧栏条目的通用图标：2×2 圆角方块网格。
 * 用 `currentColor` 以便随选中态与主题变化。
 */
export function PanelIcon({ size, active }: PanelIconProps): JSX.Element {
  const unit = size / 18;
  const square = 7 * unit;
  const gap = 2 * unit;
  const radius = 1.6 * unit;

  return (
    <svg
      data-obl-panel-icon=""
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
 * 构造面板正文组件。
 *
 * 提供方可能比本插件晚就绪，所以每次渲染都**重新查一次**，而不是注册时缓存。
 *
 * @param getProvider - 惰性返回提供方的函数。
 */
export function createEmbeddedPanel(
  getProvider: () => EmbeddableProvider | undefined,
  label: string,
): () => JSX.Element {
  return function EmbeddedPanel(): JSX.Element {
    const provider = getProvider();
    const element = provider?.render() ?? null;

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
            {label} 没有提供面板
          </strong>
          <span>对应插件未安装、未启用，或它的面板渲染失败了。</span>
        </div>
      );
    }

    return (
      <div data-obl-embedded-panel="" style={{ height: '100%', minHeight: 0, overflow: 'auto' }}>
        {element}
      </div>
    );
  };
}
