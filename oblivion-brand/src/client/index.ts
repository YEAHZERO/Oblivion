/**
 * @oblivion/brand — 浏览器半边入口。
 *
 * ## 注册面
 *
 * | 槽位 | 组件 | 何时注册 |
 * |---|---|---|
 * | `sidebar.brand.mark` | `OblivionBrandMark` | 设置里「接管 DSH 品牌」为开 |
 * | `sidebar.brand.name` | `OblivionBrandName` | 同上 |
 * | `conversation.hero.brand.mark` | `OblivionBrandMark` | 同上 |
 * | `settings.section` | 设置分节 | **永远**（否则关掉接管后无法再打开） |
 * | `sidebar.panellist` + `main` | 侧栏面板条目 / 正文 | 设置里勾选了对应提供方 |
 *
 * ## priority 为什么是 -10
 *
 * 官方 `@deepseek-ai/dsh-client-ui-brand-official` 在默认 priority(0) 占了同一批
 * single 槽。single 槽规则（`ui-slots` 实现）：
 *   同 priority 重复注册 → 抛错；不同 priority → 遮蔽，且 **lowest renders**。
 *
 * 于是「关闭接管」只需要 **dispose 本插件的注册** —— 官方那条立刻重新成为渲染者，
 * DSH 恢复原生外观。这是槽位系统本来就支持的机制，不需要改官方包。
 *
 * ## 动态注册
 *
 * 设置变化时按需 register / dispose。槽位必须先被声明才能注册，所以每一处都先
 * 用 `slots.inject` 等声明就位，再在 `sync()` 里统一对账；注册动作本身也包了
 * try/catch —— 单个槽位注册失败不应该让整棵客户端树倒掉。
 */

import { createElement } from 'react';
import { OblivionBrandMark, OblivionBrandName } from './Brand.js';
import { createBrandSettingsPanel } from './BrandSettingsPanel.js';
import {
  PANEL_ORDER_BASE,
  PanelIcon,
  createEmbeddedPanel,
  discoverPanelProviders,
  panelEntryId,
  providerLabel,
} from './panels.js';
import { brandSettings, subscribeBrandSettings } from './settings.js';

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
  reflect?: { store?: Record<PropertyKey, unknown> } | undefined;
  effect?(callback: () => unknown, label?: string): void;
  logger?(name: string): { warn(message: string): void };
  provide?(name: string, value: unknown): unknown;
}

/** 本插件作为「可嵌入面板提供方」对外暴露的服务名。 */
const PROVIDER_NAME = 'oblivionBrand';

/** 已声明就位的槽位。 */
interface Ready {
  mark: boolean;
  name: boolean;
  hero: boolean;
  panellist: boolean;
  main: boolean;
}

/**
 * 把品牌槽位与侧栏面板注册成一条可反复对账的账本。
 *
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientCtx): void {
  const ready: Ready = { mark: false, name: false, hero: false, panellist: false, main: false };
  const disposers = new Map<string, () => void>();
  const panelKeys = new Set<string>();
  const warn = (message: string): void => {
    ctx.logger?.('@oblivion/brand').warn(message);
  };

  /** 打开一条注册；失败只记日志，不影响其它槽位。 */
  const open = (key: string, create: () => unknown): void => {
    try {
      const result = create();
      if (typeof result === 'function') disposers.set(key, result as () => void);
    } catch (error) {
      warn(`槽位注册失败 ${key}：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /** 关闭并移除一条注册。 */
  const close = (key: string): void => {
    const dispose = disposers.get(key);
    if (dispose === undefined) return;
    disposers.delete(key);
    try {
      dispose();
    } catch (error) {
      warn(`槽位释放失败 ${key}：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /** 按期望状态对账一条注册。 */
  const reconcile = (key: string, wanted: boolean, create: () => unknown): void => {
    const has = disposers.has(key);
    if (wanted && !has) open(key, create);
    else if (!wanted && has) close(key);
  };

  const settingsPanel = createBrandSettingsPanel(() => discoverPanelProviders(ctx));

  /**
   * 让本插件也成为一个「可嵌入的面板提供方」。
   *
   * 用的是与 `dshmarket` 相同的约定形状（`version` + `render()`），因此：
   *   - 它会被自己的发现逻辑列进「左侧栏面板」，可以把自己挂到侧栏；
   *   - 任何别的宿主插件也能通过 `ctx.get('oblivionBrand').render()` 内嵌本插件。
   *
   * 之所以带 `version`，是因为发现逻辑靠这个形状把 UI 控制面与
   * `remote.*` 那类 RPC 服务区分开（见 `panels.tsx` 的说明）。
   */
  let disposeProvider: (() => void) | undefined;
  if (typeof ctx.provide === 'function') {
    try {
      const handle = ctx.provide(PROVIDER_NAME, {
        version: 1,
        settingsVisible: () => true,
        setSettingsVisible: () => undefined,
        render: () => createElement(settingsPanel),
      });
      if (typeof handle === 'function') disposeProvider = handle as () => void;
    } catch (error) {
      warn(`提供方面板注册失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** 依据当前设置与槽位就绪情况，把账本对齐。 */
  const sync = (): void => {
    const settings = brandSettings();
    const override = settings.overrideEnabled;

    reconcile('brand.mark', override && ready.mark, () =>
      ctx.slots.register({ name: 'sidebar.brand.mark', priority: BRAND_PRIORITY }, OblivionBrandMark),
    );
    reconcile('brand.name', override && ready.name, () =>
      ctx.slots.register({ name: 'sidebar.brand.name', priority: BRAND_PRIORITY }, OblivionBrandName),
    );
    reconcile('brand.hero', override && ready.hero, () =>
      ctx.slots.register({ name: 'conversation.hero.brand.mark', priority: BRAND_PRIORITY }, OblivionBrandMark),
    );

    // ---- 侧栏面板 ----
    const wanted = new Set(settings.sidebarPanels);
    const available = new Map(discoverPanelProviders(ctx).map((provider) => [provider.key, provider]));

    for (const key of [...panelKeys]) {
      if (!wanted.has(key) || !available.has(key)) {
        close(`panel.main:${key}`);
        close(`panel.list:${key}`);
        panelKeys.delete(key);
      }
    }

    let order = PANEL_ORDER_BASE;
    for (const key of wanted) {
      const provider = available.get(key);
      if (provider === undefined) {
        order += 1;
        continue;
      }
      const id = panelEntryId(key);
      const label = providerLabel(key);
      // main 必须先于 panellist 注册：`layout.selectPanel` 对未注册的 key 会抛错。
      reconcile(`panel.main:${key}`, ready.main, () =>
        ctx.slots.register(
          { name: 'main', key: id },
          createEmbeddedPanel(() => available.get(key), label),
        ),
      );
      reconcile(`panel.list:${key}`, ready.panellist, () =>
        ctx.slots.register({ name: 'sidebar.panellist', id, order, label: () => label }, PanelIcon),
      );
      panelKeys.add(key);
      order += 1;
    }
  };

  // ---- 等待各槽位声明就位 ----
  ctx.slots.inject('sidebar.brand.mark', () => {
    ready.mark = true;
    sync();
  });
  ctx.slots.inject('sidebar.brand.name', () => {
    ready.name = true;
    sync();
  });
  ctx.slots.inject('conversation.hero.brand.mark', () => {
    ready.hero = true;
    sync();
  });
  ctx.slots.inject('sidebar.panellist', () => {
    ready.panellist = true;
    sync();
  });
  ctx.slots.inject('main', () => {
    ready.main = true;
    sync();
  });

  // 设置分节常驻：关掉接管之后仍然要能从这里改回来。
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: SETTINGS_ID,
        order: SETTINGS_ORDER,
        label: () => 'Oblivion 品牌',
      },
      settingsPanel,
    ),
  );

  // 设置变化后重新对账。
  const unsubscribe = subscribeBrandSettings(sync);
  const disposeSettings = (): void => {
    unsubscribe();
    for (const key of [...disposers.keys()]) close(key);
    disposeProvider?.();
    disposeProvider = undefined;
  };
  if (typeof ctx.effect === 'function') ctx.effect(() => disposeSettings, 'oblivion-brand: settings sync');

  sync();
}
