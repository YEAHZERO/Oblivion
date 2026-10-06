#!/usr/bin/env node
/**
 * @oblivion/panel 端到端自检。
 *
 * 覆盖两个真实面：
 *   ① **Node 半边**：`apply()` → 路由注册 → `GET /oblivion-panel/status` 真的返回 JSON
 *      （用桩 req/res，走真实文件系统）；
 *   ② **浏览器半边**：`registerPanelTab` 的三种结局（注册成功 / 服务缺席 / 抛错）
 *      与 descriptor 形状 —— 这里测不了真实 side bar，但能把契约面钉住。
 *
 * 与其它两个插件同一验收哲学：**能在本机自证的才敢声称**。
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
let failed = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push(['PASS', name, detail ?? '']);
  } catch (error) {
    failed += 1;
    results.push(['FAIL', name, error instanceof Error ? error.message : String(error)]);
  }
}

const lib = join(ROOT, 'lib', 'index.js');
const kitPath = join(ROOT, 'lib', 'testkit.js');

/** 造一份「core 跑过」的现场。 */
const tmp = mkdtempSync(join(tmpdir(), 'oblivion-panel-selfcheck-'));
const dataRoot = join(tmp, 'data');
const mdRoot = join(tmp, 'kb');
mkdirSync(dataRoot, { recursive: true });
mkdirSync(join(mdRoot, '01_问答沉淀'), { recursive: true });
writeFileSync(
  join(dataRoot, 'status.json'),
  JSON.stringify({ version: '0.1.5', mdRoot, config: { statsRetentionDays: 90, statsMaxEntries: 5000 }, stats: { turns: 4, evaluated: 3, noQa: 1, captured: 1, rejected: 2, captureRate: 0.333, byReason: { captured: 1, 'answer-too-short': 2 } }, hints: [] }),
  'utf8',
);
writeFileSync(
  join(dataRoot, 'decisions.jsonl'),
  // `at` 必须落在保留期内：面板与 core `trace.read()` 同口径裁剪，过期留痕会被丢掉。
  [JSON.stringify({ at: Date.now() - 1000, action: 'ignored', pass: false, reason: 'answer-too-short', ms: 1 })].join('\n') + '\n',
  'utf8',
);
writeFileSync(join(dataRoot, 'ts-9.json'), JSON.stringify({ id: 'ts-9', topic: 't', title: '自检条目', created_at: 9, status: 'active', version: 1, sources: [] }), 'utf8');
writeFileSync(join(mdRoot, '01_问答沉淀', 't.md'), '# 自检条目\n', 'utf8');

await check('产物存在且可 import', async () => {
  assert.ok(existsSync(lib), 'lib/index.js 不存在，先运行 build');
  assert.ok(existsSync(kitPath), 'lib/testkit.js 不存在，先运行 build');
  const mod = await import(pathToFileURL(lib).href);
  assert.equal(mod.name, '@oblivion/panel');
  assert.equal(
    mod.VERSION,
    readFileSync(join(ROOT, 'VERSION'), 'utf8').trim(),
    'VERSION 必须直接来自包根 VERSION 文件（曾经写死成 0.0.1，面板标题栏一直显示旧版本）',
  );
  return 'lib/index.js + lib/testkit.js @ v' + mod.VERSION;
});

await check('apply 注册两条路由（只读快照 + 客户端 ctx 自报）', async () => {
  const mod = await import(pathToFileURL(lib).href);
  const routes = [];
  const ctx = {
    inject: (deps, callback) => {
      assert.deepEqual([...deps], ['webServer']);
      callback({ webServer: { register: (route) => routes.push(route) } });
    },
    logger: { warn() {}, info() {} },
  };
  mod.apply(ctx, { dataRoot, fallbackMdRoot: mdRoot });
  assert.equal(routes.length, 2, '应注册 2 条路由（status + diag）');
  assert.deepEqual(routes.map((r) => r.path).sort(), ['/oblivion-panel/diag', '/oblivion-panel/status']);
  assert.ok(routes.every((r) => r.kind === 'exact'), '两条都应是 exact 路由');
  return routes.map((r) => r.path).join(' + ');
});

await check('路由真跑：GET 返回快照 JSON（含 stats / recent / items / notes）', async () => {
  const mod = await import(pathToFileURL(lib).href);
  let route;
  mod.apply(
    { inject: (_d, cb) => cb({ webServer: { register: (r) => { if (r.path === '/oblivion-panel/status') route = r; } } }), logger: { warn() {}, info() {} } },
    { dataRoot, fallbackMdRoot: mdRoot },
  );

  const captured = await new Promise((resolvePromise) => {
    const response = {
      writeHead(code, headers) { this.code = code; this.headers = headers; },
      end(body) { resolvePromise({ code: this.code, headers: this.headers, body }); },
    };
    route.handler({ method: 'GET' }, response);
  });
  assert.equal(captured.code, 200);
  assert.equal(captured.headers['cache-control'], 'no-store');
  const json = JSON.parse(captured.body);
  assert.equal(json.ok, true);
  assert.equal(json.core.version, '0.1.5');
  assert.equal(json.trace.recent.length, 1);
  // 顶部 KPI 现算：status.json 里写的是 4 轮 / 已沉淀 1，留痕里其实只有 1 行、0 条沉淀
  assert.equal(json.live.turns, 1, 'live 统计应来自 decisions.jsonl，而不是 core 的装载快照');
  assert.equal(json.live.evaluated, 1);
  assert.equal(json.live.captured, 0);
  assert.equal(json.live.captureRate, 0);
  const kit = await import(pathToFileURL(kitPath).href);
  assert.deepEqual(
    kit.topBlocker(json.live.byReason),
    { reason: 'answer-too-short', count: 1 },
    'captured 不能被当成拦截原因',
  );
  assert.equal(json.items.length, 1);
  assert.equal(json.notes.length, 1);
  return 'core v' + json.core.version + ' / 判定 ' + json.trace.recent.length + ' / 条目 ' + json.items.length + ' / 笔记 ' + json.notes.length;
});

await check('留痕现算统计与 core 同口径（no-qa 不计入已评估 / captured 不算拦截）', async () => {
  const kit = await import(pathToFileURL(kitPath).href);
  const at = Date.now();
  const rows = [
    { at, action: 'created', pass: true, reason: 'captured', score: 0.8 },
    { at, action: 'ignored', pass: false, reason: 'below value threshold', score: 0.21 },
    { at, action: 'ignored', pass: false, reason: 'below value threshold', score: 0.19 },
    { at, action: 'no-qa', pass: false, reason: '本轮没有问答轮' },
  ];
  const live = kit.summarizeDecisions(rows, { parsed: 4, dropped: 0, windowDays: 90 });
  assert.equal(live.turns, 4);
  assert.equal(live.noQa, 1);
  assert.equal(live.evaluated, 3, 'no-qa 不计入已评估（与 core summarize 一致）');
  assert.equal(live.captured, 1);
  assert.equal(live.rejected, 2);
  assert.equal(live.captureRate, 0.333);
  assert.equal(live.score.belowThreshold, 2);
  assert.deepEqual(kit.topBlocker(live.byReason), { reason: 'below value threshold', count: 2 });
  assert.equal(kit.topBlocker({ captured: 5 }), null, '全通过时应返回 null（面板显示「全部通过，无拦截」）');
  return 'evaluated ' + live.evaluated + ' / captured ' + live.captured + ' / 拦截 ' + kit.topBlocker(live.byReason).reason;
});

await check('非 GET 一律 405（只读面不接受写）', async () => {
  const mod = await import(pathToFileURL(lib).href);
  let route;
  mod.apply(
    { inject: (_d, cb) => cb({ webServer: { register: (r) => { if (r.path === '/oblivion-panel/status') route = r; } } }), logger: { warn() {}, info() {} } },
    { dataRoot, fallbackMdRoot: mdRoot },
  );
  const captured = await new Promise((resolvePromise) => {
    const response = {
      writeHead(code, headers) { this.code = code; this.headers = headers; },
      end(body) { resolvePromise({ code: this.code, body }); },
    };
    route.handler({ method: 'POST' }, response);
  });
  assert.equal(captured.code, 405);
  return 'POST → 405';
});

await check('diag 路由：POST 客户端 ctx 形状 → 原子落盘 panel-client-diag.json', async () => {
  const mod = await import(pathToFileURL(lib).href);
  let route;
  mod.apply(
    { inject: (_d, cb) => cb({ webServer: { register: (r) => { if (r.path === '/oblivion-panel/diag') route = r; } } }), logger: { warn() {}, info() {} } },
    { dataRoot, fallbackMdRoot: mdRoot },
  );
  assert.ok(route, 'diag 路由应注册');
  const payload = JSON.stringify({ where: 'client', keys: ['on', 'inject'], hasInject: true });
  const captured = await new Promise((resolvePromise) => {
    const listeners = {};
    const request = {
      method: 'POST',
      on(event, handler) { listeners[event] = handler; return this; },
    };
    const response = {
      writeHead(code, headers) { this.code = code; this.headers = headers; },
      end(body) { resolvePromise({ code: this.code, body }); },
    };
    route.handler(request, response);
    listeners.data?.(Buffer.from(payload, 'utf8'));
    listeners.end?.();
  });
  assert.equal(captured.code, 200);
  const file = join(dataRoot, 'panel-client-diag.json');
  assert.ok(existsSync(file), '应写出 panel-client-diag.json');
  const written = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(written.where, 'client');
  assert.equal(written.hasInject, true);
  assert.ok(typeof written.receivedAt === 'number', '应带落盘时间戳');
  assert.equal(readdirSync(dataRoot).filter((f) => f.endsWith('.tmp')).length, 0, '不应留 .tmp 残留');
  return 'panel-client-diag.json ✅（原子写，无残留）';
});

await check('webServer 缺席时不抛错（只记一条日志）', async () => {
  const mod = await import(pathToFileURL(lib).href);
  const warnings = [];
  mod.apply({ inject: (_d, cb) => cb({}), logger: { warn: (m) => warnings.push(String(m)), info() {} } }, { dataRoot });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /webServer/);
  return warnings[0].slice(0, 60);
});

await check('面板注册：成功 / 服务缺席 / 抛错 三种结局都被钉住', async () => {
  const kit = await import(pathToFileURL(kitPath).href);
  const ok = kit.registerPanelTab({ inject: (_d, cb) => cb({ betterSidebar: { registerTab: () => () => undefined } }) }, () => null, () => undefined);
  const none = kit.registerPanelTab({ inject: (_d, cb) => cb({}) }, () => null, () => undefined);
  const boom = kit.registerPanelTab({ inject: (_d, cb) => cb({ betterSidebar: { registerTab: () => { throw new Error('x'); } } }) }, () => null, () => undefined);
  assert.equal(ok.status, 'registered');
  assert.equal(none.status, 'no-service');
  assert.equal(boom.status, 'failed');
  return 'registered / no-service / failed';
});

await check('客户端产物是 DSH 模块格式（不是 ESM）', async () => {
  const code = readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8');
  assert.ok(code.includes('window.__ModuleLoader__.load'));
  assert.ok(code.includes('"@oblivion/panel"'));
  assert.ok(code.includes('react/jsx-runtime'), 'React 必须留作 external（由宿主模块表提供）');
  return code.length + ' B';
});

await check('卸载无残留：effect 里登记的 disposer 都被调用', async () => {
  const kit = await import(pathToFileURL(kitPath).href);
  let disposed = 0;
  const effects = [];
  kit.registerPanelTab(
    {
      inject: (_d, cb) => cb({ betterSidebar: { registerTab: () => () => { disposed += 1; } } }),
      effect: (fn, label) => { effects.push(label); const cleanup = fn(); if (typeof cleanup === 'function') cleanup(); },
    },
    () => null,
    () => undefined,
  );
  assert.equal(effects.length, 1);
  assert.equal(disposed, 1);
  return 'disposer 已随 effect 释放';
});

await check('判定行格式化：scoreText 收住浮点尾巴 / reasonLabel 未知键原样露出', async () => {
  const kit = await import(pathToFileURL(kitPath).href);
  assert.equal(kit.scoreText(0.7000000000000001), '0.7', '面板实测过的浮点尾巴应被收掉');
  assert.equal(kit.scoreText(0.8), '0.8');
  assert.equal(kit.scoreText(undefined), '—');
  assert.equal(kit.scoreText('0.5'), '—', '非数字一律破折号，不猜');
  assert.equal(kit.reasonLabel('captured'), '通过：已沉淀');
  assert.equal(kit.reasonLabel('answer-too-short'), '回答太短');
  assert.equal(kit.reasonLabel('exception: boom'), '判定异常 boom');
  assert.equal(kit.reasonLabel('core 以后新增的原因'), 'core 以后新增的原因', '未知原因必须原样露出，不能编解释');
  return 'scoreText / reasonLabel 各 4 条';
});

await check('笔记点击：openNoteInSidebar 的五条路径都被钉住', async () => {
  const kit = await import(pathToFileURL(kitPath).href);
  const calls = [];
  const capable = (extra = {}) => ({
    features: ['openFile'],
    openFile: (scope, path) => calls.push({ via: 'service', scope, path }),
    ...extra,
  });

  // ① props.scope 直接可用
  assert.equal(
    kit.openNoteInSidebar({ service: capable(), scope: { sessionId: 's-9', cwd: 'C:/x' }, path: ' C:/kb/a.md ' }),
    'opened',
  );
  assert.equal(calls[0].path, 'C:/kb/a.md', '路径应被 trim');
  assert.deepEqual(calls[0].scope, { sessionId: 's-9', cwd: 'C:/x' });

  // ② props.scope 缺席 → 用 getSnapshot() 的当前激活会话
  assert.equal(
    kit.openNoteInSidebar({ service: capable({ getSnapshot: () => ({ sessionId: 's-7' }) }), path: 'C:/kb/b.md' }),
    'opened',
  );
  assert.equal(calls[1].scope.sessionId, 's-7');

  // ③ 能力位里没有 openFile → 不走服务，落到宿主 prop
  assert.equal(
    kit.openNoteInSidebar({
      service: { features: ['other'], openFile: () => calls.push({ via: '不该走这条' }) },
      path: 'C:/kb/c.md',
      hostOpen: (path) => calls.push({ via: 'host', path }),
    }),
    'opened-via-host-prop',
  );
  assert.equal(calls[2].via, 'host');

  // ④ openFile 自己抛错 → 也落到宿主 prop，不把异常抛进 React
  assert.equal(
    kit.openNoteInSidebar({
      service: { features: ['openFile'], openFile: () => { throw new Error('boom'); } },
      scope: { sessionId: 's-1' },
      path: 'C:/kb/d.md',
      hostOpen: (path) => calls.push({ via: 'host', path }),
    }),
    'opened-via-host-prop',
  );

  // ⑤ 服务在但没有会话 / 服务整个缺席 / 空路径
  assert.equal(kit.openNoteInSidebar({ service: { features: ['openFile'], openFile: () => {} }, path: 'C:/kb/e.md' }), 'no-session');
  assert.equal(kit.openNoteInSidebar({ path: 'C:/kb/f.md' }), 'no-service');
  assert.equal(kit.openNoteInSidebar({ service: capable(), path: '   ' }), 'failed');
  return 'opened / opened(快照) / opened-via-host-prop(能力位) / opened-via-host-prop(抛错) / no-session / no-service / failed';
});

rmSync(tmp, { recursive: true, force: true });

process.stdout.write('\n@oblivion/panel selfcheck\n\n');
for (const [status, name, detail] of results) {
  process.stdout.write(status.padEnd(5) + ' ' + name + (detail ? '\n        ' + detail : '') + '\n');
}
process.stdout.write('\n' + results.length + ' 项，失败 ' + failed + '\n');
process.exitCode = failed === 0 ? 0 : 1;
