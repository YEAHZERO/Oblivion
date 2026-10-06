/**
 * 有数（@oblivion/daily-life）· 自检（`node scripts/selfcheck.mjs`）。
 *
 * 与 `test/*.test.mjs` 的分工：单测逐个钉行为细节，自检回答**「这一版能不能装、能不能用」**
 * —— 清单齐全吗、版本一致吗、口径对不对、两条路由的行为表对不对、降级路径会不会把
 * 整个插件拖崩。根 `pnpm run check` 会通过 `tools/run-selfcheck.ps1` 自动发现并执行它。
 *
 * 所有跑完即删的现场都在 `mkdtempSync(tmpdir())` 里，不碰 `~/.oblivion/daily-life/`。
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const LIB = join(ROOT, 'lib');
const tmp = mkdtempSync(join(tmpdir(), 'oblivion-daily-life-selfcheck-'));
process.env.OBLIVION_DAILY_LIFE_EVIDENCE_DIR = join(tmp, 'evidence');

const results = [];
let failed = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail === undefined ? '' : String(detail) });
  } catch (error) {
    failed += 1;
    results.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
  }
}

const kit = await import(pathToFileURL(join(LIB, 'testkit.js')).href);
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const manifest = readFileSync(join(ROOT, 'dshx.yml'), 'utf8');
const hostSource = readFileSync(join(ROOT, 'src', 'index.ts'), 'utf8');
const clientSource = readFileSync(join(ROOT, 'src', 'client', 'index.ts'), 'utf8');
const patchText = readFileSync(join(ROOT, 'dsh.bundle.patch.yml'), 'utf8');
const clientBundle = readFileSync(join(LIB, 'client.js'), 'utf8');

// ───────────────────────── 桩件（HTTP 自检用，与 test/http.test.mjs 同形）─────

function mount(config = {}) {
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
  kit.apply(ctx, { dataFile, ...config });
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
  return { status: state.status, headers: state.headers, json };
}

const STATUS_PATH = '/daily-life/status';
const ITEMS_PATH = '/daily-life/items';

/** 一条测试用记录。 */
function item(overrides = {}) {
  return {
    id: 'dl-check0-ab',
    name: '17 Pro Max',
    buyPrice: 8999,
    buyDate: '2023-02-11',
    category: '数码',
    serviceDaysTarget: null,
    soldDate: null,
    soldPrice: null,
    lastUsedAt: null,
    useCount: null,
    note: null,
    imagePath: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

// ───────────────────────── 清单与工程约定 ─────────────────────────

await check('package.json 包名 / dshx id / 目录名一致', () => {
  assert.equal(pkg.name, '@oblivion/daily-life');
  assert.match(manifest, new RegExp(`^id: '${pkg.name.replace(/[/@]/g, (ch) => '\\' + ch)}'$`, 'm'));
  return pkg.name;
});

await check('版本三处一致（VERSION = package.json = 运行时 VERSION）', () => {
  const fromFile = readFileSync(join(ROOT, 'VERSION'), 'utf8').trim();
  assert.equal(fromFile, pkg.version);
  assert.equal(kit.VERSION, pkg.version);
  return 'v' + pkg.version;
});

await check('marker 与源码 console.log 逐字相同', () => {
  const marker = /^marker:\s*"(.*)"$/m.exec(manifest)?.[1];
  assert.equal(marker, '[oblivion-daily-life] loaded');
  assert.ok(hostSource.includes(`console.log('${marker}')`), 'Node 半边少了启动标记');
  assert.ok(clientSource.includes(`console.log('${marker}')`), '浏览器半边少了启动标记');
  return marker;
});

await check('bundle 补丁自挂且指向存在的文件', () => {
  assert.equal(pkg.dsh.bundle.patch, './dsh.bundle.patch.yml');
  assert.ok(existsSync(join(ROOT, 'dsh.bundle.patch.yml')));
  assert.match(patchText, /- id: '@oblivion\/daily-life'/);
  return './dsh.bundle.patch.yml';
});

await check('dsh.compat 声明完整（宿主区间 + requires 四项）', () => {
  assert.equal(pkg.dsh.compat.host, '>=0.2.0-rc.2 <0.3.0');
  assert.deepEqual(pkg.dsh.compat.requires.slots, ['sidebar.footer.action']);
  assert.deepEqual(pkg.dsh.compat.requires.services, ['webServer']);
  assert.deepEqual(pkg.dsh.compat.requires.npmPackages, ['dsh-better-sidebar']);
  assert.deepEqual(pkg.dsh.compat.requires.clientContract, ['__ModuleLoader__']);
  return pkg.dsh.compat.host;
});

await check('不写 lib/VERSION（Assert-NoLibVersion 口径）', () => {
  assert.equal(existsSync(join(LIB, 'VERSION')), false);
  return 'lib/ 里没有 VERSION';
});

await check('三件产物齐全，浏览器半边是完整的模块壳', () => {
  for (const name of ['index.js', 'testkit.js', 'client.js']) {
    assert.ok(existsSync(join(LIB, name)), `缺 lib/${name}`);
    assert.ok(statSync(join(LIB, name)).size > 0, `lib/${name} 是空文件`);
  }
  assert.match(clientBundle, /__ModuleLoader__\.load\(/);
  assert.ok(clientBundle.includes('@oblivion/daily-life'), '模块壳里的 id 不对');
  assert.match(clientBundle, /require\(['"]react['"]\)/, 'react 必须是 external（不能被 bundle 进去）');
  return 'lib/index.js + lib/testkit.js + lib/client.js (' + String(clientBundle.length) + ' B)';
});

await check('默认配置：单文件账本 + 两条路由 + 上限', () => {
  assert.equal(kit.DEFAULT_CONFIG.dataFile, '~/.oblivion/daily-life/assets.json');
  assert.equal(kit.DEFAULT_CONFIG.statusPath, STATUS_PATH);
  assert.equal(kit.DEFAULT_CONFIG.itemsPath, ITEMS_PATH);
  assert.equal(kit.DEFAULT_CONFIG.maxItems, 2000);
  assert.equal(kit.DEFAULT_CONFIG.idleWarnDays, kit.IDLE_WARN_DAYS);
  assert.equal(kit.expandHome('~/.oblivion/daily-life/assets.json'), join(homedir(), '.oblivion', 'daily-life', 'assets.json'));
  return kit.DEFAULT_CONFIG.dataFile;
});

// ───────────────────────── 口径 ─────────────────────────

await check('口径：持有天数含首日、最小 1 天', () => {
  const today = kit.parseDay('2023-02-11');
  assert.equal(kit.deriveItem(item({ buyDate: '2023-02-11' }), today).holdingDays, 1);
  assert.equal(kit.deriveItem(item({ buyDate: '2023-02-10' }), today).holdingDays, 2);
  return '当天买入 = 1 天';
});

await check('口径：金额 HALF_UP 到 2 位（1.005 → 1.01）', () => {
  assert.equal(kit.roundMoney(1.005), 1.01);
  assert.equal(kit.roundMoney(0.005), 0.01);
  assert.equal(kit.roundMoney(2.675), 2.68);
  return '边界三位都钉住';
});

await check('口径：参考截图那条账（¥8999 / 908 天 → ¥9.9/天）', () => {
  const today = kit.parseDay('2025-08-07');
  const derived = kit.deriveItem(item({ buyDate: '2023-02-11' }), today);
  assert.equal(derived.holdingDays, 909);
  assert.equal(kit.roundMoney((8999 - 0) / 908), 9.91);
  assert.ok(derived.dailyCost > 9 && derived.dailyCost < 10);
  return '¥' + String(derived.dailyCost) + '/天（' + String(derived.holdingDays) + ' 天）';
});

await check('口径：保值率只对已卖出给数字，否则 null', () => {
  assert.equal(kit.deriveItem(item(), kit.parseDay('2025-08-07')).retentionRate, null);
  const sold = kit.deriveItem(item({ soldDate: '2025-01-01', soldPrice: 4499.5 }), kit.parseDay('2025-08-07'));
  assert.equal(sold.retentionRate, 0.5);
  assert.equal(sold.status, 'sold');
  return 'sold 时 0.5';
});

await check('口径：闲置阈值集中在常量里（UI 不写字面量）', () => {
  assert.equal(kit.IDLE_WARN_DAYS, 90);
  const today = kit.parseDay('2025-08-07');
  assert.equal(kit.deriveItem(item({ buyDate: '2025-01-01', lastUsedAt: '2025-05-09' }), today).status, 'idle');
  assert.equal(kit.deriveItem(item({ buyDate: '2025-01-01', lastUsedAt: '2025-05-10' }), today).status, 'serving');
  return String(kit.IDLE_WARN_DAYS) + ' 天';
});

await check('校验：必填三项 + soldDate/soldPrice 成对 + 可空归一 null', () => {
  const today = kit.parseDay('2025-08-07');
  assert.equal(kit.validateItem({}, today).errors.length, 3);
  assert.equal(kit.validateItem({ name: 'x', buyPrice: 1, buyDate: '2025-01-01', soldDate: '2025-02-01' }, today).ok, false);
  const normalized = kit.validateItem({ name: 'x', buyPrice: 1, buyDate: '2025-01-01', note: '', category: ' ' }, today);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.note, null);
  assert.equal(normalized.value.category, null);
  return '不落脏数据、不留空串';
});

// ───────────────────────── 存储 ─────────────────────────

await check('存储：文件不存在 = 空账本（不是错误）', async () => {
  const store = kit.createLedgerStore(join(tmp, 'missing.json'));
  assert.deepEqual(await store.load(), { items: [], loadError: null, skipped: 0 });
  return '空账本';
});

await check('存储：坏 JSON → 残骸留底 + loadError，绝不覆盖', async () => {
  const file = join(tmp, 'broken.json');
  writeFileSync(file, '{ 坏掉了', 'utf8');
  const result = await kit.createLedgerStore(file).load();
  assert.match(String(result.loadError), /corrupt-/);
  assert.equal(existsSync(file), false);
  return '留底为 *.corrupt-*';
});

await check('存储：原子写不留 .tmp 残渣', async () => {
  const dir = join(tmp, 'atomic');
  await kit.writeTextAtomic(join(dir, 'assets.json'), '{}\n');
  assert.deepEqual(readdirSync(dir).filter((entry) => entry.endsWith('.tmp')), []);
  return 'rename 路径干净';
});

// ───────────────────────── HTTP 行为表 ─────────────────────────

await check('HTTP：注册两条路由 + 写自证据 + 启动标记', () => {
  const { routes } = mount();
  assert.deepEqual([...routes.keys()].sort(), [ITEMS_PATH, STATUS_PATH]);
  const evidence = JSON.parse(readFileSync(join(process.env.OBLIVION_DAILY_LIFE_EVIDENCE_DIR, 'host-mount.json'), 'utf8'));
  assert.equal(evidence.plugin, '@oblivion/daily-life');
  assert.equal(evidence.version, pkg.version);
  return 'GET ' + STATUS_PATH + ' / POST ' + ITEMS_PATH;
});

await check('HTTP：GET status 空账本 → 200 且形状完整', async () => {
  const { routes, dataFile } = mount();
  const result = await call(routes, STATUS_PATH, 'GET');
  assert.equal(result.status, 200);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.plugin, '@oblivion/daily-life');
  assert.equal(result.json.version, pkg.version);
  assert.deepEqual(result.json.items, []);
  assert.equal(result.json.stats.count, 0);
  assert.equal(result.json.dataFile, dataFile);
  assert.equal(result.headers['cache-control'], 'no-store');
  return '200 / no-store';
});

await check('HTTP：405 带 allow、403 跨源、400 坏 JSON、413 超大', async () => {
  const { routes } = mount();
  const method = await call(routes, STATUS_PATH, 'POST');
  assert.equal(method.status, 405);
  assert.equal(method.headers.allow, 'GET');
  const cross = await call(routes, STATUS_PATH, 'GET', { headers: { origin: 'https://evil.example', host: '127.0.0.1:19387' } });
  assert.equal(cross.status, 403);
  const badJson = await call(routes, ITEMS_PATH, 'POST', { payload: '不是 JSON' });
  assert.equal(badJson.status, 400);
  const tooBig = await call(routes, ITEMS_PATH, 'POST', { payload: 'x'.repeat(129 * 1024) });
  assert.equal(tooBig.status, 413);
  return '405 / 403 / 400 / 413';
});

await check('HTTP：写一圈 add → update → use → sell → remove', async () => {
  const { routes } = mount();
  const added = await call(routes, ITEMS_PATH, 'POST', {
    payload: JSON.stringify({ action: 'add', item: { name: '17 Pro Max', buyPrice: 8999, buyDate: '2023-02-11', category: '数码' } }),
  });
  assert.equal(added.status, 200);
  const id = added.json.item.id;
  assert.match(id, /^dl-/);

  const updated = await call(routes, ITEMS_PATH, 'POST', { payload: JSON.stringify({ action: 'update', item: { id, note: '主力机' } }) });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.item.buyPrice, 8999, '没传的字段沿用原值');

  const used = await call(routes, ITEMS_PATH, 'POST', { payload: JSON.stringify({ action: 'use', id }) });
  assert.equal(used.status, 200);
  assert.equal(used.json.item.useCount, 1);

  const sold = await call(routes, ITEMS_PATH, 'POST', { payload: JSON.stringify({ action: 'sell', id, item: { soldPrice: 4000 } }) });
  assert.equal(sold.status, 200);
  assert.equal(sold.json.item.derived.status, 'sold');
  // 保值率是比率（不做金额圆整），比较时过一遍 roundMoney 只取到 2 位
  assert.equal(kit.roundMoney(sold.json.item.derived.retentionRate), 0.44);

  const status = await call(routes, STATUS_PATH, 'GET');
  assert.equal(status.json.items.length, 1);
  assert.equal(status.json.stats.soldCount, 1);

  const removed = await call(routes, ITEMS_PATH, 'POST', { payload: JSON.stringify({ action: 'remove', id }) });
  assert.equal(removed.status, 200);
  assert.equal((await call(routes, STATUS_PATH, 'GET')).json.items.length, 0);
  return '五个动作都通';
});

await check('HTTP：404 找不到 / 400 校验没过 / 409 超上限', async () => {
  const { routes } = mount({ maxItems: 1 });
  const missing = await call(routes, ITEMS_PATH, 'POST', { payload: JSON.stringify({ action: 'remove', id: 'dl-none-aa' }) });
  assert.equal(missing.status, 404);
  const invalid = await call(routes, ITEMS_PATH, 'POST', { payload: JSON.stringify({ action: 'add', item: { name: '', buyPrice: -1 } }) });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.json.errors.length >= 3);
  await call(routes, ITEMS_PATH, 'POST', { payload: JSON.stringify({ action: 'add', item: { name: 'a', buyPrice: 1, buyDate: '2025-01-01' } }) });
  const full = await call(routes, ITEMS_PATH, 'POST', { payload: JSON.stringify({ action: 'add', item: { name: 'b', buyPrice: 1, buyDate: '2025-01-01' } }) });
  assert.equal(full.status, 409);
  return '404 / 400 / 409';
});

// ───────────────────────── 降级路径 ─────────────────────────

await check('降级：没有 inject / 没有 webServer 都只 warn，不抛', () => {
  const warnings = [];
  const logger = { warn: (message) => warnings.push(String(message)) };
  assert.doesNotThrow(() => kit.apply({ logger }, { dataFile: join(tmp, 'a.json') }));
  assert.doesNotThrow(() => kit.apply({ inject: (_deps, callback) => callback({}), logger }, { dataFile: join(tmp, 'b.json') }));
  assert.equal(warnings.length, 2);
  return '两次 warn，App 照常起';
});

await check('降级：better-sidebar 缺席 → no-service；registerTab 抛错 → failed', () => {
  const component = () => null;
  const warnings = [];
  const noService = kit.registerDailyLifeTab({ inject: (_deps, callback) => callback({}) }, component, (message) => warnings.push(message));
  assert.equal(noService.status, 'no-service');
  const failed = kit.registerDailyLifeTab(
    {
      inject: (_deps, callback) =>
        callback({
          betterSidebar: {
            registerTab: () => {
              throw new Error('boom');
            },
          },
        }),
    },
    component,
    (message) => warnings.push(message),
  );
  assert.equal(failed.status, 'failed');
  return 'no-service / failed';
});

await check('降级：结果对象在注入回调里就地改写（不换引用）', () => {
  let callbackRef;
  const result = kit.registerDailyLifeTab({ inject: (_deps, callback) => { callbackRef = callback; return undefined; } }, () => null, () => undefined);
  assert.equal(result.status, 'no-service');
  callbackRef({ betterSidebar: { registerTab: () => () => undefined } });
  assert.equal(result.status, 'registered');
  return '同一对象从 no-service 变 registered';
});

await check('浏览器半边：tab 描述符与 KPI 三格', () => {
  const descriptor = kit.dailyLifeDescriptor(() => null);
  assert.equal(descriptor.id, kit.DAILY_LIFE_TAB_ID);
  assert.equal(descriptor.title(), '有数');
  const stats = kit.summarize([kit.rowOf(item(), kit.parseDay('2025-08-07'))], {});
  const cells = kit.kpiRow(stats);
  assert.equal(cells.length, 3);
  assert.match(cells[0].value, /^¥/);
  assert.equal(kit.money(null), '—');
  assert.equal(kit.moneyPerDay(null), '—');
  return cells.map((cell) => cell.label).join(' / ');
});

await check('README 有「本版不做」与「与参考项目的差异」两节', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /本版不做/);
  assert.match(readme, /与参考项目/);
  assert.match(readme, /youshu-master/);
  return '两节都在';
});

rmSync(tmp, { recursive: true, force: true });

// ───────────────────────── 输出 ─────────────────────────

const width = Math.max(...results.map((entry) => entry.name.length));
for (const entry of results) {
  const mark = entry.ok ? 'PASS' : 'FAIL';
  const detail = entry.detail === '' ? '' : '  ' + entry.detail;
  console.log(`${mark}  ${entry.name.padEnd(width)}${detail}`);
}
console.log(`\n${String(results.length)} 项，失败 ${String(failed)}`);
process.exitCode = failed === 0 ? 0 : 1;
