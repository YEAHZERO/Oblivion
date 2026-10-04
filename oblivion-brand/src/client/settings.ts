/**
 * 插件设置的持久化、订阅与迁移。
 *
 * 存储用浏览器 `localStorage`：桌面端只有一个持久化的浏览器配置，因此不需要
 * 宿主半边与 HTTP 路由。所有读写都包在 try/catch 里 —— 存储被禁用（隐私模式、
 * 受限 iframe）时退化为「仅本次会话内存态」，绝不让品牌槽位因为存储失败而崩掉。
 *
 * ## 迁移
 *
 * 0.1.0 只存了品牌名（键 `oblivion-brand:name` 的裸字符串）。0.2.0 起改用单个
 * JSON 文档 `oblivion-brand:settings:v1`。旧键在首次读取时被吸收并删除。
 */

import { useEffect, useState } from 'react';

/** 未自定义时的默认名称。 */
export const DEFAULT_BRAND_NAME = 'Oblivion';

/** 输入长度上限：侧栏品牌行是窄容器，过长的文字会破坏布局。 */
export const MAX_BRAND_NAME_LENGTH = 24;

/** 品牌图片 data URL 的字节上限（约 512 KB）。超过则拒绝，避免撑爆存储配额。 */
export const MAX_BRAND_IMAGE_BYTES = 512 * 1024;

/** 上传图片统一缩放到的最长边（px）。 */
export const BRAND_IMAGE_MAX_EDGE = 256;

const STORAGE_KEY = 'oblivion-brand:settings:v1';
const LEGACY_NAME_KEY = 'oblivion-brand:name';

/** 插件设置。`sidebarPanels` 里是「可嵌入面板提供方」的服务名。 */
export interface BrandSettings {
  /** 侧栏品牌名文字；空串表示只显示图形。 */
  readonly name: string;
  /** 自定义品牌图形（data URL）；`null` 表示使用内置北极星。 */
  readonly image: string | null;
  /** 是否接管 DSH 品牌。关闭后释放槽位，官方鲸鱼图标恢复。 */
  readonly overrideEnabled: boolean;
  /** 要挂到左侧栏的面板提供方服务名。 */
  readonly sidebarPanels: readonly string[];
  /**
   * 面板被嵌进主区域时，内容是否居中限宽。
   *
   * 同一个设置面板会渲染在两个宽度差异极大的容器里：设置弹窗很窄，主区域
   * 却是整窗宽。不居中时限宽列会贴在左边、右边留一大片空白，因此默认居中。
   */
  readonly centerPanel: boolean;
}

const DEFAULTS: BrandSettings = {
  name: DEFAULT_BRAND_NAME,
  image: null,
  overrideEnabled: true,
  sidebarPanels: ['market'],
  centerPanel: true,
};

function coerce(raw: unknown): BrandSettings {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULTS };
  const record = raw as Record<string, unknown>;
  const name = typeof record['name'] === 'string' ? record['name'].slice(0, MAX_BRAND_NAME_LENGTH) : DEFAULTS.name;
  const image = typeof record['image'] === 'string' && record['image'].startsWith('data:') ? record['image'] : null;
  const overrideEnabled = typeof record['overrideEnabled'] === 'boolean' ? record['overrideEnabled'] : DEFAULTS.overrideEnabled;
  const centerPanel = typeof record['centerPanel'] === 'boolean' ? record['centerPanel'] : DEFAULTS.centerPanel;
  const panels = Array.isArray(record['sidebarPanels'])
    ? record['sidebarPanels'].filter((v): v is string => typeof v === 'string')
    : [...DEFAULTS.sidebarPanels];
  return { name, image, overrideEnabled, sidebarPanels: panels, centerPanel };
}

function load(): BrandSettings {
  let text: string | null = null;
  try {
    text = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { ...DEFAULTS };
  }
  if (text !== null) {
    try {
      return coerce(JSON.parse(text));
    } catch {
      return { ...DEFAULTS };
    }
  }
  // 迁移 0.1.0 的裸字符串键
  try {
    const legacy = localStorage.getItem(LEGACY_NAME_KEY);
    if (legacy !== null) {
      localStorage.removeItem(LEGACY_NAME_KEY);
      return coerce({ ...DEFAULTS, name: legacy.slice(0, MAX_BRAND_NAME_LENGTH) });
    }
  } catch {
    /* 忽略 */
  }
  return { ...DEFAULTS };
}

let current: BrandSettings = load();
const listeners = new Set<() => void>();

/** 读取当前设置（快照，不可变）。 */
export function brandSettings(): BrandSettings {
  return current;
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/**
 * 合并写入设置。
 *
 * @param patch - 要覆盖的字段。
 * @returns 出错信息；`null` 表示已持久化。存储写失败时内存态**仍然生效**。
 */
export function updateBrandSettings(patch: Partial<BrandSettings>): string | null {
  const next = coerce({ ...current, ...patch });
  current = next;
  let error: string | null = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (cause) {
    error = cause instanceof Error ? `设置未能持久化：${cause.message}` : '设置未能持久化';
  }
  notify();
  return error;
}

/** 恢复全部默认设置。 */
export function resetBrandSettings(): string | null {
  return updateBrandSettings({ ...DEFAULTS });
}

/** 订阅变更；返回取消订阅函数。 */
export function subscribeBrandSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React 侧读取钩子。 */
export function useBrandSettings(): BrandSettings {
  const [value, setValue] = useState(current);
  useEffect(() => subscribeBrandSettings(() => setValue(current)), []);
  return value;
}
