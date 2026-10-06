import type { Config } from '../config.js';
import type { FeedbackEntry } from '../types.js';
import type { ProfileService } from '../profile/index.js';

/**
 * 画像微调：累积触发 + 1/N 权重。
 *
 * 两条闸门（R-204）：① 必须是同一 target 上连续同向的 N 条；
 * ② 第 N 条权重 1/N，所以单次误点推不动档案。
 */
export async function tune(
  entries: FeedbackEntry[],
  target: string,
  profile: ProfileService,
  threshold: number,
): Promise<boolean> {
  const same = entries.filter((e) => e.target === target && e.signal !== 0);
  if (same.length < threshold) return false;

  const recent = same.slice(-threshold);
  const allUp = recent.every((e) => e.signal === 1);
  const allDown = recent.every((e) => e.signal === -1);
  if (!allUp && !allDown) return false;

  let weight = 0;
  for (let i = 1; i <= recent.length; i += 1) weight += 1 / i;
  const confidence = Math.min(0.8, weight / threshold);

  if (allUp) {
    await profile.update({
      receptive_dimensions: [target],
      inquiry_style: { primary: target, secondary: 'unknown', confidence },
    });
  } else {
    await profile.update({ resistant_dimensions: [target] });
  }
  return true;
}