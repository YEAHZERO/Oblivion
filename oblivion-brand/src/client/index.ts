/**
 * @oblivion/brand — 浏览器半边入口。
 *
 * 注册四组东西，全部走 DSH 的公开槽位 API：
 *
 * | 槽位 | 组件 | 作用 |
 * |---|---|---|
 * | `sidebar.brand.mark` | `OblivionBrandMark` | 侧栏品牌图形 → 北极星 |
 * | `sidebar.brand.name` | `OblivionBrandName` | 侧栏品牌名 → 可在设置里改 |
 * | `conversation.hero.brand.mark` | `OblivionBrandMark` | 会话 Hero 区图形 → 北极星 |
 * | `settings.section` | `BrandSettingsPanel` | 「设置 → Oblivion 品牌」 |
 * | `sidebar.panellist` + `main` | `MarketPanelIcon` / 市场面板 | 左侧栏「插件」下方的插件市场 |
 *
 * ## priority 为什么是 -10
 *
 * 官方 `@deepseek-ai/dsh-client-ui-brand-official` 在默认 priority(0) 占了同一批
 * single 槽。single 槽的注册规则（`ui-slots` 实现）是：
 *   同 priority 重复注册 → 抛错；不同 priority → 遮蔽，且 **lowest renders**。
 * 因此 -10 稳定覆盖官方，不需要改官方包。
 *
 * ## 为什么每处都包 `slots.inject`
 *
 * 注册未声明过的槽位会在加载时抛错。用 `slots.inject(name, cb)` 等声明方就位，
 * 于是本插件无论先于还是后于 ui-sidebar / ui-layout / ui-settings 加载都成立。
 */

import { OblivionBrandMark, OblivionBrandName } from './Brand.js';
import { BrandSettingsPanel } from './BrandSettingsPanel.js';
import {
  MARKET_PANEL_ID,
  MARKET_PANEL_ORDER,
  MarketPanelIcon,
  createMarketPanel,
  type MarketControl,
} from './market.js';

/** 必需服务：UI 槽位注册表。 */
export const inject = ['slots'];

/** 品牌槽位优先级：比官方默认 0 更低 = 渲染层级更高。 */
const BRAND_PRIORITY = -10;

/** 设置分节顺序。 */
const SETTINGS_ORDER = 45;

/** 设置分节 id。 */
const SETTINGS_ID = 'oblivion-brand';

/** 本插件用到的最小 ctx 面。 */
interface ClientCtx {
  slots: {
    inject(slot: string, callback: () => unknown): void;
    register(options: Record<string, unknown>, component: unknown): unknown;
  };
  get(name: string): unknown;
}

/**
 * 把品牌槽位注册成一组声明感知的事务。
 *
 * 侧栏的两个槽嵌套 inject，保证 mark 与 name 同进同退；
 * Hero 的图形单独一组（由 ui-conversation 声明，与侧栏不同生命周期）。
 *
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientCtx): void {
  // 侧栏组：mark + name
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark', priority: BRAND_PRIORITY }, OblivionBrandMark);
      yield ctx.slots.register({ name: 'sidebar.brand.name', priority: BRAND_PRIORITY }, OblivionBrandName);
    }),
  );

  // 会话 Hero 组的图形
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register(
      { name: 'conversation.hero.brand.mark', priority: BRAND_PRIORITY },
      OblivionBrandMark,
    ),
  );

  // 设置分节：自定义品牌名文字
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: SETTINGS_ID,
        order: SETTINGS_ORDER,
        label: () => 'Oblivion 品牌',
      },
      BrandSettingsPanel,
    ),
  );

  // 左侧栏条目：图标 + 顺序 + 标签
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: MARKET_PANEL_ID,
        order: MARKET_PANEL_ORDER,
        label: () => '插件市场',
      },
      MarketPanelIcon,
    ),
  );

  // 同 id 寻址的面板正文。市场可能晚于本插件就绪，故惰性查服务。
  ctx.slots.inject('main', () =>
    ctx.slots.register(
      { name: 'main', key: MARKET_PANEL_ID },
      createMarketPanel(() => ctx.get('market') as MarketControl | undefined),
    ),
  );
}
