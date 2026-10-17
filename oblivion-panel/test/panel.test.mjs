/**
 * @oblivion/panel 单元测试（测 lib/ 产物，与其它两个插件同一策略）。
 *
 * 运行：node --test（package.json 的 test 脚本）
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LIB = join(ROOT, 'lib', 'index.js');

let mod;
let kit;
let tmp;

before(async () => {
  mod = await import(pathToFileURL(LIB).href);
  kit = await import(pathToFileURL(join(ROOT, 'lib', 'testkit.js')).href);
});

after(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

/** 造一份「core 跑过一轮」的磁盘现场。 */
function seed() {
  tmp = mkdtempSync(join(tmpdir(), 'oblivion-panel-'));
  const dataRoot = join(tmp, 'data');
  const mdRoot = join(tmp, 'kb');
  mkdirSync(dataRoot, { recursive: true });
  mkdirSync(join(mdRoot, '01_问答沉淀'), { recursive: true });
  mkdirSync(join(mdRoot, '04_会话整理'), { recursive: true });
  // 0.0.14 起还读主题页目录（只当「标题 → 路径」的字典用）
  mkdirSync(join(mdRoot, '02_Wiki页面'), { recursive: true });

  const now = Date.now();
  writeFileSync(
    join(dataRoot, 'status.json'),
    JSON.stringify({
      version: '0.1.5',
      mdRoot,
      config: { statsRetentionDays: 90, statsMaxEntries: 5000 },
      stats: { turns: 3, evaluated: 2, noQa: 1, captured: 1, rejected: 1, captureRate: 0.5, byReason: { captured: 1, 'below value threshold': 1 } },
      hints: [{ key: 'valueThreshold', current: 0.3, suggested: 0.25, why: '捕获率低' }],
    }),
    'utf8',
  );
  writeFileSync(
    join(dataRoot, 'decisions.jsonl'),
    [
      // 时间戳必须落在保留期（core 默认 90 天）内：面板做与 core `trace.read()` 同样的裁剪，
      // 远古时间戳（这里曾写 `at: 1`）会被当成过期留痕丢掉。
      JSON.stringify({ at: now - 3000, action: 'created', pass: true, reason: 'captured', score: 0.8, ms: 3 }),
      JSON.stringify({ at: now - 2000, action: 'ignored', pass: false, reason: 'below value threshold', score: 0.21, ms: 2 }),
      'not-json',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(dataRoot, 'ts-1.json'),
    JSON.stringify({
      id: 'ts-1',
      topic: '测试主题',
      title: '一条知识',
      created_at: 10,
      updated_at: 20,
      status: 'active',
      version: 1,
      tags: ['dsh', 'mcp'],
      sources: [{ type: 'session', ref: 's#1', hash: 'h' }],
    }),
    'utf8',
  );
  // 真笔记的样子：frontmatter（关键词/日期）+ 元信息行（关键词 + 主题页回链）。
  // 回链刻意写两条（第一条两个标题、第二条与第一条重复），用来断言「按序去重」。
  writeFileSync(
    join(mdRoot, '01_问答沉淀', '测试主题.md'),
    [
      '---',
      'title: "一条知识"',
      'topic: "测试主题"',
      'created_at: "2026-10-05"',
      'updated_at: "2026-10-06"',
      'tags: ["dsh", "panel"]',
      'related_wiki: []',
      '---',
      '',
      '# 一条知识',
      '',
      '>Date :  2026-10-05',
      '>Tags： #dsh #panel',
      '> Wiki： [[主题页甲]] · [[主题页乙]]',
      '> Wiki： [[主题页甲]]',
      '',
      '## 内容',
      '',
    ].join('\n'),
    'utf8',
  );
  writeFileSync(join(mdRoot, '02_Wiki页面', '主题页甲.md'), '# 主题页甲\n', 'utf8');
  // 整理件**没有 frontmatter**，日期只能从 `>Date :` 行取。
  writeFileSync(
    join(mdRoot, '04_会话整理', '2026-10-06-整理.md'),
    ['# 整理件', '', '>Date :  2026-10-04', '>Topic： 整理主题', ''].join('\n'),
    'utf8',
  );
  return { dataRoot, mdRoot };
}

describe('产物形状', () => {
  it('lib/index.js 导出 object 插件约定面（且**不**做 default export）', () => {
    assert.equal(mod.name, '@oblivion/panel');
    assert.deepEqual(mod.inject, []);
    assert.equal(typeof mod.apply, 'function');
    // dshx check 的硬校验：function plugin 不允许 default export
    // （"Loader smoke stays green if default replaces named exports"）。
    assert.equal(mod.default, undefined, '不得 default export');
  });

  it('lib/client.js 是 DSH 客户端模块格式（__ModuleLoader__.load + 工厂）', async () => {
    const { readFileSync } = await import('node:fs');
    const code = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8');
    assert.ok(code.includes('window.__ModuleLoader__.load'), '必须走 __ModuleLoader__');
    assert.ok(code.includes('"@oblivion/panel"'), '模块 id 必须是包名');
    assert.ok(code.includes('factory: (require)'), '必须有 require 工厂');
    assert.ok(!/\bimport\s/.test(code.split('\n').slice(0, 3).join('\n')), '客户端产物不该是 ESM');
  });
});

describe('观测快照（Node 半边数据面）', () => {
  it('把 status.json / decisions.jsonl / 条目 / 笔记装配成一个 JSON', async () => {
    const { dataRoot, mdRoot } = seed();
    const snapshot = await kit.buildSnapshot({ dataRoot, recentLimit: 10, fallbackMdRoot: 'X:/nope' });
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.core.version, '0.1.5');
    assert.equal(snapshot.mdRoot, mdRoot, 'mdRoot 应取自 core 的 status.json');
    assert.equal(snapshot.trace.recent.length, 2, '坏行应被跳过');
    assert.equal(snapshot.trace.series.length, 2, '曲线序列与列表同源（0.0.10 起：窗口更宽，见 trace.series）');

    // 顶部统计是**现算**的（live），不再用 core 装载时的 status.json（那份 stats 写的是 3 轮）
    assert.equal(snapshot.live.turns, 2, 'live 统计应来自 decisions.jsonl');
    assert.equal(snapshot.live.evaluated, 2);
    assert.equal(snapshot.live.captured, 1);
    assert.equal(snapshot.live.rejected, 1);
    assert.equal(snapshot.live.captureRate, 0.5);
    assert.equal(snapshot.live.byReason['below value threshold'], 1);
    assert.equal(snapshot.live.score.belowThreshold, 1);
    assert.equal(snapshot.live.dropped, 0, '保留期内的留痕不该被丢');
    assert.equal(snapshot.live.windowDays, 90, '保留期取自 status.json 带回的 config');

    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.items[0].title, '一条知识');
    assert.equal(snapshot.items[0].sourceTypes[0], 'session', '条目要带上来源类型（用来标「会话整理」）');
    assert.deepEqual(snapshot.items[0].tags, ['dsh', 'mcp'], '条目关键词取自 JSON 的 tags');
    assert.equal(snapshot.items[0].updated_at, 20);
    assert.equal(snapshot.notes.length, 1);
    // 0.0.14：每个文档下方要显示「相关主题 / 关键词 / 日期」，三样都从笔记头部解析
    const note = snapshot.notes[0];
    assert.deepEqual(note.tags, ['dsh', 'panel'], '关键词取自 frontmatter 的 tags');
    assert.equal(note.createdAt, '2026-10-05');
    assert.equal(note.updatedAt, '2026-10-06');
    assert.deepEqual(note.wiki, ['主题页甲', '主题页乙'], '`> Wiki：` 回链要按序去重');
    assert.equal(snapshot.wikis.length, 1, '主题页目录要读出来当字典（标题 → 路径）');
    assert.equal(snapshot.wikis[0].path, join(mdRoot, '02_Wiki页面', '主题页甲.md'));
    assert.equal(snapshot.digests.length, 1, '04_会话整理 的整理件也要读出来（合栏后能点开）');
    assert.equal(snapshot.digests[0].createdAt, '2026-10-04', '整理件没有 frontmatter：日期取 `>Date :` 行');
    assert.deepEqual(snapshot.digests[0].tags, [], '整理件没有关键词就不编造');
    assert.ok(snapshot.problems.some((p) => p.includes('不是合法 JSON')), '坏行应进 problems');
  });

  it('core 没跑过时：不抛错，返回空快照 + 回退知识库位置', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'oblivion-panel-empty-'));
    const snapshot = await kit.buildSnapshot({ dataRoot: empty, recentLimit: 5, fallbackMdRoot: 'Y:/kb' });
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.core, null);
    assert.equal(snapshot.mdRoot, 'Y:/kb');
    assert.deepEqual(snapshot.items, []);
    assert.deepEqual(snapshot.notes, []);
    rmSync(empty, { recursive: true, force: true });
  });
});

describe('面板注册与降级', () => {
  it('betterSidebar 就位 → 注册一次，descriptor 形状正确', () => {
    const registered = [];
    const effects = [];
    const result = kit.registerPanelTab(
      {
        inject: (_deps, callback) => callback({ betterSidebar: { registerTab: (d) => { registered.push(d); return () => undefined; } } }),
        effect: (fn, label) => { effects.push(label); fn(); },
      },
      (() => null),
      () => undefined,
    );
    assert.equal(result.status, 'registered');
    assert.equal(registered.length, 1);
    assert.equal(registered[0].id, kit.PANEL_TAB_ID);
    assert.equal(registered[0].single, true);
    assert.equal(typeof registered[0].component, 'function');
    assert.deepEqual(effects, ['oblivion-panel: better-sidebar tab']);
  });

  it('betterSidebar 缺席 → 不注册、不抛错（只记日志）', () => {
    const warnings = [];
    const result = kit.registerPanelTab(
      { inject: (_deps, callback) => callback({}) },
      (() => null),
      (message) => warnings.push(message),
    );
    assert.equal(result.status, 'no-service');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /betterSidebar/);
  });

  it('registerTab 抛错 → 记为 failed，不冒泡', () => {
    const result = kit.registerPanelTab(
      { inject: (_deps, callback) => callback({ betterSidebar: { registerTab: () => { throw new Error('boom'); } } }) },
      (() => null),
      () => undefined,
    );
    assert.equal(result.status, 'failed');
    assert.match(String(result.detail), /boom/);
  });

  it('没有 inject 时退化为直接取服务', () => {
    const result = kit.registerPanelTab(
      { get: () => ({ registerTab: () => () => undefined }) },
      (() => null),
      () => undefined,
    );
    assert.equal(result.status, 'registered');
  });
});

describe('展示层纯函数', () => {
  it('percent：没有分母时是「—」而不是 0%', () => {
    assert.equal(kit.percent(0.0312), '3.1%');
    assert.equal(kit.percent(0), '0.0%');
    assert.equal(kit.percent(undefined), '—');
  });

  it('relativeTime：刚刚 / 分钟 / 小时 / 天', () => {
    const now = 1_000_000_000;
    assert.equal(kit.relativeTime(now - 5_000, now), '刚刚');
    assert.equal(kit.relativeTime(now - 5 * 60_000, now), '5 分钟前');
    assert.equal(kit.relativeTime(now - 5 * 3_600_000, now), '5 小时前');
    assert.equal(kit.relativeTime(now - 5 * 86_400_000, now), '5 天前');
    assert.equal(kit.relativeTime(undefined, now), '—');
  });

  it('actionLabel 覆盖 core 的全部动作', () => {
    assert.equal(kit.actionLabel('created'), '已沉淀');
    assert.equal(kit.actionLabel('no-qa'), '无问答');
    assert.equal(kit.actionLabel('ignored'), '被拦下');
  });

  it('hintLine 把建议压成一行（含现值与依据）', () => {
    const line = kit.hintLine({ key: 'valueThreshold', current: 0.3, suggested: 0.25, why: '捕获率低' });
    assert.match(line, /valueThreshold：0\.3 → 0\.25/);
    assert.match(line, /捕获率低/);
  });

  it('statNumber / topBlocker 容忍缺字段（且不把 captured 当成拦截）', () => {
    assert.equal(kit.statNumber(null, 'turns'), undefined);
    assert.equal(kit.statNumber({ stats: { turns: 3 } }, 'turns'), 3);
    assert.deepEqual(kit.topBlocker({ captured: 9, a: 1, b: 5 }), { reason: 'b', count: 5 });
    assert.equal(kit.topBlocker({ captured: 2 }), null, '全通过 → null（面板显示「全部通过，无拦截」）');
    assert.equal(kit.topBlocker(null), null);
    assert.equal(kit.topBlocker({}), null);
  });

  it('summarizeDecisions 逐行镜像 core 的 summarize 口径', () => {
    const at = Date.now();
    const live = kit.summarizeDecisions(
      [
        { at, action: 'created', pass: true, reason: 'captured', score: 0.8 },
        { at, action: 'no-qa', pass: false, reason: '本轮没有问答轮' },
      ],
      { windowDays: 90 },
    );
    assert.equal(live.turns, 2);
    assert.equal(live.noQa, 1);
    assert.equal(live.evaluated, 1, 'no-qa 不计入已评估');
    assert.equal(live.captured, 1);
    assert.equal(live.captureRate, 1);
    assert.equal(live.score.max, 0.8);
    assert.equal(live.firstAt, at);
  });
});

/**
 * 判定曲线（所有者 2026-10-06：「最近判定也不需要这么多，可以给个图表曲线看看」）：
 * 列表缩到最近几条 + 可展开，趋势交给曲线 —— 纵轴恒为 0..1、阈值虚线、滑动均值趋势线，`no-qa` 不落点。
 */
describe('判定曲线（分值趋势）', () => {
  const rows = [
    { at: 1_000, action: 'ignored', pass: false, reason: 'below value threshold', score: 0.2 },
    { at: 2_000, action: 'no-qa', pass: false, reason: '本轮没有问答轮' },
    { at: 3_000, action: 'created', pass: true, reason: 'captured', score: 0.8 },
    { at: 4_000, action: 'created', pass: true, reason: 'captured', score: 0.6 },
  ];

  it('纵轴恒为 0..1：分值越高画得越靠上，阈值线与刻度都在几何里', () => {
    const curve = kit.buildScoreCurve(rows, { threshold: 0.3 });
    assert.equal(curve.points, 3, 'no-qa 没有分值，不落点');
    assert.equal(curve.skipped, 1);
    assert.equal(curve.threshold, 0.3);
    assert.ok(curve.thresholdY !== null && curve.thresholdY > 0 && curve.thresholdY < curve.height);
    assert.ok(curve.dots[0].y > curve.dots[1].y, '0.2 应画在 0.8 下面');
    assert.deepEqual(
      curve.ticks.map((tick) => tick.label),
      ['1.0', '0.5', '0.0'],
    );
    assert.equal(curve.min, 0.2);
    assert.equal(curve.max, 0.8);
    assert.match(curve.line, /^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/);
    assert.ok(curve.area.endsWith('Z'), '折线下要有填充（填到 0 分基线）');
    assert.equal(curve.dots[0].pass, false);
    assert.equal(curve.thin, false);
  });

  it('阈值不在 0..1 内 / 没给 → 不画那条线（宁可不画，也不画一条假的）', () => {
    assert.equal(kit.buildScoreCurve(rows, { threshold: 1.5 }).thresholdY, null);
    assert.equal(kit.buildScoreCurve(rows).thresholdY, null);
    assert.equal(kit.thresholdOf({ valueThreshold: 0.3 }), 0.3);
    assert.equal(kit.thresholdOf({ valueThreshold: '0.3' }), null);
    assert.equal(kit.thresholdOf(null), null);
  });

  it('趋势线要至少 3 个点（两个点的「趋势」是假的），每个点一段', () => {
    const two = kit.buildScoreCurve([rows[0], rows[2]]);
    assert.equal(two.trend, '', '两个点不出趋势线');
    const three = kit.buildScoreCurve(rows, { trendWindow: 2 });
    assert.match(three.trend, /^M/);
    assert.equal(three.trend.split(' L').length, 3, '3 个点 → 3 段');
  });

  it('空输入 / 坏行都不抛错：非数字不算点，越界分值夹到 0..1', () => {
    assert.equal(kit.buildScoreCurve([]).points, 0);
    assert.equal(kit.buildScoreCurve(undefined).line, '');
    assert.equal(kit.buildScoreCurve([]).thin, true);
    const messy = kit.buildScoreCurve([null, { score: Number.NaN }, { score: '0.5' }, { score: -3 }, { score: 9 }]);
    assert.equal(messy.points, 2);
    assert.deepEqual(
      messy.dots.map((dot) => dot.score),
      [0, 1],
    );
  });

  it('curveCaption 的数字全部来自几何（不另算一遍）', () => {
    const curve = kit.buildScoreCurve(rows, { threshold: 0.3 });
    const caption = kit.curveCaption(rows, curve);
    assert.match(caption, /最近 4 条判定/);
    assert.match(caption, /有效分值 3 个/);
    assert.match(caption, /阈值 0\.30/);
    assert.match(caption, /区间 0\.20–0\.80/);
    assert.match(kit.curveCaption([], kit.buildScoreCurve([])), /还没有带分值的判断/);
  });
});

/**
 * 方案 A（所有者 2026-10-06 裁定）：把「最近沉淀（条目库）」与「知识库笔记（磁盘）」
 * 合成**一栏** —— 笔记为骨架，条目独有的事（版本、被降级的旧版、状态、落地状态）挂在它后面。
 * 这里用内存夹具直接打纯函数，不碰磁盘。
 */
describe('知识库合栏（笔记为骨架 + 条目状态/版本）', () => {
  const items = [
    // 同一主题的两版：新版 active、旧版 superseded（core 的自动降级就长这样）
    { id: 'ts-a2', topic: '同名主题', title: '同名主题', created_at: 200, status: 'active', impl: 'implemented', version: 2, sourceTypes: ['session'], sources: 1 },
    { id: 'ts-a1', topic: '同名主题', title: '同名主题（旧）', created_at: 100, status: 'superseded', impl: 'designed', version: 1, sourceTypes: ['session'], sources: 1 },
    // 没有对应笔记的条目（主题没落成文件）
    { id: 'ts-b', topic: '孤条目', title: '没有笔记的一条', created_at: 300, status: 'active', impl: 'placeholder', version: 1, sourceTypes: ['session'], sources: 1 },
    // oblivion_digest 的条目：笔记在 04_会话整理/，不在 01_问答沉淀/
    { id: 'ts-c', topic: '整理件主题', title: '整理件标题', created_at: 400, status: 'active', impl: 'implemented', version: 1, sourceTypes: ['digest'], sources: 2 },
  ];
  const notes = [
    { name: '同名主题.md', path: 'X:/kb/01_问答沉淀/同名主题.md', mtimeMs: 500 },
    { name: '只有笔记.md', path: 'X:/kb/01_问答沉淀/只有笔记.md', mtimeMs: 50 },
  ];
  const digests = [{ name: '整理件主题.md', path: 'X:/kb/04_会话整理/整理件主题.md', mtimeMs: 450 }];

  it('笔记为骨架：同主题的多版并作一行，状态取当前版本，按最近动静排序', () => {
    const rows = kit.mergeKnowledge({ notes, digests, items });
    assert.deepEqual(
      rows.map((row) => row.title),
      ['同名主题', '整理件主题', '没有笔记的一条', '只有笔记'],
      '四行：笔记(2) + 无笔记条目(1) + 只有笔记(1)；同主题两版并作一行',
    );
    const first = rows[0];
    assert.equal(first.notePath, 'X:/kb/01_问答沉淀/同名主题.md');
    assert.equal(first.versions, 2, '同主题的两版都要算进来');
    assert.equal(first.status, 'active', '状态取当前版本');
    assert.equal(first.impl, 'implemented');
    assert.equal(first.itemId, 'ts-a2');
    assert.equal(first.at, 500, '时间取笔记 mtime 与条目时间的较大者');
  });

  it('无笔记的条目补成一行，并标注来源「仅入库」', () => {
    const rows = kit.mergeKnowledge({ notes, digests, items });
    const lonely = rows.find((row) => row.itemId === 'ts-b');
    assert.equal(lonely.title, '没有笔记的一条');
    assert.equal(lonely.notePath, undefined, '没有笔记就不给路径，绝不凭空造');
    assert.equal(lonely.source, 'item');
    assert.equal(kit.sourceLabel(lonely.source), '仅入库');
    assert.equal(lonely.versions, 1);
  });

  it('整理件与问答笔记同列，来源标「会话整理」', () => {
    const rows = kit.mergeKnowledge({ notes, digests, items });
    const digest = rows[1];
    assert.equal(digest.source, 'digest');
    assert.equal(kit.sourceLabel(digest.source), '会话整理');
    assert.match(String(digest.notePath), /04_会话整理/);
    assert.equal(digest.versions, 1, '整理件条目与整理件笔记合成一行');
  });

  it('只有笔记、没有条目也是一行（版本 0，不编造状态）', () => {
    const rows = kit.mergeKnowledge({ notes, digests, items });
    const noteOnly = rows[3];
    assert.equal(noteOnly.title, '只有笔记');
    assert.equal(noteOnly.versions, 0);
    assert.equal(noteOnly.status, '');
    assert.equal(noteOnly.source, 'note');
  });

  it('空输入 / 缺字段不抛错', () => {
    assert.deepEqual(kit.mergeKnowledge({}), []);
    assert.deepEqual(kit.mergeKnowledge({ notes: [{ name: '' }], items: [{ }] }), []);
  });

  it('状态与落地状态说人话', () => {
    assert.equal(kit.itemStatusLabel('active'), '当前版本');
    assert.equal(kit.itemStatusLabel('superseded'), '已被新版取代');
    assert.equal(kit.itemStatusLabel(''), '');
    assert.equal(kit.itemStatusLabel('weird'), 'weird');
    assert.equal(kit.implLabel('implemented'), '已落地');
    assert.equal(kit.implLabel('designed'), '仅设计');
    assert.equal(kit.implLabel('placeholder'), '占位');
    assert.equal(kit.implLabel(undefined), '');
    assert.equal(kit.sourceLabel('note'), '', '问答笔记是默认骨架，不加标注');
  });
});

/**
 * 每个文档下方那一行（所有者 2026-10-06）：「相关主题和关键词、日期」。
 *
 * 2026-10-17 所有者裁定把「日期」**拆成两段**：`入库`（笔记 `created_at`，绝对日期）+
 * `更新于`（这一行最新动静，相对时间）—— 因为两者来源不同，并排却都叫「日期」时读起来自相矛盾。
 *
 * 四段都来自**笔记头部**（frontmatter / `>Date` / `>Tags` / `> Wiki：`），解析在宿主半边
 * （`parseNoteHead`），渲染文案在 `detailParts()` —— 这里把两边都钉住。
 */
describe('文档下方：相关主题 / 关键词 / 入库 / 更新于', () => {
  /** 固定「现在」，让相对时间可断言（`rows[0].at` 就是 500）。 */
  const NOW = 500;
  const items = [{ id: 'ts-a', topic: '同名主题', title: '同名主题', created_at: 100, status: 'active', tags: ['dsh', 'panel'] }];
  const wikis = [
    { name: '主题页甲.md', path: 'X:/kb/02_Wiki页面/主题页甲.md' },
    { name: '主题页乙.md', path: 'X:/kb/02_Wiki页面/主题页乙.md' },
    { name: '主题页丙.md', path: 'X:/kb/02_Wiki页面/主题页丙.md' },
  ];
  const notes = [
    {
      name: '同名主题.md',
      path: 'X:/kb/01_问答沉淀/同名主题.md',
      mtimeMs: 500,
      tags: ['cordis', 'dsh'],
      createdAt: '2026-10-05',
      updatedAt: '2026-10-06',
      wiki: ['主题页甲', '主题页乙', '主题页丙'],
    },
  ];

  it('parseNoteHead：frontmatter 与元信息行两种布局都认（整理件没有 frontmatter）', () => {
    const front = kit.parseNoteHead(
      [
        '---',
        'tags: ["a", "b"]',
        'created_at: "2026-10-05"',
        'updated_at: "2026-10-06"',
        'related_wiki: ["页一"]',
        '---',
        '',
        '>Tags： #c #a',
        '> Wiki： [[页二]]',
      ].join('\n'),
    );
    assert.deepEqual(front.tags, ['a', 'b', 'c'], 'frontmatter 与 `>Tags` 行合并、去重');
    assert.deepEqual(front.wiki, ['页一', '页二']);
    assert.equal(front.createdAt, '2026-10-05');
    assert.equal(front.updatedAt, '2026-10-06');

    const digest = kit.parseNoteHead(['# 整理件', '', '>Date :  2026-10-04', '>Topic： 整理主题', ''].join('\n'));
    assert.equal(digest.createdAt, '2026-10-04', '没有 frontmatter 时日期取 `>Date :` 行');
    assert.equal(digest.updatedAt, '2026-10-04');
    assert.deepEqual(digest.tags, [], '没有关键词就是空数组，不编造');

    assert.deepEqual(kit.parseNoteHead(''), { tags: [], createdAt: '', updatedAt: '', wiki: [] });
    assert.deepEqual(kit.parseNoteHead('---\ntags: [a, b]\n---\n').tags, ['a', 'b'], '手写的数组也认（不整份丢）');
  });

  it('关键词 = 笔记 tags ∪ 同主题条目 tags（去重保序），多于 5 个折成 +N', () => {
    const rows = kit.mergeKnowledge({ notes, wikis, items });
    assert.deepEqual(rows[0].tags, ['cordis', 'dsh', 'panel'], '笔记在前、条目补后、重复的不再加');
    assert.equal(kit.keywordText(rows[0]), '#cordis #dsh #panel');
    assert.equal(kit.keywordText({ ...rows[0], tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }), '#a #b #c #d #e +2');
    assert.equal(kit.keywordText({ ...rows[0], tags: ['#x'] }), '#x', '已经带 # 的不重复加');
    assert.equal(kit.keywordText({ ...rows[0], tags: [] }), '', '没有关键词是空串（渲染时不显示这一段）');
  });

  it('相关主题：把回链标题解析成可点开的路径；解析不到只留标题', () => {
    const rows = kit.mergeKnowledge({ notes, wikis, items });
    assert.equal(rows[0].wiki.length, 3);
    assert.equal(rows[0].wiki[0].path, 'X:/kb/02_Wiki页面/主题页甲.md');
    const parts = kit.detailParts(rows[0], NOW);
    assert.equal(parts[0].label, '相关主题');
    assert.equal(parts[0].text, '主题页甲、主题页乙 +1', '多于 2 个折成 +N');
    assert.deepEqual(parts[0].wiki.map((page) => page.title), ['主题页甲', '主题页乙'], '可点开的与文本一致（前两个）');
    assert.equal(parts[2].label, '入库');
    assert.equal(parts[2].text, '2026-10-05', '入库日取笔记的 created_at');
    assert.equal(parts[3].label, '更新于');
    assert.equal(parts[3].text, '刚刚');

    const unknown = { ...rows[0], wiki: [{ title: '没有文件的主题页' }] };
    assert.equal(kit.wikiText(unknown), '没有文件的主题页');
    assert.equal(
      kit.detailText(unknown, NOW),
      '相关主题：没有文件的主题页 · 关键词：#cordis #dsh #panel · 入库：2026-10-05 · 更新于：刚刚',
      '四段拼成一行（顺序固定）',
    );
  });

  it('入库日取笔记写的 created_at；没有就按时间戳折算；都没有就不显示这两段', () => {
    const rows = kit.mergeKnowledge({ notes, wikis, items });
    assert.equal(rows[0].createdDate, '2026-10-05', '入库日取 created_at，不是 updated_at');
    assert.equal(kit.dateText(rows[0]), '2026-10-05');
    assert.equal(kit.updatedText(rows[0], NOW), '刚刚', '更新于取这一行的最新动静');
    const bare = { key: 'k', title: 't', at: new Date(2026, 9, 6, 12, 0, 0).getTime(), source: 'item', tags: [], wiki: [], createdDate: '' };
    assert.equal(kit.dateText(bare), '2026-10-06', '没有笔记日期时按 at 折算（本地时区）');
    assert.equal(kit.dateText({ ...bare, at: 0 }), '', '没有时间就不给入库日');
    assert.equal(kit.updatedText(bare, bare.at), '刚刚');
    assert.equal(kit.updatedText({ ...bare, at: 0 }), '', '没有时间就不给「更新于」');
    assert.equal(kit.detailText({ ...bare, at: 0 }), '相关主题：未归并', '没有主题页就说「未归并」（这是要跑一轮 wiki 的信号）');
  });

  it('只有笔记、没有条目时也有全部四段（不依赖条目）', () => {
    const rows = kit.mergeKnowledge({ notes, wikis });
    assert.equal(kit.detailText(rows[0], NOW), '相关主题：主题页甲、主题页乙 +1 · 关键词：#cordis #dsh · 入库：2026-10-05 · 更新于：刚刚');
  });

  it('仅入库的行也有关键词、入库与更新于（条目里的 tags / created_at）', () => {
    const at = new Date(2026, 9, 6, 12, 0, 0).getTime();
    const rows = kit.mergeKnowledge({
      items: [
        { id: 'ts-z', topic: '孤条目', title: '孤条目', created_at: at, status: 'active', tags: ['mcp', 'bridge'] },
      ],
    });
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0].wiki, [], '没有笔记文件就没有回链');
    assert.equal(kit.detailText(rows[0], at), '相关主题：未归并 · 关键词：#mcp #bridge · 入库：2026-10-06 · 更新于：刚刚');
  });
});

/**
 * 知识库一栏的默认视图（所有者 2026-10-06 对「最近判定」说的是同一句话：「不需要这么多」）。
 * 实测一栏 47 行里 36 行是「仅入库」，会把能点开的笔记挤到看不见。
 */
describe('知识库默认视图（仅入库折叠）', () => {
  const row = (key, notePath) => ({
    key,
    title: key,
    notePath,
    at: 0,
    source: notePath ? 'note' : 'item',
    status: '',
    impl: '',
    versions: 1,
    itemId: '',
    sources: 0,
    topic: '',
  });
  const rows = [
    row('a', 'K:/01_问答沉淀/a.md'),
    row('i1'),
    row('i2'),
    row('i3'),
    row('i4'),
    row('i5'),
    row('i6'),
    row('i7'),
    row('b', 'K:/04_会话整理/b.md'),
  ];

  it('默认：有笔记的全显示，仅入库只留最近 5 条，且顺序不变', () => {
    const view = kit.knowledgeView(rows);
    assert.equal(view.backbone.length, 2);
    assert.equal(view.itemOnly.length, 7);
    assert.deepEqual(
      view.visible.map((item) => item.key),
      ['a', 'i1', 'i2', 'i3', 'i4', 'i5', 'b'],
      '按原数组过滤，不重排（折叠与展开之间位置不跳）',
    );
    assert.equal(view.hidden, 2);
    assert.equal(kit.KNOWLEDGE_ITEM_LIMIT, 5);
  });

  it('展开：全部行回来，hidden 归零', () => {
    const view = kit.knowledgeView(rows, { showAll: true });
    assert.equal(view.visible.length, rows.length);
    assert.equal(view.hidden, 0);
  });

  it('itemLimit 可调；没有仅入库行 / 空输入都不抛错', () => {
    assert.equal(kit.knowledgeView(rows, { itemLimit: 2 }).visible.length, 4);
    assert.equal(kit.knowledgeView(rows, { itemLimit: 0 }).visible.length, 2);
    assert.equal(kit.knowledgeView([row('a', 'K:/a.md')]).hidden, 0);
    assert.deepEqual(kit.knowledgeView([]).visible, []);
    assert.equal(kit.knowledgeView([]).hidden, 0);
  });
});

/**
 * 设置分节（`settings.section`）：路径 / 自动整理 / 模型选择。
 *
 * 这一组测的是**写盘的最后一公里** —— 表单 → `{patch}` 的构造。它一旦错，
 * 后果不是报错而是「静默写歪配置」，所以每个三态（没碰 / 恢复默认 / 改值）都单独钉一条。
 */
function settingsPayload(overrides = {}) {
  return {
    ok: true,
    version: '0.2.17',
    path: 'C:/Users/x/.oblivion/data/settings.json',
    values: {},
    sources: {},
    effective: {
      mdRoot: 'C:/Library/那些渐渐被遗忘',
      semanticThreshold: 0.85,
      valueThreshold: 0.3,
      organize: {
        enabled: false,
        digest: true,
        retitle: true,
        provider: '',
        model: '',
        fallbacks: [],
        maxTokens: 1024,
        timeoutMs: 30000,
        everyTurns: 0,
        minIntervalMs: 600000,
        autoApply: false,
        batchSize: 8,
      },
    },
    writable: ['mdRoot', 'organize', 'semanticThreshold', 'valueThreshold', 'mdClassify'],
    pending: [],
    catalog: {
      providers: [
        { id: 'agnes', name: 'Agnes', models: [{ id: 'agnes-2.5-flash', name: 'agnes-2.5-flash' }] },
        { id: 'agnes-api', name: 'Agnes', models: [{ id: 'agnes-3.0-flash', name: 'agnes-3.0-flash' }] },
      ],
      routes: [{ provider: 'agnes-api', model: 'agnes-3.0-flash' }],
      routeSource: 'host-default',
      llmAvailable: true,
    },
    ...overrides,
  };
}

describe('设置分节：表单 → 补丁（写盘前的最后一公里）', () => {
  it('只写被碰过的格子；`null` 原样传下去（= 恢复默认，不能被吃掉）', () => {
    assert.deepEqual(kit.buildPatch({}), { patch: {}, keys: [] });
    assert.deepEqual(kit.buildPatch({ mdRoot: 'D:/kb' }), { patch: { mdRoot: 'D:/kb' }, keys: ['mdRoot'] });
    // 键序稳定：同一份表单永远得到同一个请求体（单测因此能逐字比对）。
    const nested = kit.buildPatch({ 'organize.enabled': true, 'organize.batchSize': 4 });
    assert.deepEqual(nested.keys, ['organize.batchSize', 'organize.enabled']);
    assert.deepEqual(nested.patch, { organize: { batchSize: 4, enabled: true } });
    // 「恢复默认」在 core 那边就是 `null`（`writeSettings()` 删掉这一键、回到下层）。
    assert.deepEqual(kit.buildPatch({ mdRoot: null }).patch, { mdRoot: null });
    assert.deepEqual(kit.buildPatch({ mdRoot: null, 'organize.model': 'agnes-3.0-flash' }).patch, {
      mdRoot: null,
      organize: { model: 'agnes-3.0-flash' },
    });
  });

  it('resolveField：设置层有就用它，否则用「正在跑」的那份，并把来源说出来', () => {
    const payload = settingsPayload({
      values: { organize: { enabled: true } },
      sources: { 'organize.enabled': 'settings', mdRoot: 'plugin', 'organize.digest': 'default' },
    });
    assert.deepEqual(kit.resolveField(payload, 'organize.enabled'), { value: true, source: 'settings', fromSettings: true });
    assert.deepEqual(kit.resolveField(payload, 'organize.digest'), { value: true, source: 'default', fromSettings: false });
    assert.deepEqual(kit.resolveField(payload, 'mdRoot'), {
      value: 'C:/Library/那些渐渐被遗忘',
      source: 'plugin',
      fromSettings: false,
    });
    assert.equal(kit.configSourceLabel('settings'), '设置页');
    assert.equal(kit.configSourceLabel('plugin'), '插件配置');
    assert.equal(kit.configSourceLabel('default'), '默认值');
    assert.deepEqual(kit.splitFieldKey('organize.enabled'), { head: 'organize', sub: 'enabled' });
    assert.deepEqual(kit.splitFieldKey('mdRoot'), { head: 'mdRoot' });
  });

  it('editField / resetField：改回原值就等于撤掉改动', () => {
    const payload = settingsPayload({
      values: { organize: { batchSize: 4 } },
      sources: { 'organize.batchSize': 'settings' },
    });
    // 改回当前值 ⇒ **不写**（否则会把一个多余的值钉进设置层，压过 profile）。
    assert.deepEqual(kit.editField({ 'organize.batchSize': 9 }, payload, 'organize.batchSize', 4), {});
    assert.deepEqual(kit.editField({}, payload, 'organize.batchSize', 9), { 'organize.batchSize': 9 });
    // 恢复默认：设置层有这个键 ⇒ `null`（让 core 删掉它）；只是表单里改了 ⇒ 撤掉这一格即可。
    assert.deepEqual(kit.resetField({}, payload, 'organize.batchSize'), { 'organize.batchSize': null });
    assert.deepEqual(kit.resetField({ mdRoot: 'x' }, payload, 'mdRoot'), {});
    assert.deepEqual(kit.setField({ a: 1, b: 2 }, 'a', undefined), { b: 2 });
    assert.equal(kit.draftCount({ mdRoot: 'x', 'organize.enabled': true }), 2);
    assert.equal(kit.draftCount({}), 0);
    assert.equal(kit.sameValue(null, undefined), true);
    assert.equal(kit.sameValue([{ provider: 'a', model: 'b' }], [{ provider: 'a', model: 'b' }]), true);
    assert.equal(kit.sameValue(4, '4'), false);
  });

  it('数字输入：空串 = 恢复默认，读不懂就不动这一格', () => {
    assert.equal(kit.parseNumberText(''), null);
    assert.equal(kit.parseNumberText('   '), null);
    assert.equal(kit.parseNumberText('10'), 10);
    assert.equal(kit.parseNumberText(' 0 '), 0);
    assert.equal(kit.parseNumberText('abc'), undefined);
    assert.equal(kit.parseNumberText('12abc'), undefined);
    // 显示按 scale 换算（毫秒→分钟、毫秒→秒），落盘仍是原单位。
    assert.equal(kit.numberText(600000, 60000), '10');
    assert.equal(kit.numberText(30000, 1000), '30');
    assert.equal(kit.numberText(0.85), '0.85');
    assert.equal(kit.numberText(undefined), '');
    assert.equal(kit.numberText(null), '');
  });

  it('provider / model 下拉框：自定义 provider 与官方一视同仁，清单外的值不静默丢掉', () => {
    const payload = settingsPayload();
    const providers = kit.providerOptions(payload.catalog);
    assert.deepEqual(providers[0], { value: '', label: '（跟随宿主默认）' });
    assert.deepEqual(providers.slice(1).map((option) => option.value), ['agnes', 'agnes-api']);
    assert.deepEqual(kit.modelOptions(payload.catalog, 'agnes').map((option) => option.value), ['', 'agnes-2.5-flash']);
    assert.deepEqual(kit.modelOptions(payload.catalog, '').map((option) => option.value), ['']);
    // 清单里没有的当前值补一条 —— 否则 `<select>` 静默跳到第一项，用户一保存就把配置改了。
    assert.deepEqual(kit.withCurrent(providers, 'ghost').at(-1), {
      value: 'ghost',
      label: 'ghost（不在宿主清单里）',
    });
    assert.equal(kit.withCurrent(providers, 'agnes').length, providers.length);
    // 宿主没回清单（core 版本旧 / 没装 llm）也不抛错，只是没得选。
    assert.equal(kit.providerOptions(null).length, 1);
    assert.equal(kit.modelOptions(undefined, 'agnes').length, 1);
  });

  it('routeProblem：对不上的 provider / model 要说出来，但不替用户改配置', () => {
    const catalog = settingsPayload().catalog;
    assert.equal(kit.routeProblem(catalog, 'agnes', 'agnes-2.5-flash'), null);
    assert.match(kit.routeProblem(catalog, 'agnes', 'agnes-3.0-flash'), /没有 model/);
    assert.match(kit.routeProblem(catalog, 'ghost', 'x'), /不在宿主注册表里/);
    assert.match(kit.routeProblem(null, 'agnes', 'x'), /不在宿主注册表里/);
    assert.equal(kit.routeProblem(catalog, '', 'x'), null);
    assert.equal(kit.routeProblem(catalog, 'agnes', ''), null);
  });

  it('catalogSummary / routesText：把「打开会用哪条路」说清楚', () => {
    const catalog = settingsPayload().catalog;
    const summary = kit.catalogSummary(catalog);
    assert.match(summary.label, /宿主的默认选路/);
    assert.equal(summary.routes, 'agnes-api / agnes-3.0-flash');
    assert.match(kit.catalogSummary({ ...catalog, routeSource: 'config' }).label, /provider \/ model/);
    assert.match(kit.catalogSummary({ ...catalog, routeSource: 'none', routes: [] }).routes, /没有可用的路/);
    assert.match(kit.catalogSummary({ ...catalog, llmAvailable: false }).routes, /自动整理会跳过/);
    assert.match(kit.catalogSummary(null).label, /宿主没回清单/);
    assert.equal(kit.routeText({ provider: 'a', model: '' }), '（没配全）');
    assert.equal(kit.routeText(null), '（没配全）');
  });

  it('fallbacksOf：只留两端都有的路（与 core 的 buildRoutes 同口径）', () => {
    const payload = settingsPayload({
      values: {
        organize: { fallbacks: [{ provider: 'a', model: 'b' }, { provider: 'c', model: '' }, 'junk', null] },
      },
    });
    assert.deepEqual(kit.fallbacksOf(payload), [
      { provider: 'a', model: 'b' },
      { provider: 'c', model: '' },
    ]);
    assert.deepEqual(kit.fallbacksOf(settingsPayload()), []);
    assert.equal(kit.isCompleteRoute({ provider: 'a', model: 'b' }), true);
    assert.equal(kit.isCompleteRoute({ provider: 'a', model: '' }), false);
  });

  it('保存结果与待重启：如实报，不美化', () => {
    const base = { values: {}, sources: {}, effective: {} };
    assert.equal(
      kit.describeSaveResult({ ...base, saved: true, changed: ['mdRoot'], rejected: [], pending: ['mdRoot'] }).kind,
      'ok',
    );
    assert.match(
      kit.describeSaveResult({ ...base, saved: true, changed: ['mdRoot'], rejected: [], pending: ['mdRoot'] }).text,
      /重启 DSH 才生效/,
    );
    assert.equal(kit.describeSaveResult({ ...base, saved: false, changed: [], rejected: [], pending: [] }).kind, 'error');
    assert.equal(kit.describeSaveResult({ ...base, saved: true, changed: [], rejected: [], pending: [] }).kind, 'warn');
    const partial = kit.describeSaveResult({ ...base, saved: true, changed: ['mdRoot'], rejected: ['bogus'], pending: [] });
    assert.equal(partial.kind, 'warn');
    assert.match(partial.text, /被 core 丢掉/);
    assert.equal(kit.pendingSentence([]), null);
    assert.equal(kit.pendingSentence(undefined), null);
    assert.match(kit.pendingSentence(['mdRoot', 'organize.enabled']), /mdRoot、organize\.enabled/);
    assert.match(kit.writableNote(['mdRoot', 'organize', 'semanticThreshold', 'valueThreshold', 'mdClassify']), /mdClassify/);
    assert.equal(kit.writableNote(['mdRoot', 'organize']), '');
    assert.equal(kit.shortKey('organize.enabled'), 'enabled');
    assert.equal(kit.shortKey('mdRoot'), 'mdRoot');
  });

  it('loadSettings / postSettings：每条拒绝都翻译成人话，请求体恒为 {patch:…}', async () => {
    const okGet = await kit.loadSettings({
      fetch: async () => ({ ok: true, status: 200, json: async () => settingsPayload() }),
    });
    assert.equal(okGet.ok, true);
    assert.equal(okGet.payload.version, '0.2.17');

    const missing = await kit.loadSettings({
      fetch: async () => ({ ok: false, status: 404, json: async () => ({ ok: false, error: 'x' }) }),
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.status, 404);
    assert.match(missing.error, /0\.2\.17/);

    const refused = await kit.loadSettings({
      fetch: async () => ({ ok: false, status: 403, json: async () => ({ error: 'untrusted origin' }) }),
    });
    assert.match(refused.error, /来源/);
    assert.match(refused.error, /untrusted origin/);

    const boom = await kit.loadSettings({
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    assert.match(boom.error, /连不上/);

    const notJson = await kit.loadSettings({
      fetch: async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('bad body');
        },
      }),
    });
    assert.match(notJson.error, /不是 JSON 对象/);

    let seen = null;
    const posted = await kit.postSettings(
      { mdRoot: 'D:/kb' },
      {
        fetch: async (url, init) => {
          seen = { url, init };
          return {
            ok: true,
            status: 200,
            json: async () =>
              settingsPayload({ saved: true, changed: ['mdRoot'], rejected: [], pending: ['mdRoot'], restartRequired: true }),
          };
        },
      },
    );
    assert.equal(posted.ok, true);
    assert.equal(seen.url, kit.SETTINGS_ROUTE);
    assert.equal(seen.init.method, 'POST');
    assert.equal(seen.init.credentials, 'same-origin');
    assert.deepEqual(JSON.parse(seen.init.body), { patch: { mdRoot: 'D:/kb' } });
    assert.equal(posted.result.restartRequired, true);

    const huge = await kit.postSettings(
      {},
      { fetch: async () => ({ ok: false, status: 413, json: async () => ({}) }) },
    );
    assert.match(huge.error, /64 KiB/);

    assert.match(kit.httpHint(405), /GET \/ POST/);
    assert.match(kit.httpHint(500), /core 自己报错/);
    assert.match(kit.httpHint(400), /合法的 JSON/);
    assert.equal(kit.httpHint(418), '');
    assert.equal(kit.SETTINGS_ROUTE, '/oblivion-core/settings');
  });
});
