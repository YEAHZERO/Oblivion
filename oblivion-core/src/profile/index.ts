import { mkdir, readFile } from 'node:fs/promises';
import { writeFile } from '../util/fs.js';
import { dirname, join } from 'node:path';
import type { AppContext } from '../core-types.js';
import type { Config } from '../config.js';
import type { QAPair, UserProfile } from '../types.js';
import { expandHome } from '../util/paths.js';
import { defaultProfile, mergeProfile } from './schema.js';

/** 低于这个置信度的推断一律不用（设计书：< 0.3 忽略）。 */
const CONFIDENCE_FLOOR = 0.3;

export interface StyleSignal {
  confidence: number;
  patch: Partial<UserProfile>;
}

export interface ProfileService {
  read(): Promise<UserProfile>;
  update(signal: Partial<UserProfile>): Promise<UserProfile>;
  updateFromQA(qa: QAPair): Promise<UserProfile | undefined>;
}

/**
 * 用户思维档案。存在 `<dataRoot>/profile.json`，**不在 KB 目录**（R-205），
 * 且只把摘要规则注入 systemPrompt，绝不把档案原文喂给模型。
 */
export function registerProfile(ctx: AppContext, config: Config): ProfileService {
  const path = join(expandHome(config.dataRoot), 'profile.json');

  async function raw(): Promise<UserProfile> {
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8')) as UserProfile;
      return { ...defaultProfile(), ...parsed };
    } catch {
      return defaultProfile();
    }
  }

  async function read(): Promise<UserProfile> {
    const p = await raw();
    if (!p.user_override) return p;
    // 用户覆盖优先：合并后仍把 user_override 留在档案里，便于审计「哪些是被用户改过的」。
    return { ...mergeProfile(p, p.user_override), user_override: p.user_override };
  }

  async function write(p: UserProfile): Promise<UserProfile> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(p, null, 2) + '\n', 'utf8');
    return p;
  }

  ctx.effect(() => () => {
    // 档案是纯文件状态，卸载时无需清理任何句柄；留一个显式空 teardown 便于阅读。
  }, 'oblivion-core: profile teardown');

  return {
    read,
    update: async (signal) => write(mergeProfile(await raw(), signal)),

    async updateFromQA(qa) {
      const signal = extractStyleSignal(qa);
      if (signal.confidence < CONFIDENCE_FLOOR) return undefined;
      const cur = await raw();
      const next = mergeProfile(cur, signal.patch);
      next.sessions_observed = cur.sessions_observed + 1;
      return write(next);
    },
  };
}

/**
 * 确定性风格探针：只声称文本里能直接看到的证据。
 * 置信度上限 0.5 —— 不靠单个问题就断定一个人的思维风格。
 */
export function extractStyleSignal(qa: QAPair): StyleSignal {
  const q = qa.question;
  const evidence: Array<{ dim: string; hit: boolean }> = [
    { dim: 'mechanism', hit: /为什么|原理|机制|why|how does|internals/i.test(q) },
    { dim: 'procedure', hit: /怎么|如何|步骤|流程|how to|guide/i.test(q) },
    { dim: 'decision', hit: /选|对比|哪个|取舍|trade-?off|versus|\bvs\b/i.test(q) },
    { dim: 'risk', hit: /风险|问题|坑|失败|会不会|risk|fail/i.test(q) },
    { dim: 'design', hit: /设计|架构|拆分|重构|design|architect/i.test(q) },
  ];

  const hits = evidence.filter((e) => e.hit);
  const confidence = Math.min(0.5, hits.length * 0.15);
  const primary = hits[0]?.dim ?? 'unknown';

  return {
    confidence,
    patch: {
      inquiry_style: { primary, secondary: hits[1]?.dim ?? 'unknown', confidence },
      language_style: {
        tone: 'terse',
        prefers: qa.answer.length > 1200 ? ['detail'] : ['concise'],
        dislikes: [],
      },
      followup_patterns: q.split('\n').length > 3 ? ['multi-part question'] : [],
    },
  };
}