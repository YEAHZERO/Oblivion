/**
 * **左栏（侧边栏底部动作区）的 Oblivion 入口**。
 *
 * 座位是官方 `ui-sidebar` 声明的 `sidebar.footer.action`（list，scope root，紧挨设置）——
 * 它的组件由**我们自己**渲染，因此点击行为完全可控：直接调 `dsh-better-sidebar` 的服务
 * `openTab({ type: 'oblivion:panel', target: 'right' })` 把右侧那一列切到 Oblivion 页。
 *
 * 为什么不用 `sidebar.panellist`：那个座位的 id 必须指向一个**主栏面板**，点击由外壳接管；
 * 而我们要的是「打开右侧栏的某个 tab」，属于 better-sidebar 的地盘 —— 用错座位会静默不生效。
 */

import type { JSX } from 'react';
import { POLARIS_ICON_COLOR, POLARIS_ICON_PATH, POLARIS_VIEWBOX } from './polaris.js';

/**
 * 北极星图标（**图标字重** + 指定蓝 `#4176e6`）。
 *
 * 与宿主图标集同风格的三条：① 粗实心（内/外半径比 0.46）② 单色 ③ **颜色 = `#4176e6`**
 * （所有者指定，与那套图标里的蓝一致）—— 左栏与 tab 卡片因此和地球/侧边对话那几颗**同色同形**。
 */
export function PolarisGlyph({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox={'0 0 ' + POLARIS_VIEWBOX.width + ' ' + POLARIS_VIEWBOX.height}
      fill={POLARIS_ICON_COLOR}
      aria-hidden
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      <path d={POLARIS_ICON_PATH} />
    </svg>
  );
}

/** better-sidebar 服务里我们用到的那一个方法（结构化类型，不 import 第三方包）。 */
export interface OpenTabCapable {
  openTab?(input: { type: string; title?: string; id?: string; target?: 'right' | 'bottom' | 'side' }): unknown;
  activate?(tabId: string): boolean;
}

export type OpenOutcome = 'opened' | 'no-service' | 'failed';

/** 打开（或聚焦）右侧栏的 Oblivion 页。降级：服务缺席时只回一个状态，不抛错。 */
export function openOblivionTab(service: OpenTabCapable | undefined, tabType: string): OpenOutcome {
  if (!service || typeof service.openTab !== 'function') return 'no-service';
  try {
    service.openTab({ type: tabType, target: 'right' });
    return 'opened';
  } catch {
    return 'failed';
  }
}

/** 左栏动作按钮的 props（外壳只给 `wide`）。 */
export interface FooterActionProps {
  wide?: boolean;
}

/**
 * 左栏动作组件：图标 + 文案（窄栏只留图标）。
 * 点击 → 打开右侧 Oblivion 页；失败时什么也不做（日志由注册处打）。
 */
export function createLeftbarAction(
  onActivate: () => void,
): (props: FooterActionProps) => JSX.Element {
  return function OblivionLeftbarAction(props: FooterActionProps): JSX.Element {
    const wide = props?.wide !== false;
    return (
      <button
        type="button"
        onClick={onActivate}
        title="打开 Oblivion 认知面板（右侧栏）"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          padding: wide ? '6px 8px' : '6px 0',
          justifyContent: wide ? 'flex-start' : 'center',
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        <PolarisGlyph size={16} />
        {wide ? <span>Oblivion</span> : null}
      </button>
    );
  };
}
