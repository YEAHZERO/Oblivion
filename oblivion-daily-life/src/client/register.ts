/**
 * 把「注册一个 better-sidebar tab」这件事从 React 里拆出来 —— 便于在 Node 里直接测降级路径。
 *
 * 三条硬事实（都来自 `dsh-better-sidebar@0.24.1` 的 `lib/types/client/service.d.ts`）：
 *   ① 服务名是 `ctx.betterSidebar`，方法 `registerTab(descriptor)` **返回 disposer**；
 *   ② descriptor 的 `id` 同时是 tab 的 `type`（内置用 `'explorer'`，我们用自己的命名空间）；
 *   ③ `component: (props) => ReactNode`。
 *
 * 降级策略：**better-sidebar 不在时不注册、只记一条日志**。
 * 绝不能因为一个可选 UI 服务缺席就让整个插件装载失败（那会变成静默禁用，更难查）。
 * 也**不能**在插件顶层声明 `inject: ['betterSidebar']`：Cordis 会因此把整个插件判成
 * 未激活（panel 与 http-bridge 都实测过），所以这里是**可选依赖 + 自己取服务**。
 */

export interface TabDescriptorLike {
  /** better-sidebar 的 `icon` 接受任意 ReactNode 或 `(size) => ReactNode`。 */
  icon?: unknown;
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
  /** 成功时把服务句柄带出来（将来要做左栏定向入口时需要它）。 */
  service?: BetterSidebarLike;
}

export const DAILY_LIFE_TAB_ID = 'oblivion:daily-life';

/** 默认 descriptor（`component` 由调用方注入，避免本模块依赖 React）。 */
export function dailyLifeDescriptor(
  component: TabDescriptorLike['component'],
  icon?: (size: number) => unknown,
): TabDescriptorLike {
  return {
    id: DAILY_LIFE_TAB_ID,
    title: () => '有数',
    description: () => '物品服役账本：真实日均成本、服役进度与闲置损耗',
    ...(icon === undefined ? {} : { icon }),
    order: 72,
    single: true,
    component,
  };
}

/**
 * 注册「有数」tab。
 *
 * @param ctx - 客户端 ctx（结构化类型，不依赖框架类型）。
 * @param component - tab 组件（React 组件，由调用方传入）。
 * @param warn - 记日志用。
 * @param icon - 可选的 tab 图标工厂（`(size) => ReactNode`）；不给就是默认方块图标。
 */
export function registerDailyLifeTab(
  ctx: ClientCtxLike,
  component: TabDescriptorLike['component'],
  warn: (message: string) => void,
  icon?: (size: number) => unknown,
): RegisterResult {
  const attach = (service: BetterSidebarLike | undefined): RegisterResult => {
    if (!service || typeof service.registerTab !== 'function') {
      return { status: 'no-service', detail: 'ctx.betterSidebar 不可用（dsh-better-sidebar 未装载？）' };
    }
    try {
      const dispose = service.registerTab(dailyLifeDescriptor(component, icon));
      if (typeof dispose === 'function' && typeof ctx.effect === 'function') {
        ctx.effect(() => dispose as () => void, 'oblivion-daily-life: better-sidebar tab');
      }
      return { status: 'registered', service };
    } catch (error) {
      return { status: 'failed', detail: error instanceof Error ? error.message : String(error) };
    }
  };

  if (typeof ctx.inject === 'function') {
    const result: RegisterResult = { status: 'no-service', detail: 'inject 回调未触发' };
    try {
      ctx.inject(['betterSidebar'], (scope) => {
        // **必须 `Object.assign` 到同一个对象上**（而不是换引用）：`ctx.inject` 的回调
        // 可能是异步触发的，换引用会让调用方手里那个对象永远是「no-service」
        // —— 这就是 panel 那边「左栏入口点击没反应」的真凶。
        Object.assign(result, attach(scope?.betterSidebar));
        if (result.status !== 'registered') warn('有数 tab 未注册：' + String(result.detail ?? result.status));
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      warn('有数 tab 注册失败：' + detail);
      return { status: 'failed', detail };
    }
    return result;
  }

  // 没有 inject：退化成直接取服务（老外壳/精简外壳）。
  const direct = typeof ctx.get === 'function' ? (ctx.get('betterSidebar') as BetterSidebarLike | undefined) : undefined;
  const result = attach(direct);
  if (result.status !== 'registered') warn('有数 tab 未注册：' + String(result.detail ?? result.status));
  return result;
}
