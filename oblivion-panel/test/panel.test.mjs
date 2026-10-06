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

  writeFileSync(
    join(dataRoot, 'status.json'),
    JSON.stringify({
      version: '0.1.5',
      mdRoot,
      stats: { turns: 3, evaluated: 2, noQa: 1, captured: 1, rejected: 1, captureRate: 0.5, byReason: { captured: 1, 'below value threshold': 1 } },
      hints: [{ key: 'valueThreshold', current: 0.3, suggested: 0.25, why: '捕获率低' }],
    }),
    'utf8',
  );
  writeFileSync(
    join(dataRoot, 'decisions.jsonl'),
    [
      JSON.stringify({ at: 1, action: 'created', pass: true, reason: 'captured', ms: 3 }),
      JSON.stringify({ at: 2, action: 'ignored', pass: false, reason: 'below value threshold', score: 0.21, ms: 2 }),
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
    assert.equal(snapshot.items.length, 1);
    assert.equal(snapshot.items[0].title, '一条知识');
    assert.equal(snapshot.notes.length, 1);
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

  it('statNumber / topReason 容忍缺字段', () => {
    assert.equal(kit.statNumber(null, 'turns'), undefined);
    assert.equal(kit.statNumber({ stats: { turns: 3 } }, 'turns'), 3);
    assert.deepEqual(kit.topReason({ stats: { byReason: { a: 1, b: 5 } } }), { reason: 'b', count: 5 });
    assert.equal(kit.topReason({}), null);
  });
});
