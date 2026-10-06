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
  JSON.stringify({ version: '0.1.5', mdRoot, stats: { turns: 4, evaluated: 3, noQa: 1, captured: 1, rejected: 2, captureRate: 0.333, byReason: { captured: 1, 'answer-too-short': 2 } }, hints: [] }),
  'utf8',
);
writeFileSync(
  join(dataRoot, 'decisions.jsonl'),
  [JSON.stringify({ at: 3, action: 'ignored', pass: false, reason: 'answer-too-short', ms: 1 })].join('\n') + '\n',
  'utf8',
);
writeFileSync(join(dataRoot, 'ts-9.json'), JSON.stringify({ id: 'ts-9', topic: 't', title: '自检条目', created_at: 9, status: 'active', version: 1, sources: [] }), 'utf8');
writeFileSync(join(mdRoot, '01_问答沉淀', 't.md'), '# 自检条目\n', 'utf8');

await check('产物存在且可 import', async () => {
  assert.ok(existsSync(lib), 'lib/index.js 不存在，先运行 build');
  assert.ok(existsSync(kitPath), 'lib/testkit.js 不存在，先运行 build');
  const mod = await import(pathToFileURL(lib).href);
  assert.equal(mod.name, '@oblivion/panel');
  return 'lib/index.js + lib/testkit.js';
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
  assert.equal(json.items.length, 1);
  assert.equal(json.notes.length, 1);
  return 'core v' + json.core.version + ' / 判定 ' + json.trace.recent.length + ' / 条目 ' + json.items.length + ' / 笔记 ' + json.notes.length;
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

rmSync(tmp, { recursive: true, force: true });

process.stdout.write('\n@oblivion/panel selfcheck\n\n');
for (const [status, name, detail] of results) {
  process.stdout.write(status.padEnd(5) + ' ' + name + (detail ? '\n        ' + detail : '') + '\n');
}
process.stdout.write('\n' + results.length + ' 项，失败 ' + failed + '\n');
process.exitCode = failed === 0 ? 0 : 1;
