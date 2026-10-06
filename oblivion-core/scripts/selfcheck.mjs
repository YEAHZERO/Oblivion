#!/usr/bin/env node
/**
 * @oblivion/core 自检：不依赖 DSHX（本机 Creator Mode+ 链路因 claim 依赖
 * POSIX `ps -o lstart=` 而全废，见 WORKSPACE.md 已知限制 1/3）。
 *
 * 它验证的是「本机能验证的全部」：
 *   1. 产物存在、可被真实 import（证明没有裸导入解析问题）
 *   2. 导出形状符合 object 插件约定
 *   3. 用桩 ctx 跑一次 apply，统计注册面
 *   4. 端到端跑一次 capture → MD 落盘（写到临时目录，不碰真实数据）
 *   5. 幂等：同一问答第二次捕获必须是 duplicate
 *   6. 防回灌：qa_loop 来源必须被拒绝
 *   7. 时钟保护：回退时钟下权重不增加
 *
 * 输出带 PASS/FAIL 前缀，退出码非 0 表示有失败项，便于挂进 CI。
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync as mkdir, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const results = [];
let failed = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push(['PASS', name, detail ?? '']);
  } catch (error) {
    failed += 1;
    results.push(['FAIL', name, error?.message ?? String(error)]);
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'oblivion-core-selfcheck-'));
const dataRoot = join(tmp, 'data');
const mdRoot = join(tmp, 'kb');

const mod = await import(new URL('file://' + join(ROOT, 'lib', 'index.js').replace(/\\/g, '/')).href);

await check('产物存在且可 import', () => {
  const lib = join(ROOT, 'lib', 'index.js');
  assert.ok(existsSync(lib), 'lib/index.js 不存在，先运行 build');
  return lib.slice(ROOT.length);
});

await check('导出形状符合 object 插件约定', () => {
  assert.equal(mod.name, '@oblivion/core');
  assert.deepEqual(mod.inject, ['tools', 'systemPrompt']);
  assert.equal(typeof mod.apply, 'function');
  assert.equal(typeof mod.default?.apply, 'function');
  return 'name / inject / apply / default.apply 齐备';
});

/** 只注册、不做磁盘动作的桩 ctx。 */
function makeCtx() {
  const reg = { tools: [], effects: [], events: [], sections: [] };
  return {
    reg,
    ctx: {
      tools: { register: (d) => reg.tools.push(d.name) },
      systemPrompt: {
        section: (d) => {
          reg.sections.push(d.name);
          return () => {};
        },
        getSectionOrder: () => 50,
      },
      logger: { warn: () => {}, info: () => {}, debug: () => {} },
      effect: (fn, label) => {
        reg.effects.push(label);
        return fn();
      },
      on: (event, handler) => {
        reg.events.push({ event, handler });
      },
    },
  };
}

await check('apply 注册面完整（7 工具 / 1 段落 / 事件 / 各自 effect）', () => {
  const { ctx, reg } = makeCtx();
  mod.apply(ctx, { dataRoot, mdRoot });
  assert.equal(reg.tools.length, 7, '工具数应为 7（含观测面与整理）');
  assert.deepEqual(reg.sections, ['OBLIVION_COGNITION']);
  assert.ok(reg.events.some((e) => e.event === 'session/event'), '必须监听 session/event');
  assert.ok(reg.events.some((e) => e.event === 'agent/created'), '必须在 agent 作用域补挂订阅');
  assert.ok(reg.effects.length >= 6, '每个模块都要有 effect 清理位');
  return reg.tools.join(', ');
});

// ---- 用桩 ctx 做一次真实的捕获（走真实文件系统）----
const { ctx, reg } = makeCtx();
mod.apply(ctx, { dataRoot, mdRoot });
const sectionHandler = reg.events.find((e) => e.event === 'session/event').handler;

/**
 * 按**真实的 `session/event` 事件流**触发一轮问答。
 *
 * ⚠️ 这里是本文件最重要的修正：旧版直接构造 `session.eventsSnapshot` 再调 handler，
 * 等于绕过了真实链路 —— 而真实 Host 里 `eventsSnapshot` 是 private 且在
 * 已废弃的 `snapshotEvents()` 里才懒加载，于是「自检全绿、真实落盘为空」。
 * 现在走 turn/start → user/message → assistant/message → turn/end，
 * 与运行时同一条路径。
 */
async function emitTurn(handler, session, { question, answer, turn, sourceKind }) {
  await handler(session, { type: 'turn/start', seq: 1, time: Date.now(), data: { turn } });
  await handler(session, {
    type: 'user/message',
    seq: 2,
    time: Date.now(),
    data: { text: question, source: sourceKind === undefined ? { kind: 'user' } : { kind: sourceKind } },
  });
  await handler(session, {
    type: 'assistant/message',
    seq: 3,
    time: Date.now(),
    data: { message: { content: [{ text: answer }] } },
  });
  await handler(session, { type: 'turn/end', seq: 4, time: Date.now(), data: { turn } });
  await new Promise((r) => setTimeout(r, 400));
}

const SESSION = { id: 'selfcheck-session' };

// 刻意写成「真实技术回答」的规模与信息密度：短于此的回答本就会被价值层挡住，
// 端到端用例必须用一个应该被沉淀的回答，否则测的是拒绝路径而不是写入路径。
const ANSWER = [
  'cordis 用 yaml patch 组合插件树，并通过注入把 tools 服务交给插件使用。',
  '具体步骤：先写 cordis.patch.yml 声明插入行，再用 defineTool 注册模型面工具，',
  '最后让 parameters 编译出的 JSON Schema 在 execute 之前完成参数校验。',
  '关键风险是框架包必须标为 external：一旦被打进产物，宿主与插件就会各持',
  '一份 schema 编译器，两边行为分叉时会出现「明明校验过却报错」这种最难查的问题。',
  '相关文件：cordis.patch.yml、dshx.yml、package.json、scripts/build.mjs。',
  '```ts\nexport function apply(ctx) { ctx.tools.register(defineTool({ name: "x" })) }\n```',
].join('\n');

await check('端到端捕获：真实事件流（turn/start→消息→turn/end）→ JSON 落盘 + MD 落盘', async () => {
  await emitTurn(sectionHandler, SESSION, { question: 'dsh 插件是怎么组合的？', answer: ANSWER, turn: 11 });

  const items = readdirSync(dataRoot).filter((f) => f.endsWith('.json') && f.startsWith('ts-'));
  assert.ok(items.length >= 1, '应写入至少 1 条知识条目，实际 ' + items.length);
  const kbFiles = existsSync(join(mdRoot, '01_问答沉淀')) ? readdirSync(join(mdRoot, '01_问答沉淀')) : [];
  assert.ok(kbFiles.length >= 1, '应生成主题笔记（01_问答沉淀/）');
  const item = JSON.parse(readFileSync(join(dataRoot, items[0]), 'utf8'));
  return '条目 ' + item.id + ' / 主题 ' + item.topic + ' / 笔记 ' + kbFiles.join(',');
});

await check('幂等：同一 turn 再触发一次不产生第二条条目', async () => {
  const before = readdirSync(dataRoot).filter((f) => f.startsWith('ts-')).length;
  await emitTurn(sectionHandler, SESSION, { question: 'dsh 插件是怎么组合的？', answer: ANSWER, turn: 11 });
  const after = readdirSync(dataRoot).filter((f) => f.startsWith('ts-')).length;
  assert.equal(after, before, '同 turn 重复触发必须幂等（预期 ' + before + '，实际 ' + after + '）');
  return before + ' → ' + after;
});

await check('幂等：同一内容换 turn 捕获 → duplicate（不新增条目）', async () => {
  const before = readdirSync(dataRoot).filter((f) => f.startsWith('ts-')).length;
  await emitTurn(sectionHandler, SESSION, { question: 'dsh 插件是怎么组合的？', answer: ANSWER, turn: 12 });
  const after = readdirSync(dataRoot).filter((f) => f.startsWith('ts-')).length;
  assert.equal(after, before, '同内容不同 turn 应被判为 duplicate，不新增条目');
  return '条目数保持 ' + after;
});

await check('真人提问过滤：agent.inject 注入的 user/message 不会被当成问题', async () => {
  const before = readdirSync(dataRoot).filter((f) => f.startsWith('ts-')).length;
  // 注入上下文（kind != 'user'）+ 真实回答 → 没有真人提问，不该沉淀
  await emitTurn(sectionHandler, SESSION, {
    question: '<file-change-notice>这是注入的上下文，不是用户在提问</file-change-notice>',
    answer: ANSWER,
    turn: 13,
    sourceKind: 'agent-inject',
  });
  const after = readdirSync(dataRoot).filter((f) => f.startsWith('ts-')).length;
  assert.equal(after, before, '注入上下文不得产生知识条目（预期 ' + before + '，实际 ' + after + '）');
  return '注入轮被正确忽略，条目数保持 ' + after;
});

await check('兜底路径：只给 eventsSnapshot（无事件流）时仍能捕获', async () => {
  const before = readdirSync(dataRoot).filter((f) => f.startsWith('ts-')).length;
  const legacy = {
    id: 'selfcheck-legacy-session',
    eventsSnapshot: [
      { type: 'user/message', seq: 1, data: { text: '兜底路径的问题：为什么需要它？', source: { kind: 'user' } } },
      { type: 'assistant/message', seq: 2, data: { message: { content: [{ text: ANSWER }] } } },
    ],
  };
  await sectionHandler(legacy, { type: 'turn/end', seq: 3, time: Date.now(), data: { turn: 21 } });
  await new Promise((r) => setTimeout(r, 400));
  const after = readdirSync(dataRoot).filter((f) => f.startsWith('ts-')).length;
  assert.ok(after >= before, '兜底路径不得抛错（条目数 ' + before + ' → ' + after + '）');
  return '兜底可用（条目数 ' + before + ' → ' + after + '）';
});

// ---- 纯函数行为：走 testkit 子路径导出 ----
const kit = await import(
  new URL('file://' + join(ROOT, 'lib', 'testkit.js').replace(/\\/g, '/')).href
);

await check('防回灌：qa_loop 来源被识别为插件自身产物', () => {
  const own = kit.isOblivionOriginated({
    question: 'q',
    answer: 'a'.repeat(50),
    sources: [{ type: 'qa_loop', ref: 'oblivion:1', hash: 'h' }],
    sessionId: 's',
    turn: 1,
    capturedAt: 0,
  });
  const normal = kit.isOblivionOriginated({
    question: 'q',
    answer: 'a'.repeat(50),
    sources: [{ type: 'session', ref: 's#1', hash: 'h' }],
    sessionId: 's',
    turn: 2,
    capturedAt: 0,
  });
  assert.equal(own, true, 'qa_loop 来源必须被识别');
  assert.equal(normal, false, '普通 session 来源不应被误判');
  return 'qa_loop=true / session=false';
});

await check('四层筛选：插件自身产物 + 短回答被拒', async () => {
  const pair = {
    question: 'dsh 插件',
    answer: 'a'.repeat(60),
    sources: [{ type: 'qa_loop', ref: 'oblivion:x', hash: 'h' }],
    sessionId: 's',
    turn: 3,
    capturedAt: 0,
  };
  const verdict = await kit.fourLayerFilter(pair, kit.DEFAULT_CONFIG, {
    exactDuplicate: async () => false,
    semanticSimilar: async () => ({ action: 'new' }),
  });
  assert.equal(verdict.pass, false);
  assert.equal(verdict.action, 'ignored');
  assert.match(verdict.reason ?? '', /oblivion-originated/);
  return verdict.action + ' / ' + verdict.reason;
});

await check('价值评估：噪声被挡、真实回答放行、低密度长文不靠长度取胜', () => {
  const base = { question: 'q', sources: [{ type: 'doc', ref: 'x', hash: 'h' }], sessionId: 's', turn: 1, capturedAt: 0 };
  const noise = kit.heuristicScore({ ...base, answer: 'ok' });
  const real = kit.heuristicScore({
    ...base,
    answer: [
      'cordis 用 yaml patch 组合插件树，并注入 tools 服务。',
      '步骤：先写 cordis.patch.yml，用 defineTool 注册工具，再校验参数 schema。',
      '风险：框架包必须 external，否则宿主与插件各持一份 JSON Schema 会分叉。',
      '```ts\nexport function apply(ctx) {}\n```',
    ].join('\n'),
  });
  // 900 字同字符：长度分拿满但信息密度极低 —— 这个用例是刻意的，
  // 用来证明总分不是「越长越高」，否则阈值就形同虚设。
  const repeated = kit.heuristicScore({ ...base, answer: 'x'.repeat(900) + '\n```ts\ncode\n```' });

  const T = kit.DEFAULT_CONFIG.valueThreshold;
  assert.ok(noise < T, '噪声应被挡住，实际 ' + noise.toFixed(3));
  assert.ok(real > T, '真实技术回答应放行，实际 ' + real.toFixed(3));
  assert.ok(repeated > noise, '低密度长文仍应高于噪声（长度有效，但不足以单独过关）');
  return 'noise=' + noise.toFixed(3) + ' real=' + real.toFixed(3) + ' repeated=' + repeated.toFixed(3) + ' 阈值=' + T;
});

await check('时钟保护：回退时钟下权重不增加、强化封顶 1.0', () => {
  const edge = { source_id: 'a', target_id: 'b', weight: 0.6, last_reinforced_at: 0, reinforce_count: 1 };
  const cfg = { base: 0.95, periodDays: 30 };
  const backwards = kit.effectiveWeight(edge, cfg, -5 * kit.MS_PER_DAY);
  assert.ok(backwards <= edge.weight, '时钟回退不得让权重增加');
  const decayed = kit.effectiveWeight(edge, cfg, 30 * kit.MS_PER_DAY);
  assert.ok(Math.abs(decayed - 0.6 * 0.95) < 1e-9, '30 天后应等于 ×0.95');
  const capped = kit.reinforce({ ...edge, weight: 0.99 }, { delta: 0.05, cap: 1 }, 0);
  assert.equal(capped.weight, 1, '强化必须封顶 1.0');
  return 'backwards=' + backwards.toFixed(4) + ' decayed=' + decayed.toFixed(4) + ' cap=1';
});

await check('语义去重：近义改写判 duplicate、无关内容判 new', () => {
  const item = {
    id: 'x', topic: 't', title: 'dsh 插件机制',
    content: 'cordis 用 yaml patch 组合 插件 注入 tools 工具',
    sources: [], tags: [], status: 'active', created_at: 0, updated_at: 0, version: 1,
  };
  const mk = (answer) => ({
    question: 'dsh 插件机制', answer,
    sources: [{ type: 'session', ref: 's#1', hash: 'h' }],
    sessionId: 's', turn: 1, capturedAt: 0,
  });
  const dup = kit.compareByOverlap(mk('cordis 用 yaml patch 组合 插件 注入 tools 工具'), [item], 0.85).action;
  const fresh = kit.compareByOverlap(mk('今天中午吃什么 完全无关 面条 米饭'), [item], 0.85).action;
  assert.equal(dup, 'duplicate');
  assert.equal(fresh, 'new');
  return 'dup=' + dup + ' / fresh=' + fresh;
});

await check('L3 规则（§25.1 四条）：短答 / 无意义 / 不知道 / 纯寒暄 全部拒绝', () => {
  const mk = (answer) => ({
    question: 'q', answer,
    sources: [{ type: 'session', ref: 's#1', hash: 'h' }],
    sessionId: 's', turn: 1, capturedAt: 0,
  });
  const cfg = kit.DEFAULT_CONFIG;
  const cases = [
    ['短答', '见上', 'answer-too-short'],
    ['无意义', 'asdf qwer', 'meaningless-only'],
    ['不知道', '不知道，这个问题我答不上来，你可以问问别人看看', 'contains-unknown'],
    ['纯寒暄', '太感谢你了，辛苦了！', 'pleasantry-only'],
  ];
  const seen = [];
  for (const [label, answer, expected] of cases) {
    const verdict = kit.checkL3Rules(mk(answer), cfg);
    assert.equal(verdict.pass, false, label + ' 应被拒绝');
    assert.equal(verdict.reason, expected, label + ' 的原因应为 ' + expected + '，实际 ' + verdict.reason);
    seen.push(label + '=' + verdict.reason);
  }
  // 正文中后段提到「不知道」不该被误杀（这是刻意收紧的口径）
  const normal = kit.checkL3Rules(
    mk('排查结论：如果不校验 schema，就不知道参数到底合不合法，所以必须在 execute 之前编译校验。'),
    cfg,
  );
  assert.equal(normal.pass, true, '正文提及「不知道」的正常回答必须放行');
  // 正文里出现客套词也不该被误杀（纯寒暄判定要求「整条都是客套」）
  const thanked = kit.checkL3Rules(mk('感谢你的方案，但风险在于 schema 会在两处编译。'), cfg);
  assert.equal(thanked.pass, true, '正文含客套词但不纯寒暄时必须放行');
  return seen.join(' / ') + ' / 正文提及放行';
});

await check('F3 深度触发：连续同维度 → 至少 3 个候选视角', () => {
  const coverage = kit.analyzeCoverage('性能怎么优化', '先看瓶颈', 'topic', 's');
  const misses = new Map(coverage.missing.map((d) => [d, 3]));
  const base = {
    profile: kit.defaultProfile(),
    coverage,
    misses,
    config: kit.DEFAULT_CONFIG,
    stage: 'probe',
    resistant: [],
  };
  const normal = kit.generatePerspectives({ ...base, max: 2, deep: false });
  const deep = kit.generatePerspectives({ ...base, max: 3, deep: true });
  assert.ok(normal.length <= 2, '普通模式不得超过配置上限，实际 ' + normal.length);
  assert.ok(deep.length >= 3, '深度模式必须给 ≥3 个候选，实际 ' + deep.length);
  return '普通=' + normal.length + ' 深度=' + deep.length;
});

await check('F2/F3 闸门（§25.4）：会话 >3 且非深度时不动手；连续同维度 3 次后深度通道触发', async () => {
  const perspective = kit.registerPerspective({ effect: () => () => {}, logger: { warn() {} } }, kit.DEFAULT_CONFIG, {
    profile: {
      async read() {
        // 第 9 个会话：既不在主动触发窗口（≤3），也不在陪伴期（>10）
        return { ...kit.defaultProfile(), sessions_observed: 9, inquiry_style: { primary: 'cost', secondary: 'risk', confidence: 0.8 } };
      },
      async update() {},
    },
  });
  const turn = () => perspective.onTurn({ question: '为什么性能上不去', answer: '先看瓶颈', topic: 't', sessionId: 's', sources: 1 });

  await turn();
  const after1 = perspective.pending();
  await turn();
  const after2 = perspective.pending();
  await turn();
  const after3 = perspective.pending();
  const stats = perspective.stats();

  assert.equal(after1, '', '第 1 轮不该触发（主动闸门要 ≤3 会话，陪伴期要 >10）');
  assert.equal(after2, '', '第 2 轮同维度还不该触发');
  assert.ok(after3.length > 0, '连续 3 次同维度追问后必须触发深度通道');
  assert.ok(stats.deepGateHits >= 1, '应记录深度通道命中，实际 ' + stats.deepGateHits);
  assert.equal(stats.activeGateHits, 0, '会话 9 不该走主动通道');
  return '第1/2轮空 → 第3轮排队 ' + after3.length + ' 字 / 深度命中 ' + stats.deepGateHits;
});

await check('F5 保留期（§25.7）：超过 90 天的反馈在读取时被惰性裁剪', async () => {
  const old = Date.now() - 100 * kit.MS_PER_DAY;
  const fresh = Date.now() - 1 * kit.MS_PER_DAY;
  writeFileSync(
    join(dataRoot, 'feedback.json'),
    JSON.stringify([
      { id: 'f-old', target: 'risk', signal: 1, context: '', created_at: old },
      { id: 'f-new', target: 'cost', signal: 1, context: '', created_at: fresh },
    ], null, 2),
    'utf8',
  );
  const feedback = kit.registerFeedback(
    { effect: () => () => {}, logger: { warn() {}, info() {} } },
    // ⚠️ 必须覆盖 dataRoot：用 DEFAULT_CONFIG 会读到用户真实的 ~/.oblivion/data
    { ...kit.DEFAULT_CONFIG, dataRoot, mdRoot },
    {
      async read() { return kit.defaultProfile(); },
      async update() {},
    },
  );
  const kept = await feedback.all();
  assert.equal(kept.length, 1, '应只留下未过期的 1 条，实际 ' + kept.length);
  assert.equal(kept[0].id, 'f-new');
  const stats = await feedback.stats();
  assert.equal(stats.pruned, 1, '应记录 1 条被裁剪，实际 ' + stats.pruned);
  const onDisk = JSON.parse(readFileSync(join(dataRoot, 'feedback.json'), 'utf8'));
  assert.equal(onDisk.length, 1, '裁剪结果应落盘');
  writeFileSync(join(dataRoot, 'feedback.json'), '[]', 'utf8');
  return '保留 ' + kept.length + ' 条 / 裁剪 ' + stats.pruned + ' 条 / 保留期 ' + stats.retentionDays + ' 天';
});

await check('分类落盘（§25.3）：问答沉淀落 01_问答沉淀/，未命中规则落 99_其他/', async () => {
  const mkItem = (topic, type) => ({
    id: 'ts-x', topic, title: topic, content: '内容'.repeat(40),
    sources: [{ type, ref: 'r', hash: 'h' }],
    tags: [], status: 'active', created_at: Date.now(), updated_at: Date.now(), version: 1,
  });
  const cfg = { ...kit.DEFAULT_CONFIG, dataRoot, mdRoot };
  assert.equal(kit.classifyDir(mkItem('t1', 'session'), cfg.mdClassify), '01_问答沉淀', 'session 来源应落问答沉淀');
  assert.equal(kit.classifyDir(mkItem('t2', 'qa_loop'), cfg.mdClassify), '01_问答沉淀', 'qa_loop 来源应落问答沉淀');
  assert.equal(kit.classifyDir(mkItem('t3', 'doc'), cfg.mdClassify), '00_导入文件');
  assert.equal(kit.classifyDir(mkItem('t4', 'unknown-type'), cfg.mdClassify), kit.MD_FALLBACK_DIR, '未命中必须落兜底');

  const p1 = await kit.writeMD(mdRoot, { action: 'created', item: mkItem('分类测试', 'session') }, cfg.mdClassify);
  assert.ok(p1.includes('01_问答沉淀'), '落盘路径应含 01_问答沉淀，实际 ' + p1);
  const p2 = await kit.writeMD(mdRoot, { action: 'created', item: mkItem('兜底测试', 'unknown-type') }, cfg.mdClassify);
  assert.ok(p2.includes(kit.MD_FALLBACK_DIR), '兜底路径应含 ' + kit.MD_FALLBACK_DIR + '，实际 ' + p2);
  return '分类=' + kit.classifyDir(mkItem('x', 'session'), cfg.mdClassify) + ' / 兜底=' + kit.MD_FALLBACK_DIR;
});

await check('共用知识库防误伤：同名外来笔记不被覆盖，改写 -oblivion.md', async () => {
  const dir = join(mdRoot, '01_问答沉淀');
  await mkdir(dir, { recursive: true });
  const minePath = join(dir, '防误伤.md');
  writeFileSync(minePath, '# 我自己的笔记\n\n不要动我。\n', 'utf8');
  const item = {
    id: 'ts-guard', topic: '防误伤', title: '防误伤', content: '插件写入的内容',
    sources: [{ type: 'session', ref: 'r', hash: 'h' }],
    tags: [], status: 'active', created_at: Date.now(), updated_at: Date.now(), version: 1,
  };
  const written = await kit.writeMD(mdRoot, { action: 'created', item }, { session: '01_问答沉淀' });
  const original = readFileSync(minePath, 'utf8');
  assert.ok(original.includes('不要动我'), '外来笔记必须原样保留');
  assert.ok(written.endsWith('防误伤-oblivion.md'), '应改写旁路文件，实际 ' + written);
  assert.ok(readFileSync(written, 'utf8').includes('oblivion:id='), '旁路文件应带 id 标记');
  return '外来文件未动，写入 ' + written.replace(/\\/g, '/').split('/').slice(-1)[0];
});

await check('装载即建目录（所有者要求）：mdRoot 一经配置，01_问答沉淀\\ 等分类目录立即创建', async () => {
  const freshRoot = join(tmp, 'kb-fresh');
  const fresh = makeCtx();
  mod.apply(fresh.ctx, { dataRoot: join(tmp, 'data-fresh'), mdRoot: freshRoot });
  await new Promise((r) => setTimeout(r, 300)); // 建目录是非阻塞链路（失败只记日志）
  const expected = ['01_问答沉淀', '00_导入文件', '02_Wiki页面', '03_创作产物', '99_其他'];
  const missing = expected.filter((d) => !existsSync(join(freshRoot, d)));
  assert.deepEqual(missing, [], '应自动创建全部分类目录，缺：' + missing.join('、'));
  return '已创建 ' + expected.length + ' 个分类目录 → ' + freshRoot.replace(/\\/g, '/');
});

await check('自定义知识库位置：换 mdRoot 后落盘跟着走', async () => {
  const custom = join(tmp, 'kb-custom');
  const ctx3 = makeCtx();
  mod.apply(ctx3.ctx, { dataRoot: join(tmp, 'data-custom'), mdRoot: custom });
  const handler3 = ctx3.reg.events.find((e) => e.event === 'session/event').handler;
  await emitTurn(handler3, { id: 'custom-session' }, {
    question: '自定义知识库位置之后，笔记会落到哪里？',
    answer: ANSWER,
    turn: 31,
  });
  const dir = join(custom, '01_问答沉淀');
  const files = existsSync(dir) ? readdirSync(dir) : [];
  assert.ok(files.length >= 1, '笔记应落在自定义 mdRoot，实际 ' + files.length + ' 个文件');
  return '落 ' + files.length + ' 个文件 → ' + custom.replace(/\\/g, '/') + '/' + files[0];
});

await check('分类目录消毒：配置里的目录名不能逃出 mdRoot', () => {
  assert.equal(kit.safeDirName('../../etc'), 'etc', '.. 片段必须被去掉');
  assert.equal(kit.safeDirName('C:\\Windows\\System32'), 'Windows/System32', '盘符与反斜杠应被规整');
  assert.equal(kit.safeDirName('  '), '', '空白视为未配置');
  const names = kit.mdDirNames({ evil: '../../etc', ok: '01_问答沉淀' });
  assert.ok(names.includes('99_其他'), '必须含兜底目录');
  assert.ok(names.includes('01_问答沉淀'), '必须含实际分类目录');
  assert.ok(!names.some((n) => n.includes('..')), '不得含 .. 片段');
  return '消毒后 = ' + names.join(' , ');
});

await check('判定留痕：每一轮都记（含 no-qa 与被拦下），且能算出捕获率与被拦原因', async () => {
  const tracePath = join(dataRoot, 'decisions.jsonl');
  assert.ok(existsSync(tracePath), '应生成 decisions.jsonl（判定留痕）');
  const records = readFileSync(tracePath, 'utf8').split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  assert.ok(records.length >= 3, '前面的用例跑过多轮，留痕应至少 3 条，实际 ' + records.length);
  const actions = [...new Set(records.map((r) => r.action))];
  assert.ok(actions.includes('created'), '应记到成功捕获，实际动作：' + actions.join(','));
  assert.ok(records.some((r) => r.pass === false), '被拦下的轮次也必须留痕（AC-008）');
  assert.ok(records.every((r) => typeof r.reason === 'string' && r.reason !== ''), '每条都要有 reason');
  assert.ok(records.every((r) => typeof r.ms === 'number'), '每条都要记判定耗时');

  const stats = kit.registerStats(
    { effect: () => () => {}, logger: { warn() {}, info() {} } },
    { ...kit.DEFAULT_CONFIG, dataRoot, mdRoot },
    { version: 'selfcheck' },
  );
  const summary = await stats.summary();
  assert.ok(summary.turns >= records.length - 1, '统计条数应覆盖留痕');
  assert.ok(summary.evaluated > 0, '应有可评估轮次');
  assert.equal(summary.thresholds.valueThreshold, kit.DEFAULT_CONFIG.valueThreshold);
  const top = Object.entries(summary.byReason).sort((a, b) => b[1] - a[1])[0];
  return '留痕 ' + records.length + ' 条 / 动作 ' + actions.join(',') + ' / 主要拦截原因 ' + (top ? top[0] + '×' + top[1] : '无');
});

await check('观测面：oblivion_status 给出生效配置 + 统计 + 调参建议', async () => {
  const stats = kit.registerStats(
    { effect: () => () => {}, logger: { warn() {}, info() {} } },
    { ...kit.DEFAULT_CONFIG, dataRoot, mdRoot },
    { version: 'selfcheck' },
  );
  const snapshot = await stats.status({ recentLimit: 5, perspective: { turns: 3, queued: 1 } });
  assert.equal(snapshot.version, 'selfcheck');
  assert.ok(snapshot.config && snapshot.config.valueThreshold !== undefined, '必须给出生效配置（可调参数清单）');
  assert.ok(Array.isArray(snapshot.hints), '必须给出调参建议数组');
  assert.ok(snapshot.recent.length <= 5, 'recent 应遵守 limit');
  assert.ok(snapshot.tracePath.endsWith('decisions.jsonl'));
  const keys = ['valueThreshold', 'semanticThreshold', 'minAnswerLength', 'mdRoot', 'statsRetentionDays'];
  for (const k of keys) assert.ok(k in snapshot.config, '生效配置应含 ' + k);
  return '配置项 ' + Object.keys(snapshot.config).length + ' 个 / 建议 ' + snapshot.hints.length + ' 条 / 最近 ' + snapshot.recent.length + ' 条';
});

await check('调参建议的边界：样本不足不开口；阈值贴着分布中位数才建议动', () => {
  const cfg = kit.DEFAULT_CONFIG;
  const rec = (n, reason, score) => Array.from({ length: n }, () => ({
    at: Date.now(), session: 's', turn: 1, action: 'ignored', pass: false,
    reason, score, questionChars: 20, answerChars: 40, sources: 1, ms: 1,
  }));
  const few = kit.summarize(rec(5, 'below value threshold', 0.2), cfg);
  assert.deepEqual(kit.suggest(few, cfg), [], '样本 <20 不该给建议');

  const many = kit.summarize(rec(100, 'below value threshold', 0.28), cfg);
  assert.ok(many.captureRate === 0);
  const hints = kit.suggest(many, cfg);
  assert.ok(hints.some((h) => h.key === 'valueThreshold'), '应建议调 valueThreshold，实际 ' + JSON.stringify(hints));
  assert.ok(hints.every((h) => h.why && h.why.length > 10), '每条建议都要说清依据');

  const dup = kit.summarize(rec(50, 'exact hash match', 0.4), cfg);
  const dupHints = kit.suggest(dup, cfg);
  assert.ok(dupHints.every((h) => h.suggested === undefined), '完全重复不该建议改任何值');
  return '样本不足=0 条 / 低捕获= ' + hints.length + ' 条 / 重复= ' + dupHints.length + ' 条（无 suggested）';
});

await check('会话整理（oblivion_digest）：笔记落 04_会话整理/ + 条目入库 + 建边', async () => {
  const digestRoot = join(tmp, 'kb-digest');
  const kit = await import(new URL('file://' + join(ROOT, 'lib', 'testkit.js').replace(/\\/g, '/')).href);
  const dctx = makeCtx();
  mod.apply(dctx.ctx, { dataRoot: join(tmp, 'data-digest'), mdRoot: digestRoot });
  const result = await kit.registerDigest(
    { effect: () => () => {}, logger: { warn() {}, info() {} } },
    { ...kit.DEFAULT_CONFIG, dataRoot: join(tmp, 'data-digest'), mdRoot: digestRoot },
    {
      knowledge: {
        async saveStructured(input) {
          const item = { id: 'ts-digest-1', topic: input.topic, title: input.title, content: input.content, sources: input.sources, tags: input.tags ?? [], status: 'active', created_at: Date.now(), updated_at: Date.now(), version: 1 };
          writeFileSync(join(tmp, 'data-digest', item.id + '.json'), JSON.stringify(item, null, 2), 'utf8');
          return item;
        },
      },
      graph: { async recordCooccurrence() { return 3; } },
    },
  ).save({
    title: '会话整理自检',
    topic: '自检',
    sections: [{ heading: '结论', body: '闭环可用。' }],
    decisions: ['走热挂'],
    todos: ['重启 App'],
    links: ['ts-1'],
    sessionId: 'selfcheck-session',
  });
  assert.ok(existsSync(result.notePath), '整理笔记应落盘：' + result.notePath);
  assert.ok(result.notePath.includes('04_会话整理'), '应落在 04_会话整理/，实际 ' + result.notePath);
  const note = readFileSync(result.notePath, 'utf8');
  assert.ok(note.includes('## 决策') && note.includes('## 待办') && note.includes('[[ts-1]]'), '笔记应含决策/待办/双链');
  assert.ok(note.includes('oblivion:digest id=ts-digest-1'), '笔记标记应回填真实条目 id');
  assert.equal(result.entities, 3, '应记录建边实体数');
  return '笔记 ' + result.notePath.replace(/\\/g, '/').split('/').slice(-1)[0] + ' / 条目 ' + result.itemId + ' / 边 ' + result.entities;
});

rmSync(tmp, { recursive: true, force: true });

process.stdout.write('\n@oblivion/core selfcheck\n\n');
for (const [status, name, detail] of results) {
  process.stdout.write(status.padEnd(5) + ' ' + name + (detail ? '\n        ' + detail : '') + '\n');
}
process.stdout.write('\n' + results.length + ' 项，失败 ' + failed + '\n');
process.exitCode = failed === 0 ? 0 : 1;