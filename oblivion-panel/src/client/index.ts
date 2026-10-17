/**
 * @oblivion/panel — 浏览器半边入口。
 *
 * `inject` 刻意留空：本插件**只有**一个可选依赖（`dsh-better-sidebar` 提供的 `ctx.betterSidebar`），
 * 它缺席时应当「不注册面板但插件照常装载」，而不是让整棵客户端树因为一个 UI 服务缺失而倒掉。
 *
 * 四条注册：
 *   ① **右侧栏 tab**（`registerPanelTab` → `betterSidebar.registerTab`）
 *   ② **左栏入口**（官方 `sidebar.footer.action`）→ 点击把右侧那一列切到 Oblivion 页
 *   ③ **设置分节**（官方 `settings.section`）→ 设置 → **Oblivion 知识库**（路径 / 自动整理 / 模型）
 *   ④ **ctx 形状自报**（POST 给自己的 Node 半边）→ 与 core 的 dump 对照，定位 `inject` 缺失的根因
 */

import { createElement } from 'react';
import { postDiag } from './diag.js';
import { OblivionPanel } from './Panel.js';
import { OblivionSettingsSection } from './SettingsSection.js';
import { createLeftbarAction, openOblivionTab, PolarisGlyph, type OpenTabCapable } from './leftbar.js';
import { openNoteInSidebar, type OpenFileCapable } from './open-note.js';
import { PANEL_TAB_ID, registerPanelTab, type ClientCtxLike, type RegisterResult } from './register.js';
import {
  SETTINGS_SECTION_ID,
  SETTINGS_SECTION_LABEL,
  SETTINGS_SECTION_ORDER,
} from './settings-model.js';

/**
 * **必须声明 `slots`**：Cordis 对未在 `inject` 里声明的服务访问会**抛错**
 * （`cannot get property "slots" without inject`），而左栏入口要用 `ctx.slots.register`。
 * 原先是 `inject: []` + 裸读 `ctx.slots` → **panel 装载失败、App 起不来**
 * （实测崩溃日志：`web boot: 1 entry did not activate @oblivion/panel: failed`）。
 *
 * `betterSidebar` 仍走**渐进注册**（`ctx.inject(['betterSidebar'], …)`）：它来自第三方插件，
 * 缺席时应「不注册右侧 tab 但插件照常装载」。
 */
export const inject: string[] = ['slots'];

const LOG_NAME = '@oblivion/panel';

interface SlotServiceLike {
  inject?(slot: string, callback: () => unknown): unknown;
  register?(options: Record<string, unknown>, component: unknown): unknown;
}

/**
 * side bar 递给 tab 组件的 props 里我们真正用到的几个
 * （官方契约是 `TabComponentProps`，`dsh-better-sidebar` 的 `lib/types/client/service.d.ts:123`：
 * `ctx` / `store` / `scope: SessionScope` / `tab` / `visible`，外加可选的 `onOpenFile`）。
 */
interface PanelPropsLike {
  visible?: boolean;
  scope?: { sessionId?: string; cwd?: string };
  onOpenFile?: (path: string) => void;
}

/**
 * ① ctx 形状自报（诊断；失败绝不影响装载）。`extra` 用来带上各 UI 注册的结果。
 *
 * 落盘是**覆盖**式的（`panel-client-diag.json` 留最后一次报告，用 `where` 区分）——
 * 所以设置分节真正挂载时的那一条（`where: 'settings-section'`）会盖掉这一条，
 * 那是刻意的：它才证明座位被真的渲染过。
 */
function reportCtxShape(ctx: ClientCtxLike, extra: Record<string, unknown> = {}): void {
  try {
    const target = ctx as unknown as Record<string, unknown>;
    const keys = Object.keys(target).slice(0, 80);
    const typeofs: Record<string, string> = {};
    for (const key of keys) {
      try {
        typeofs[key] = typeof target[key];
      } catch {
        typeofs[key] = '(throws)';
      }
    }
    const prototypes: string[] = [];
    let cursor: unknown = Object.getPrototypeOf(target);
    for (let depth = 0; depth < 5 && cursor; depth += 1) {
      prototypes.push((cursor as { constructor?: { name?: string } }).constructor?.name ?? '(anonymous)');
      cursor = Object.getPrototypeOf(cursor);
    }
    const probes: Record<string, string> = {};
    for (const name of ['on', 'emit', 'inject', 'get', 'provide', 'effect', 'slots', 'locale', 'shortcuts', 'betterSidebar', 'layout', 'session', 'remote', 'logger']) {
      try {
        const value = typeof target[name];
        if (value !== 'undefined') probes[name] = value;
      } catch {
        probes[name] = '(throws)';
      }
    }
    const body = JSON.stringify({
      at: Date.now(),
      where: 'client',
      keys,
      typeofs,
      prototypes,
      probes,
      hasInject: typeof target.inject === 'function',
      hasGet: typeof target.get === 'function',
      ...extra,
    });
    void fetch('/oblivion-panel/diag', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      credentials: 'same-origin',
    }).catch(() => undefined);
  } catch {
    // 诊断本身绝不影响装载
  }
}

export function apply(ctx: ClientCtxLike): void {
  const logger = (ctx as { logger?: (name: string) => { warn?: (m: string) => void; info?: (m: string) => void } }).logger?.(LOG_NAME);
  const warn = (message: string): void => logger?.warn?.(message);

  /**
   * **在调用那一刻**才读服务句柄。
   *
   * `registerPanelTab` 里的 `ctx.inject(['betterSidebar'], …)` 可能是异步触发的，
   * 提前取 `result.service` 会永远拿到 `undefined` ⇒ 左栏入口走 'no-service' 分支、
   * 只留一条日志 —— 这就是「左下角图标点不动」的真凶（实测那一次点击的结果是
   * `outcome:"no-service"`，修好后同一条自报变成 `outcome:"opened"`）。
   */
  let result: RegisterResult = { status: 'no-service', detail: '尚未注册' };
  const readService = (): (OpenTabCapable & OpenFileCapable) | undefined =>
    result.service as unknown as (OpenTabCapable & OpenFileCapable) | undefined;

  /** 面板里点一条笔记 → 请侧边栏打开；结果落进诊断自报（点了没反应时能看出卡在哪一步）。 */
  const openNote = (props: PanelPropsLike, path: string): void => {
    const service = readService();
    const outcome = openNoteInSidebar({ service, scope: props.scope, path, hostOpen: props.onOpenFile });
    postDiag({
      at: Date.now(),
      where: 'open-note',
      outcome,
      path,
      hasService: service !== undefined,
      hasOpenFile: typeof service?.openFile === 'function',
      hasSessionId: typeof props.scope?.sessionId === 'string',
      tabStatus: result.status,
    });
    if (outcome === 'opened' || outcome === 'opened-via-host-prop') logger?.info?.('已请侧边栏打开笔记：' + path);
    else warn('打开笔记失败（' + outcome + '）：' + path);
  };

  // ① 右侧栏 tab（组件外包一层：把「打开笔记」注入进去）
  const panelComponent = (props: PanelPropsLike) =>
    createElement(OblivionPanel, {
      visible: props.visible,
      onOpenFile: (path: string) => openNote(props, path),
    });
  result = registerPanelTab(ctx, panelComponent as never, warn, (size: number) => createElement(PolarisGlyph, { size }));
  if (result.status === 'registered') logger?.info?.('已在 side bar 注册 Oblivion 面板 tab');
  else warn('面板 tab 未注册：' + String(result.detail ?? result.status));

  // ② 左栏入口（官方 sidebar.footer.action）
  //    `slots` 已声明 inject；仍 try/catch —— 守卫读错也只该「少一个入口」，
  //    不该让整个客户端 entry 装载失败（这正是上次 App 起不来的原因）。
  let slots: SlotServiceLike | undefined;
  try {
    slots = (ctx as { slots?: SlotServiceLike }).slots;
  } catch (error) {
    warn('读取 ctx.slots 被宿主守卫拦下：' + (error instanceof Error ? error.message : String(error)));
  }
  let leftbarRegistered = false;
  if (slots && typeof slots.inject === 'function' && typeof slots.register === 'function') {
    const component = createLeftbarAction(() => {
      const service = readService();
      const outcome = openOblivionTab(service, PANEL_TAB_ID);
      postDiag({
        at: Date.now(),
        where: 'leftbar-click',
        outcome,
        hasService: service !== undefined,
        hasOpenTab: typeof service?.openTab === 'function',
        tabStatus: result.status,
        tabType: PANEL_TAB_ID,
      });
      if (outcome === 'opened') logger?.info?.('左栏入口：已打开右侧 Oblivion 页');
      else warn('左栏入口：打开右侧 Oblivion 页失败（' + outcome + '）');
    });
    try {
      slots.inject('sidebar.footer.action', () =>
        slots.register?.({ name: 'sidebar.footer.action', id: 'oblivion-panel', order: 60, label: () => 'Oblivion' }, component),
      );
      leftbarRegistered = true;
    } catch (error) {
      warn('左栏入口注册失败：' + (error instanceof Error ? error.message : String(error)));
    }
  } else {
    warn('slots 服务不可用：左栏入口未注册（右侧栏 tab 不受影响）');
  }

  // ③ 设置分节（官方 `settings.section`，由 `@deepseek-ai/dsh-client-ui-settings` 声明）
  //
  // 与左栏入口同一套降级：`slots` 在就注册，不在就只记一条日志 —— 少一个设置分节
  // 绝不该让整个客户端 entry 装载失败（那会连面板 tab 一起没了）。
  // 座位声明必须在 `package.json` 的 `compat.requires.slots` / `slotKinds` 里也写上，
  // 否则 DSH 升级把槽位改名时我们只会「静静地少了一页」（`verify-dsh-compat.ps1` 会红）。
  //
  // 这里只能报「**请求已发出**」（`inject` 没抛）：槽位是 `@deepseek-ai/dsh-client-ui-settings`
  // 在它自己装载时**运行时声明**的，回调何时被调用由它决定。真正的「挂上了」由
  // `SettingsSection.tsx` 挂载后发回的那条自报（`where: 'settings-section'`）作证 ——
  // 拿一个乐观的 true 冒充成功，正是这个仓库已在「面板 tab 点不动」上付过一次的代价。
  let settingsSectionRequested = false;
  if (slots && typeof slots.inject === 'function' && typeof slots.register === 'function') {
    try {
      slots.inject('settings.section', () =>
        slots.register?.(
          {
            name: 'settings.section',
            id: SETTINGS_SECTION_ID,
            order: SETTINGS_SECTION_ORDER,
            label: () => SETTINGS_SECTION_LABEL,
          },
          OblivionSettingsSection,
        ),
      );
      settingsSectionRequested = true;
    } catch (error) {
      warn('设置分节注册失败：' + (error instanceof Error ? error.message : String(error)));
    }
  } else {
    warn('slots 服务不可用：设置分节未注册（设置 → ' + SETTINGS_SECTION_LABEL + ' 不会出现）');
  }

  // ④ ctx 形状自报（带上三个 UI 注册的真实结果，省得靠 DevTools 猜）
  reportCtxShape(ctx, {
    panelTab: { status: result.status, detail: result.detail ?? null, tabId: PANEL_TAB_ID },
    leftbar: { requested: leftbarRegistered, seat: 'sidebar.footer.action' },
    settingsSection: {
      requested: settingsSectionRequested,
      seat: 'settings.section',
      id: SETTINGS_SECTION_ID,
      order: SETTINGS_SECTION_ORDER,
      note: '真正挂上与否看同目录下 where=settings-section 的那条自报',
    },
  });
}

export default { inject, apply };
