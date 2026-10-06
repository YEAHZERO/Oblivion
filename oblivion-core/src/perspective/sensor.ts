import type { QAPair, UserProfile } from '../types.js';

export interface StyleReading {
  breadth: number;
  depthSignals: number;
  askedForOptions: boolean;
  resistances: number;
}

/** 只读观察：问句有几个问号、是否多段、有没有在要选项。 */
export function sense(qa: QAPair, profile: UserProfile): StyleReading {
  const q = qa.question;
  return {
    breadth: (q.match(/[?？]/g) ?? []).length,
    depthSignals: (q.match(/\n[-*\d]/g) ?? []).length + (q.length > 400 ? 1 : 0),
    askedForOptions: /选|对比|哪个|alternative|option/i.test(q),
    resistances: profile.resistant_dimensions.length,
  };
}