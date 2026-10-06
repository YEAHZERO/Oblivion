export const MS_PER_DAY = 86_400_000;

export function now(): number {
  return Date.now();
}

/**
 * 时钟保护（R-202）：时钟回退时年龄必须是 0，不能是负数 ——
 * 负数会让衰减公式把权重放大。
 */
export function ageDays(from: number, at: number = now()): number {
  return Math.max(0, (at - from) / MS_PER_DAY);
}

/** 时间戳前缀 id：同一毫秒内也保持大致有序，末尾两位随机防撞。 */
export function newId(at: number = now()): string {
  const rand = Math.random().toString(36).slice(2, 4).padEnd(2, '0');
  return `ts-${at.toString(36)}-${rand}`;
}

export function isoDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

export function today(): string {
  return isoDate(now());
}