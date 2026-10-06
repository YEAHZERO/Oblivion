import type { UserProfile } from '../types.js';

export function defaultProfile(): UserProfile {
  return {
    inquiry_style: { primary: 'unknown', secondary: 'unknown', confidence: 0 },
    followup_patterns: [],
    blind_spots: [],
    receptive_dimensions: [],
    resistant_dimensions: [],
    language_style: { tone: 'neutral', prefers: [], dislikes: [] },
    active_goals: [],
    sessions_observed: 0,
  };
}

function union(a: string[] = [], b: string[] = []): string[] {
  return [...new Set([...a, ...b])].slice(0, 40);
}

/**
 * 浅合并 + 数组去重（数组字段都是「集合」语义，追加不复写）。
 * 刻意不删除：剔除某维度要显式走 user_override。
 */
export function mergeProfile(cur: UserProfile, signal: Partial<UserProfile>): UserProfile {
  return {
    ...cur,
    ...signal,
    inquiry_style: { ...cur.inquiry_style, ...(signal.inquiry_style ?? {}) },
    language_style: { ...cur.language_style, ...(signal.language_style ?? {}) },
    followup_patterns: union(cur.followup_patterns, signal.followup_patterns),
    blind_spots: union(cur.blind_spots, signal.blind_spots),
    receptive_dimensions: union(cur.receptive_dimensions, signal.receptive_dimensions),
    resistant_dimensions: union(cur.resistant_dimensions, signal.resistant_dimensions),
    active_goals: union(cur.active_goals, signal.active_goals),
    sessions_observed: Math.max(cur.sessions_observed, signal.sessions_observed ?? 0),
  };
}