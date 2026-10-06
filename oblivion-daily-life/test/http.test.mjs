/**
 * 有数（@oblivion/daily-life）· 数据面单测（测 lib/ 产物）。
 *
 * 两条路由（GET /daily-life/status、POST /daily-life/items）的行为表在这里被钉住：
 * 200 / 400 / 403 / 404 / 405 / 409 / 413，加上 `runAction` 的五个动作。
 * 路由用桩 `webServer` 注册，请求/响应用最小桩对象驱动 —— 不起真服务器、不开端口，
 * 于是 `node --test` 在任何机器上都能跑，也不会和其它插件抢 19387。
 */

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let kit;
let tmp;
const originalLog = console.log;
const logs = [];

before(async () => {
  kit = await import(pathToFileURL(join(ROOT, 'lib', 'testkit.js')).href);
  tmp = mkdtempSync(join(tmpdir(), 'oblivion-daily-life-http-'));
  // 自证据文件写到临时目录里，别污染真实 %TEMP%
  process.env.OBLIVION_DAILY_LIFE_EVIDENCE_DIR = join(tmp, 'evidence');
  console.log = (...args) => {
    logs.push(args.join(' '));
  };
});

after(() => {
  console.log = originalLog;
  delete process.env.OBLIVION_DAILY_LIFE_EVIDENCE_DIR;
  rmSync(tmp, { recursive: true, force: true });
});

/** 桩：收集注册的路由，记录 warn/info。 */
function mount(overrides = {}) {
  const routes = new Map();
  const warnings = [];
  const ctx = {
    inject: (_deps, callback) => {
      callback({ webServer: { register: (route) => routes.set(route.path, route) } });
      return undefined;
    },
    logger: { warn: (message) => warnings.push(String(message)), info: () => {} },
  };
  const dataFile = join(tmp, 'assets-' + Math.random().toString(36).slice(2, 8) + '.json');
  kit.apply(ctx, { dataFile, ...overrides });
  return { routes, warnings, dataFile };
}

function makeRequest(method, { headers = {}, payload = '' } = {}) {
  const listeners = new Map();
  const request = {
    method,
    headers,
    on(event, handler) {
      listeners.set(event, handler);
      return request;
    },
  };
  return {
    request,
    async fire() {
      if (payload !== '') listeners.get('data')?.(Buffer.from(payload, 'utf8'));
      listeners.get('end')?.();
    },
  };
}

function makeResponse() {
  const state = { status: 0, headers: {}, body: '' };
  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  const response = {
    writeHead(status, headers) {
      state.status = status;
      state.headers = headers ?? {};
      return response;
    },
    end(body) {
      state.body = typeof body === 'string' ? body : '';
      resolveDone();
      return response;
    },
  };
  return { response, state, done };
}

/** 打一次路由，返回 { status, headers, json }。 */
async function call(routes, path, method, options = {}) {
  const route = routes.get(path);
  assert.ok(route !== undefined, `路由 ${path} 没注册`);
  const { request, fire } = makeRequest(method, options);
  const { response, state, done } = makeResponse();
  route.handler(request, response);
  await fire();
  await done;
  let json = null;
  try {
    json = JSON.parse(state.body);
  } catch {
    json = null;
  }
  return { status: state.status, headers: state.headers, json, raw: state.body };
}

const STATUS = '/daily-life/status';
const ITEMS = '/daily-life/items';

describe('装载与留座', () => {
  it('注册两条路由 + 写自证据 + 打启动标记', () => {
    logs.length = 0;
    const { routes, dataFile } = mount();
    assert.deepEqual([...routes.keys()].sort(), [ITEMS, STATUS]);
    assert.ok(logs.includes('[oblivion-daily-life] loaded'), 'marker 必须与 dshx.yml 逐字相同');
    const evidence = JSON.parse(readFileSync(join(process.env.OBLIVION_DAILY_LIFE_EVIDENCE_DIR, 'host-mount.json'), 'utf8'));
    assert.equal(evidence.plugin, '@oblivion/daily-life');
    assert.equal(evidence.version, kit.VERSION);
    assert.ok(dataFile.length > 0);
  });

  it('VERSION 来自包根 VERSION（唯一真源）', () => {
    const fromFile = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
    assert.equal(kit.VERSION, fromFile);
  });

  it('没有 inject 的上下文只 warn 不抛（App 不该因此起不来）', () => {
    const warnings = [];
    assert.doesNotThrow(() =>
      kit.apply({ logger: { warn: (message) => warnings.push(String(message)) } }, { dataFile: join(tmp, 'x.json') }),
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /inject/);
  });

  it('webServer 缺席同样只 warn', () => {
    const warnings = [];
    kit.apply({ inject: (_deps, callback) => callback({}), logger: { warn: (message) => warnings.push(String(message)) } }, { dataFile: join(tmp, 'y.json') });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /webServer/);
  });
});

describe('GET /daily-life/status', () => {
  it('空账本 → 200，形状完整', async () => {
    const { routes, dataFile } = mount();
    const result = await call(routes, STATUS, 'GET');
    assert.equal(result.status, 200);
    assert.equal(result.json.ok, true);
    assert.equal(result.json.plugin, '@oblivion/daily-life');
    assert.equal(result.json.version, kit.VERSION);
    assert.deepEqual(result.json.items, []);
    assert.equal(result.json.stats.count, 0);
    assert.equal(result.json.stats.retentionRate, null);
    assert.equal(result.json.dataFile, dataFile);
    assert.equal(result.json.loadError, null);
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.match(String(result.json.generatedAt), /^\d{4}-\d{2}-\d{2}T/);
  });

  it('方法不对 → 405 且带 allow', async () => {
    const { routes } = mount();
    const result = await call(routes, STATUS, 'POST');
    assert.equal(result.status, 405);
    assert.equal(result.headers.allow, 'GET');
  });

  it('跨源 → 403', async () => {
    const { routes } = mount();
    const result = await call(routes, STATUS, 'GET', { headers: { origin: 'https://evil.example', host: '127.0.0.1:19387' } });
    assert.equal(result.status, 403);
  });

  it('同源 Origin 放行', async () => {
    const { routes } = mount();
    const result = await call(routes, STATUS, 'GET', { headers: { origin: 'http://127.0.0.1:19387', host: '127.0.0.1:19387' } });
    assert.equal(result.status, 200);
  });
});

describe('POST /daily-life/items', () => {
  const draft = { name: '手机 17 Pro Max', buyPrice: 8999, buyDate: '2023-02-11', category: '数码' };

  it('add → 200，条目带着派生指标回来', async () => {
    const { routes } = mount();
    const added = await call(routes, ITEMS, 'POST', { payload: JSON.stringify({ action: 'add', item: draft }) });
    assert.equal(added.status, 200);
    assert.equal(added.json.ok, true);
    assert.match(added.json.item.id, /^dl-/);
    assert.equal(added.json.item.name, draft.name);
    assert.ok(added.json.item.derived.holdingDays > 900, '这条参考截图用了 908 天');
    assert.ok(added.json.item.derived.dailyCost > 0);

    const status = await call(routes, STATUS, 'GET');
    assert.equal(status.json.items.length, 1);
    assert.equal(status.json.stats.count, 1);
  });

  it('校验没过 → 400 + errors，且账本没被改', async () => {
    const { routes } = mount();
    const bad = await call(routes, ITEMS, 'POST', { payload: JSON.stringify({ action: 'add', item: { name: '', buyPrice: -1 } }) });
    assert.equal(bad.status, 400);
    assert.ok(Array.isArray(bad.json.errors) && bad.json.errors.length >= 3);
    const status = await call(routes, STATUS, 'GET');
    assert.equal(status.json.items.length, 0);
  });

  it('请求体不是 JSON → 400', async () => {
    const { routes } = mount();
    const result = await call(routes, ITEMS, 'POST', { payload: '{ 这不是 JSON' });
    assert.equal(result.status, 400);
    assert.equal(result.json.error, 'invalid json');
  });

  it('请求体超 128 KiB → 413', async () => {
    const { routes } = mount();
    const result = await call(routes, ITEMS, 'POST', { payload: 'x'.repeat(129 * 1024) });
    assert.equal(result.status, 413);
  });

  it('未知动作 → 400 且列出允许的动作', async () => {
    const { routes } = mount();
    const result = await call(routes, ITEMS, 'POST', { payload: JSON.stringify({ action: 'destroy', id: 'dl-a-aa' }) });
    assert.equal(result.status, 400);
    assert.deepEqual(result.json.allowed, ['add', 'update', 'sell', 'use', 'remove']);
  });

  it('方法不对 → 405 且带 allow: POST', async () => {
    const { routes } = mount();
    const result = await call(routes, ITEMS, 'GET');
    assert.equal(result.status, 405);
    assert.equal(result.headers.allow, 'POST');
  });

  it('跨源 → 403', async () => {
    const { routes } = mount();
    const result = await call(routes, ITEMS, 'POST', {
      headers: { origin: 'https://evil.example', host: '127.0.0.1:19387' },
      payload: JSON.stringify({ action: 'add', item: draft }),
    });
    assert.equal(result.status, 403);
  });

  it('id 不存在 → 404', async () => {
    const { routes } = mount();
    for (const action of ['update', 'sell', 'remove']) {
      const result = await call(routes, ITEMS, 'POST', { payload: JSON.stringify({ action, id: 'dl-none-aa', item: { name: 'x' } }) });
      assert.equal(result.status, 404, action);
    }
  });

  it('remove 的 id 形状不对 → 400（不把任意字符串当键）', async () => {
    const { routes } = mount();
    const result = await call(routes, ITEMS, 'POST', { payload: JSON.stringify({ action: 'remove', id: '../../etc/passwd' }) });
    assert.equal(result.status, 400);
  });

  it('超过 maxItems → 409', async () => {
    const { routes } = mount({ maxItems: 1 });
    const first = await call(routes, ITEMS, 'POST', { payload: JSON.stringify({ action: 'add', item: draft }) });
    assert.equal(first.status, 200);
    const second = await call(routes, ITEMS, 'POST', { payload: JSON.stringify({ action: 'add', item: { ...draft, name: '第二件' } }) });
    assert.equal(second.status, 409);
    assert.equal(second.json.maxItems, 1);
  });

  it('add 不带 item → 400', async () => {
    const { routes } = mount();
    const result = await call(routes, ITEMS, 'POST', { payload: JSON.stringify({ action: 'add' }) });
    assert.equal(result.status, 400);
  });
});

describe('runAction：五个动作的语义', () => {
  function freshStore(name) {
    return kit.createLedgerStore(join(tmp, name));
  }
  const options = { idleWarnDays: 90, maxItems: 100 };
  const draft = { name: '耳机', buyPrice: 1000, buyDate: '2025-01-01' };

  it('add → update → sell → use → remove 走一圈', async () => {
    const store = freshStore('actions.json');

    const added = await kit.runAction(store, { action: 'add', item: draft }, { ...options, now: kit.parseDay('2025-01-10') });
    assert.equal(added.status, 200);
    const id = added.payload.item.id;

    // update 只传要改的字段，其余沿用（局部合并）
    const updated = await kit.runAction(store, { action: 'update', item: { id, note: '降噪很好' } }, { ...options, now: kit.parseDay('2025-01-10') });
    assert.equal(updated.status, 200);
    assert.equal(updated.payload.item.note, '降噪很好');
    assert.equal(updated.payload.item.buyPrice, 1000, '没传的字段必须沿用原值');
    assert.equal(updated.payload.item.name, '耳机');

    // use 递增 useCount 并把 lastUsedAt 推到今天
    const used = await kit.runAction(store, { action: 'use', id }, { ...options, now: kit.parseDay('2025-01-20') });
    assert.equal(used.status, 200);
    assert.equal(used.payload.item.useCount, 1);
    assert.equal(used.payload.item.lastUsedAt, '2025-01-20');
    const usedAgain = await kit.runAction(store, { action: 'use', id }, { ...options, now: kit.parseDay('2025-01-25') });
    assert.equal(usedAgain.payload.item.useCount, 2);

    // sell 未给 soldDate → 用「今天」
    const sold = await kit.runAction(store, { action: 'sell', id, item: { soldPrice: 600 } }, { ...options, now: kit.parseDay('2025-03-01') });
    assert.equal(sold.status, 200);
    assert.equal(sold.payload.item.soldDate, '2025-03-01');
    assert.equal(sold.payload.item.derived.status, 'sold');
    assert.equal(sold.payload.item.derived.retentionRate, 0.6);

    // remove 之后账本空
    const removed = await kit.runAction(store, { action: 'remove', id }, options);
    assert.equal(removed.status, 200);
    assert.equal(removed.payload.count, 0);
    assert.equal((await store.load()).items.length, 0);
  });

  it('sell 不给 soldPrice → 400（卖多少钱是必填的）', async () => {
    const store = freshStore('sell.json');
    const added = await kit.runAction(store, { action: 'add', item: draft }, { ...options, now: kit.parseDay('2025-01-10') });
    const id = added.payload.item.id;
    const result = await kit.runAction(store, { action: 'sell', id }, options);
    assert.equal(result.status, 400);
    assert.match(result.payload.errors.join('|'), /soldPrice/);
  });

  it('use 会把非法日期挡住（借道同一套校验）', async () => {
    const store = freshStore('use-bad.json');
    const added = await kit.runAction(store, { action: 'add', item: draft }, { ...options, now: kit.parseDay('2025-01-10') });
    const id = added.payload.item.id;
    const result = await kit.runAction(store, { action: 'use', id, lastUsedAt: '2025-13-40' }, { ...options, now: kit.parseDay('2025-01-10') });
    assert.equal(result.status, 400);
  });

  it('坏账本也能继续写：残骸留底 + loadError 透传到响应', async () => {
    const file = join(tmp, 'broken-write.json');
    const store = kit.createLedgerStore(file);
    writeFileSync(file, 'not json at all', 'utf8');
    const result = await kit.runAction(store, { action: 'add', item: draft }, { ...options, now: kit.parseDay('2025-01-10') });
    assert.equal(result.status, 200, '坏文件不该让写入路径瘫掉');
    assert.match(String(result.payload.loadError), /corrupt-/);
  });
});

describe('isSameOrigin', () => {
  it('没有 Origin → 放行（同进程 / curl 场景）', () => {
    assert.equal(kit.isSameOrigin({ headers: {} }), true);
  });

  it('Origin 的 host 与 Host 一致 → 放行', () => {
    assert.equal(kit.isSameOrigin({ headers: { origin: 'http://127.0.0.1:19387', host: '127.0.0.1:19387' } }), true);
  });

  it('不一致 / 缺 Host / Origin 是垃圾 → 拒绝', () => {
    assert.equal(kit.isSameOrigin({ headers: { origin: 'http://evil.example', host: '127.0.0.1:19387' } }), false);
    assert.equal(kit.isSameOrigin({ headers: { origin: 'http://127.0.0.1:19387' } }), false);
    assert.equal(kit.isSameOrigin({ headers: { origin: 'not-a-url', host: '127.0.0.1:19387' } }), false);
  });
});

describe('buildState', () => {
  it('装配出行 + 汇总，并透传 dataFile / loadError / skipped', () => {
    const today = kit.parseDay('2025-06-01');
    const state = kit.buildState(
      [
        {
          id: 'dl-a-aa',
          name: '相机',
          buyPrice: 5000,
          buyDate: '2024-06-01',
          category: '数码',
          serviceDaysTarget: null,
          soldDate: null,
          soldPrice: null,
          lastUsedAt: '2025-05-30',
          useCount: 3,
          note: null,
          imagePath: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      today,
      { idleWarnDays: 90 },
      { dataFile: 'C:/x/assets.json', loadError: null, skipped: 2 },
    );
    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].derived.status, 'serving');
    assert.equal(state.stats.servingValue, 5000);
    assert.equal(state.dataFile, 'C:/x/assets.json');
    assert.equal(state.skipped, 2);
  });
});
