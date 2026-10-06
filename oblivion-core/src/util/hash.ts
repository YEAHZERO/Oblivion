import { createHash } from 'node:crypto';

/** 只作去重键用，不是安全边界，sha1 足够。 */
export function sha1(input: string): string {
  return createHash('sha1').update(input, 'utf8').digest('hex');
}

/**
 * 归一化后再哈希：空白与常见中英文标点的差异不应算「新知识」。
 */
export function normalizeForHash(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\u3000]+/g, ' ')
    .replace(/[，。、；：！？,.;:!?"'\u201c\u201d\u2018\u2019()（）\[\]【】《》<>`*_\-—]+/g, '')
    .trim();
}

/** 短哈希，用于给来源打标。 */
export function shortHash(input: string): string {
  return sha1(input).slice(0, 12);
}