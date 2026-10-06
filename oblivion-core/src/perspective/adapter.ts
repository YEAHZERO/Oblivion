import type { UserProfile } from '../types.js';
import type { Perspective } from './maker.js';

/**
 * 按用户能接受的详略渲染。**只渲染规则，不复述档案原文**（隐私约束）。
 * 没有内容时返回空串 —— 调用方据此决定是否注入，绝不注入空标题。
 */
export function adaptStyle(perspectives: Perspective[], profile: UserProfile): string {
  if (perspectives.length === 0) return '';
  const wantsDetail = profile.language_style.prefers.includes('detail');
  const lines = perspectives.map((p) => (wantsDetail ? '- ' + p.text + '（可展开）' : '- ' + p.text));
  return ['## 🧭 扩展思考', ...lines].join('\n');
}