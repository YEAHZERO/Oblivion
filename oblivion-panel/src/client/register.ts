/**
 * 把「注册一个 better-sidebar tab」这件事从 React 里拆出来 —— 便于在 Node 里直接测降级路径。
 *
 * 三条硬事实（都来自 `dsh-better-sidebar@0.24.1` 的 `lib/types/client/service.d.ts`）：
 *   ① 服务名是 `ctx.betterSidebar`，方法 `registerTab(descriptor)` **返回 disposer**；
 *   ② descriptor 的 `id` 同时是 tab 的 `type`（内置用 `'explorer'`，我们用自己的命名空间）；
 *   ③ `component: (props) => ReactNode`，props 里带 `visible` 与 `onOpenFile`。
 *
 * 降级策略：**better-sidebar 不在时不注册、只记一条日志**。
 * 绝不能因为一个可选 UI 服务缺席就让整个插件装载失败（那会变成静默禁用，更难查）。
 */

export interface TabDescriptorLike {
  id: string;
  title: string | (() => string);
  description?: string | (() => string);
  order?: number;
  single?: boolean;
  component: (props: never) => unknown;
}

export interface BetterSidebarLike {
  registerTab(descriptor: TabDescriptorLike): unknown;
}

export interface ClientCtxLike {
  inject?(deps: readonly string[], callback: (scope: { betterSidebar?: BetterSidebarLike }) => void): unknown;
  get?(name: string): unknown;
  effect?(callback: () => unknown, label?: string): unknown;
}

export interface RegisterResult {
  status: 'registered' | 'no-service' | 'failed';
  detail?: string;
}

export const PANEL_TAB_ID = 'oblivion:panel';

/** 默认 descriptor（`component` 由调用方注入，避免本模块依赖 React）。 */
export function panelDescriptor(component: TabDescriptorLike['component']): TabDescriptorLike {
  return {
    id: PANEL_TAB_ID,
    title: () => 'Oblivion',
    description: () => '认知层观测：捕获率、拦截原因、调参建议与最近沉淀',
    order: 70,
    single: true,
    component,
  };
}

/**
 * 注册面板 tab。
 *
 * @param ctx - 客户端 ctx（结构化类型，不依赖框架类型）。
 * @param component - tab 组件（React 组件，由调用方传入）。
 * @param warn - 记日志用。
 */
export function registerPanelTab(
  ctx: ClientCtxLike,
  component: TabDescriptorLike['component'],
  warn: (message: string) => void,
): RegisterResult {
  const attach = (service: BetterSidebarLike | undefined): RegisterResult => {
    if (!service || typeof service.registerTab !== 'function') {
      return { status: 'no-service', detail: 'ctx.betterSidebar 不可用（dsh-better-sidebar 未装载？）' };
    }
    try {
      const dispose = service.registerTab(panelDescriptor(component));
      if (typeof dispose === 'function' && typeof ctx.effect === 'function') {
        ctx.effect(() => dispose as () => void, 'oblivion-panel: better-sidebar tab');
      }
      return { status: 'registered' };
    } catch (error) {
      return { status: 'failed', detail: error instanceof Error ? error.message : String(error) };
    }
  };

  if (typeof ctx.inject === 'function') {
    let result: RegisterResult = { status: 'no-service', detail: 'inject 回调未触发' };
    try {
      ctx.inject(['betterSidebar'], (scope) => {
        result = attach(scope?.betterSidebar);
        if (result.status !== 'registered') warn('面板 tab 未注册：' + String(result.detail ?? result.status));
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      warn('面板 tab 注册失败：' + detail);
      return { status: 'failed', detail };
    }
    return result;
  }

  // 没有 inject：退化成直接取服务（老外壳/精简外壳）。
  const direct = typeof ctx.get === 'function' ? (ctx.get('betterSidebar') as BetterSidebarLike | undefined) : undefined;
  const result = attach(direct);
  if (result.status !== 'registered') warn('面板 tab 未注册：' + String(result.detail ?? result.status));
  return result;
}
