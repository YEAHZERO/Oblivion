/**
 * 品牌名文字的持久化与订阅。
 *
 * 存储用浏览器 `localStorage`：桌面端只有一个持久化的浏览器配置，
 * 因此不需要宿主半边与 HTTP 路由。所有读写都包在 try/catch 里 ——
 * 存储被禁用（隐私模式、受限 iframe）时退化为「仅本次会话内存态」，
 * 绝不让品牌槽位因为存储失败而崩掉。
 */

import { useEffect, useState } from 'react';

/** 未自定义时的默认名称。 */
export const DEFAULT_BRAND_NAME = 'Oblivion';

/** 输入长度上限：侧栏品牌行是窄容器，过长的文字会破坏布局。 */
export const MAX_BRAND_NAME_LENGTH = 24;

const STORAGE_KEY = 'oblivion-brand:name';

function read(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? DEFAULT_BRAND_NAME : raw.slice(0, MAX_BRAND_NAME_LENGTH);
  } catch {
    return DEFAULT_BRAND_NAME;
  }
}

let current = read();
const listeners = new Set<() => void>();

/** 当前品牌名（空串表示不显示文字）。 */
export function brandName(): string {
  return current;
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

/** 写入品牌名并持久化。传空串即隐藏文字。 */
export function setBrandName(next: string): void {
  const trimmed = next.slice(0, MAX_BRAND_NAME_LENGTH);
  current = trimmed;
  try {
    localStorage.setItem(STORAGE_KEY, trimmed);
  } catch {
    /* 存储不可用：内存态仍然生效 */
  }
  notify();
}

/** 恢复默认名称，并清掉存储键。 */
export function resetBrandName(): void {
  current = DEFAULT_BRAND_NAME;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 同上 */
  }
  notify();
}

/** 当前是否偏离默认值。 */
export function isBrandNameCustomized(): boolean {
  return current !== DEFAULT_BRAND_NAME;
}

/** 订阅变更；返回取消订阅函数（满足 React 外部 store 约定）。 */
export function subscribeBrandName(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React 侧读取钩子。 */
export function useBrandName(): string {
  const [value, setValue] = useState(current);
  useEffect(() => subscribeBrandName(() => setValue(current)), []);
  return value;
}
