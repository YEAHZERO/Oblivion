/**
 * @oblivion/vimc — 宿主半边（Node）测试。
 *
 * 覆盖：启动标记、自证据文件、`provide` 服务身份、诊断路由的
 * 方法/来源/JSON 校验与落盘汇总，以及「webServer 不在场」时不抛错。
 *
 * ⚠️ 证据目录必须重定向到沙箱：真实 Host 也会往默认目录写同名文件，
 * 不隔离就会「跑一次测试把线上证据覆盖掉」（实测踩过）。
 *
 * 运行：`npm test`
 */

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const EVIDENCE_DIR = join(tmpdir(), 'oblivion-vimc-tests');
process.env.OBLIVION_VIMC_EVIDENCE_DIR = EVIDENCE_DIR;

const host = await import('../lib/index.js');

/** 版本断言跟随 package.json，避免每次 bump 都要改测试。 */
const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const MOUNT_FILE = join(EVIDENCE_DIR, 'host-mount.json');
const BEAT_FILE = join(EVIDENCE_DIR, 'client-beat.json');

const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * 心跳落盘走合并窗口（750ms 尾写）：测试要**等条件满足**再断言，而不是立刻读。
 * @param check 判定函数。
 */
async function waitForBeat(check, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  let value = null;
  while (Date.now() < deadline) {
    if (existsSync(BEAT_FILE)) {
      try {
        value = JSON.parse(readFileSync(BEAT_FILE, 'utf8'));
        if (check(value)) return value;
      } catch {
        /* 正在写：重试 */
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return value;
}

/** 用假上下文挂载宿主半边，收集它注册的路由与 provide。 */
function mountHost({ withWebServer = true } = {}) {
  const routes = [];
  // 路由的 dispose 记录在**另一个**数组里：往被遍历的数组里 push 会让循环
  // 多访问一个非函数元素（第一版就是这么踩的）。
  const routeDisposals = [];
  const provided = new Map();
  const logs = [];
  const warnings = [];
  const disposers = [];
  const ctx = {
    inject: (_deps, callback) => {
      callback(withWebServer ? { webServer: { register: (route) => { routes.push(route); return () => routeDisposals.push(route.path); } } } : {});
    },
    effect: (callback) => {
      const dispose = callback();
      if (typeof dispose === 'function') disposers.push(dispose);
    },
    logger: () => ({ info: (message) => logs.push(message), warn: (message) => warnings.push(message) }),
    provide: (name, value) => {
      provided.set(name, value);
      return () => undefined;
    },
  };
  const printed = [];
  const original = console.log;
  console.log = (message) => printed.push(String(message));
  try {
    host.apply(ctx);
  } finally {
    console.log = original;
  }
  return { routes, routeDisposals, provided, logs, warnings, printed, disposers };
}

function fakeResponse() {
  const state = { status: 0, headers: null, body: '' };
  return {
    state,
    writeHead(status, headers) {
      state.status = status;
      state.headers = headers ?? null;
      return this;
    },
    end(body) {
      state.body = body ?? '';
      return this;
    },
  };
}

function fakeRequest({ method = 'POST', headers = {}, body } = {}) {
  const request = new EventEmitter();
  request.method = method;
  request.headers = headers;
  return {
    request,
    send: async () => {
      if (body !== undefined) request.emit('data', Buffer.from(body));
      request.emit('end');
      await settle();
    },
  };
}

test('apply 写出启动标记与自证据文件，并注册诊断路由', () => {
  rmSync(MOUNT_FILE, { force: true });
  const mounted = mountHost();

  assert.ok(mounted.printed.includes('[oblivion-vimc] loaded'), 'dshx.yml 的 marker 必须逐字出现');
  assert.ok(existsSync(MOUNT_FILE), 'host-mount.json 应当落盘');

  const evidence = JSON.parse(readFileSync(MOUNT_FILE, 'utf8'));
  assert.equal(evidence.plugin, '@oblivion/vimc');
  assert.equal(evidence.version, PACKAGE_VERSION);
  assert.equal(evidence.pid, process.pid);
  assert.equal(evidence.beatPath, '/oblivion-vimc/beat');

  assert.equal(mounted.routes.length, 1);
  assert.equal(mounted.routes[0].kind, 'exact');
  assert.equal(mounted.routes[0].path, '/oblivion-vimc/beat');

  assert.ok(mounted.provided.has('oblivionVimc'), '应当 provide 一个可检出身份');
  assert.equal(mounted.provided.get('oblivionVimc').version, PACKAGE_VERSION);
  assert.ok(mounted.logs.some((line) => line.includes('诊断路由已挂载')));
});

test('诊断路由：方法与来源校验，合法请求落盘汇总', async () => {
  rmSync(BEAT_FILE, { force: true });
  const mounted = mountHost();
  const route = mounted.routes[0];

  // ① 非 POST → 405
  const wrongMethod = fakeResponse();
  const get = fakeRequest({ method: 'GET' });
  route.handler(get.request, wrongMethod);
  await get.send();
  assert.equal(wrongMethod.state.status, 405);
  assert.equal(wrongMethod.state.headers.allow, 'POST');

  // ② 外部来源 → 403
  const untrusted = fakeResponse();
  const evil = fakeRequest({ headers: { origin: 'https://example.com' }, body: '{}' });
  route.handler(evil.request, untrusted);
  await evil.send();
  assert.equal(untrusted.state.status, 403);

  // ③ 坏 JSON → 400
  const broken = fakeResponse();
  const notJson = fakeRequest({ body: '{not json' });
  route.handler(notJson.request, broken);
  await notJson.send();
  assert.equal(broken.state.status, 400);

  // ④ 桌面端转发会删掉 Origin：缺省视为可信
  const accepted = fakeResponse();
  const first = fakeRequest({ body: JSON.stringify({ command: 'mounted', version: PACKAGE_VERSION, userAgent: 'happy-dom' }) });
  route.handler(first.request, accepted);
  await first.send();
  assert.equal(accepted.state.status, 200);
  assert.deepEqual(JSON.parse(accepted.state.body), { ok: true, count: 1 });

  const second = fakeResponse();
  const next = fakeRequest({ body: JSON.stringify({ command: 'scrollPageDown', version: PACKAGE_VERSION }) });
  route.handler(next.request, second);
  await next.send();
  assert.equal(second.state.status, 200);

  const beat = await waitForBeat((value) => value.count === 2);
  assert.ok(beat !== null, '心跳应当落盘（合并窗口后）');
  assert.equal(beat.plugin, '@oblivion/vimc');
  assert.equal(beat.count, 2);
  assert.equal(beat.lastCommand, 'scrollPageDown');
  assert.deepEqual(beat.commands, { mounted: 1, scrollPageDown: 1 });
  assert.equal(beat.userAgent, 'happy-dom');
  assert.equal(beat.clientVersion, PACKAGE_VERSION);
});

test('request body 超过上限时明确拒绝（不落盘脏数据）', async () => {
  const mounted = mountHost();
  const route = mounted.routes[0];

  // 先打一条正常心跳，让「上一条命令」有明确的值可比对。
  const baseline = fakeResponse();
  const good = fakeRequest({ body: JSON.stringify({ command: 'mounted' }) });
  route.handler(good.request, baseline);
  await good.send();
  assert.equal(baseline.state.status, 200);
  const before = await waitForBeat((value) => value.lastCommand === 'mounted');
  assert.ok(before !== null, '基线心跳应当落盘');

  const response = fakeResponse();
  const huge = fakeRequest({ body: JSON.stringify({ command: `huge-${'x'.repeat(9000)}` }) });
  route.handler(huge.request, response);
  await huge.send();
  assert.equal(response.state.status, 413);
  assert.equal(JSON.parse(response.state.body).error, 'body too large');

  const after = JSON.parse(readFileSync(BEAT_FILE, 'utf8'));
  assert.equal(after.lastCommand, before.lastCommand, '超限请求不得改写 lastCommand');
  assert.equal(after.count, before.count, '超限请求不得计数');
});

test('卸载时写出卸载自证（等价 dshx 的 cleanup proved）', () => {
  rmSync(join(EVIDENCE_DIR, 'host-unmount.json'), { force: true });
  const mounted = mountHost();
  assert.equal(mounted.disposers.length, 2, '诊断路由 + 卸载自证各注册一个 disposer');

  for (const dispose of [...mounted.disposers].reverse()) dispose();

  assert.deepEqual(mounted.routeDisposals, ['/oblivion-vimc/beat'], '诊断路由被摘掉');
  assert.ok(existsSync(join(EVIDENCE_DIR, 'host-unmount.json')), 'unmount 自证应当落盘');
  const evidence = JSON.parse(readFileSync(join(EVIDENCE_DIR, 'host-unmount.json'), 'utf8'));
  assert.equal(evidence.plugin, '@oblivion/vimc');
  assert.equal(evidence.pid, process.pid);
});

test('webServer 不在场时不抛错，只记警告', () => {
  const mounted = mountHost({ withWebServer: false });
  assert.equal(mounted.routes.length, 0);
  assert.ok(mounted.warnings.some((line) => line.includes('webServer 不可用')));
  assert.ok(mounted.printed.includes('[oblivion-vimc] loaded'));
});
