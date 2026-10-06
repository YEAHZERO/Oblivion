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
    JSON.stringify({ id: 'ts-1', topic: '测试主题', title: '一条知识', created_at: 10, status: 'active', version: 1, sources: [{ type: 'session', ref: 's#1', hash: 'h' }] }),
    'utf8',
  );
  writeFileSync(join(mdRoot, '01_问答沉淀', '测试主题.md'), '# 一条知识\n', 'utf8');
  writeFileSync(join(mdRoot, '04_会话整理', '2026-10-06-整理.md'), '# 整理件\n', 'utf8');
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
    assert.equal(snapshot.notes.length, 1);
    assert.equal(snapshot.digests.length, 1, '04_会话整理 的整理件也要读出来（合栏后能点开）');
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
