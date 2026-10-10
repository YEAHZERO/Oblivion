#!/usr/bin/env node
/**
 * @oblivion/http-bridge 自检。
 *
 * ## 0.1.1 起，本文件断言的契约变了
 *
 * MCP 的协议分发与工具面已搬进 `@oblivion/core`（`oblivion-core/src/mcp/`，
 * 由那边的 `test/mcp.test.mjs` 负责测）。桥接**只做传输**，所以下面这些旧
 * 断言被**删除**（不是放宽），它们测的东西已经不在本包里：
 *
 *   - `inject === ['oblivion']`（旧断言）→ 现在必须是 `[]`，见 A3；
 *   - `readFacade` 的 `ctx.get ?? ctx.root?.get` 兜底 → 函数本身已删；
 *   - MCP 错误码 `-32700` / `-32601` / `-32602`、协议版本 `2025-06-18`、
 *     工具目录、`tools/call` 穿透门面 → 全部归 core。
 *
 * 现在断言的是**本包自己的契约**，三层：
 *
 *   A. 形状与契约
 *      1. 产物存在且可被真实 import
 *      2. 导出形状 name / inject / apply
 *      3. `inject` 是空数组，且产物里没有 `get("oblivion")`
 *         —— 这是 0.1.0 的**根因修复**，理由见 `src/index.ts` 顶部注释
 *      4. 通道契约字面量与 `oblivion-core/src/mcp/channel.ts` **逐字相同**
 *         （防手脚不一致的关键断言：改一处忘另一处会当场红）
 *      5. 契约字面量确实内联进了产物
 *      6. 传输面常量：端口 42081 / 只回环 / 1MB 上限 / 扩展白名单 /
 *         `::ffff:127.0.0.1`（Windows 上不加就全 401）
 *
 *   B. 纯行为（不启服务器）
 *      7. 用一个**没有 `get` 的 ctx** 跑 apply —— 证明它再也不取任何服务
 *      8. 三条凭据来源全空 ⇒ 不监听、只 warn（不抛）
 *      9. effect 注册了清理函数（HMR 重载不泄漏端口）
 *
 *   C. 端到端（真起服务器）
 *     10. 往全局通道塞假端点 → 一次 HTTP 往返 200 + 端点返回的 result
 *         —— 这条是新的「最关键的一条」：它证明请求真的交给了通道端点
 *     11. 通道为空 → 503 + `-32603` + 中文原因（不是静默不启动）
 *     12. 健康路由 200、`present` 跟随通道状态、非 GET → 405、**不需要 token**
 *     13. 鉴权三态：无 token 401 / 错 token 401 / 对 token 200
 *     14. 路由边界：404 / 405 / OPTIONS 204 + CORS
 *     15. 超 `maxBodyBytes` → 413
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const results = [];
let failed = 0;
let skipped = 0;

const SKIP = Symbol('skip');

async function check(name, fn) {
  try {
    const detail = await fn();
    if (detail === SKIP) {
      skipped += 1;
      results.push(['SKIP', name, '本机不适用']);
      return;
    }
    results.push(['PASS', name, detail ?? '']);
  } catch (error) {
    failed += 1;
    results.push(['FAIL', name, error?.message ?? String(error)]);
  }
}

const mod = await import(pathToFileURL(join(ROOT, 'lib', 'index.js')).href);
const bundleText = readFileSync(join(ROOT, 'lib', 'index.js'), 'utf8');
const channelSource = readFileSync(join(ROOT, 'src', 'channel.ts'), 'utf8');
const indexPath = join(ROOT, 'src', 'index.ts');
const indexSource = readFileSync(indexPath, 'utf8');

/** 契约对岸：core 的通道声明。只读，用来比对字面量。 */
const CORE_CHANNEL = join(ROOT, '..', 'oblivion-core', 'src', 'mcp', 'channel.ts');

/** 从源码文本里抠出契约字面量；抠不到就抛（声明被改名 = 契约破裂）。 */
function literals(source, label) {
  const channel = source.match(/MCP_CHANNEL\s*=\s*'([^']+)'/);
  const version = source.match(/MCP_API_VERSION\s*=\s*(\d+)/);
  assert.ok(channel, `${label} 里找不到 MCP_CHANNEL 字面量`);
  assert.ok(version, `${label} 里找不到 MCP_API_VERSION 字面量`);
  return { channel: channel[1], version: Number(version[1]) };
}

// ─────────────────────────── A. 形状与契约 ───────────────────────────

await check('产物存在且可 import', () => {
  const lib = join(ROOT, 'lib', 'index.js');
  assert.ok(existsSync(lib), 'lib/index.js 不存在，先跑 build');
  assert.equal(typeof mod.apply, 'function', 'apply 不是函数');
  return `${bundleText.length} B`;
});

await check('导出形状：name / inject / apply', () => {
  assert.equal(mod.name, '@oblivion/http-bridge');
  assert.ok(Array.isArray(mod.inject));
  assert.equal(typeof mod.apply, 'function');
  return `name=${mod.name} inject=[${mod.inject.join(', ')}]`;
});

await check('inject 是空数组（每请求惰性解析端点，不再声明服务依赖）', () => {
  // 0.1.0 写 inject=['oblivion']：Cordis 的 fiber._refresh() 遍历
  // Object.keys(this.inject)，任一服务取不到就把 epoch 置 INACTIVE ——
  // 插件停在 pending，apply() 一次都不跑。实测证据（2026-10-06）：
  // ~/.oblivion/bridge-heartbeat.json 不存在、42081 从未监听、日志无 bridge 记录。
  assert.deepEqual(mod.inject, [], "inject 必须是 []：声明任何服务都可能让整包停在 pending");
  assert.match(indexSource, /export const inject\s*(?::[^=]*)?=\s*\[\]/, 'src/index.ts 里没有空数组 inject 声明');
  assert.match(bundleText, /inject = \[\]/, '产物里 inject 不是空数组');
  assert.doesNotMatch(indexSource, /inject\(\[/, 'src/index.ts 里还有 ctx.inject([...])');
  return 'inject=[] · 源码与产物一致';
});

await check('产物里没有 ctx.get("oblivion") / readFacade 残留', () => {
  assert.doesNotMatch(bundleText, /get\(["']oblivion["']\)/, '还在 ctx.get("oblivion")');
  assert.doesNotMatch(bundleText, /readFacade/, 'readFacade 未删干净');
  assert.doesNotMatch(bundleText, /ctx\.root/, 'ctx.root 退路未删干净');
  return '无 get("oblivion") / readFacade / ctx.root';
});

await check('通道契约与 core 逐字相同（MCP_CHANNEL + MCP_API_VERSION）', () => {
  assert.ok(existsSync(CORE_CHANNEL), `读不到 core 的通道声明：${CORE_CHANNEL}`);
  const mine = literals(channelSource, 'src/channel.ts');
  const core = literals(readFileSync(CORE_CHANNEL, 'utf8'), 'oblivion-core/src/mcp/channel.ts');
  assert.equal(mine.channel, '@oblivion/core/mcp', `本包通道键是 ${mine.channel}`);
  assert.equal(mine.channel, core.channel, `通道键不一致：本包 ${mine.channel} vs core ${core.channel}`);
  assert.equal(mine.version, 1, `本包契约版本是 ${mine.version}`);
  assert.equal(mine.version, core.version, `契约版本不一致：本包 ${mine.version} vs core ${core.version}`);
  return `'${mine.channel}' · apiVersion=${mine.version}（与 core 逐字相同）`;
});

await check('契约字面量已内联进产物', () => {
  assert.match(bundleText, /"@oblivion\/core\/mcp"/, '产物里没有通道键字面量');
  assert.match(bundleText, /MCP_API_VERSION = 1/, '产物里没有契约版本字面量');
  return 'bundle 内联 "@oblivion/core/mcp" + MCP_API_VERSION = 1';
});

await check('传输面常量：端口 42081 / 只回环 / 1MB / 扩展白名单', () => {
  assert.match(bundleText, /42081/, '默认端口不是 42081');
  assert.match(bundleText, /127\.0\.0\.1/, '默认 host 不是回环');
  assert.doesNotMatch(bundleText, /0\.0\.0\.0/, '产物里出现 0.0.0.0 —— 不能监听全网卡');
  assert.match(bundleText, /1048576/, '默认体上限不是 1 MB');
  assert.match(bundleText, /koealbifonogjljlppjngjnaejemdjhp/, '扩展 ID 未预填');
  assert.match(bundleText, /::ffff:127\.0\.0\.1/, '缺 ::ffff:127.0.0.1（Windows 上会全 401）');
  return 'port=42081 host=127.0.0.1 maxBody=1MB · 含 IPv4-mapped IPv6';
});

// ─────────────────────────── B. 纯行为 ───────────────────────────

const TEST_PORT = 42099;
const TEST_PATH = '/oblivion/mcp';
const TEST_HEALTH = `${TEST_PATH}/health`;
const TEST_TOKEN = 'selfcheck-token-12345';
const CHANNEL_KEY = Symbol.for('@oblivion/core/mcp');

/**
 * 假宿主上下文。
 *
 * **刻意不提供 `get` / `inject`**：桥接 `inject: []`，一次都不该取服务。
 * 它若还敢 `ctx.get('oblivion')`，这里会当场 TypeError。
 */
function makeCtx() {
  const reg = { logs: [], disposers: [] };
  return {
    reg,
    ctx: {
      logger: {
        info: (m) => reg.logs.push(['info', String(m)]),
        warn: (m) => reg.logs.push(['warn', String(m)]),
      },
      effect: (fn) => {
        const disposer = fn();
        if (typeof disposer === 'function') reg.disposers.push(disposer);
      },
    },
  };
}

/** 假端点：记录入参，回最小合法的 JSON-RPC 响应。 */
function makeEndpoint() {
  const calls = [];
  return {
    calls,
    endpoint: {
      apiVersion: 1,
      owner: 'selfcheck',
      version: () => '9.9.9-fake',
      describe: () => ({
        apiVersion: 1,
        owner: 'selfcheck',
        version: '9.9.9-fake',
        tools: ['oblivion_search'],
        ready: true,
      }),
      handle: async (raw) => {
        calls.push(raw);
        const parsed = JSON.parse(raw);
        if (parsed.id === undefined || parsed.id === null) return null;
        return { jsonrpc: '2.0', id: parsed.id, result: { ok: true, seenBy: 'selfcheck-endpoint' } };
      },
    },
  };
}

/** 往全局通道放一个槽；返回撤销函数。 */
function publishFake(endpoint, apiVersion = 1) {
  const slot = { apiVersion, owner: endpoint.owner, endpoint, at: Date.now() };
  const existing = globalThis[CHANNEL_KEY];
  const registry = existing instanceof Map ? existing : new Map();
  registry.set(endpoint.owner, slot);
  Object.defineProperty(globalThis, CHANNEL_KEY, { value: registry, configurable: true });
  return () => registry.delete(endpoint.owner);
}

function clearChannel() {
  const registry = globalThis[CHANNEL_KEY];
  if (registry instanceof Map) registry.clear();
}

/** 轮询健康路由直到监听就绪（避免 sleep 猜时间）。 */
async function waitForHealth(port, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}${TEST_HEALTH}`);
      if (res.status === 200) return await res.json();
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`port ${port} 在 3s 内没有监听`);
}

/** 等端口真的释放，别让下一个检查项 EADDRINUSE 后探到旧实例。 */
async function waitForPortClosed(port, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      await fetch(`http://127.0.0.1:${port}${TEST_HEALTH}`);
    } catch {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`port ${port} 在 3s 内没有释放`);
}

/** 起一个桥接实例并等就绪；返回收尾函数。 */
async function listen(rawConfig = {}) {
  const { ctx, reg } = makeCtx();
  const config = { port: TEST_PORT, path: TEST_PATH, token: TEST_TOKEN, ...rawConfig };
  mod.apply(ctx, config);
  await waitForHealth(config.port);
  return {
    reg,
    base: `http://127.0.0.1:${config.port}`,
    url: `http://127.0.0.1:${config.port}${TEST_PATH}`,
    async close() {
      for (const dispose of reg.disposers) dispose();
      await waitForPortClosed(config.port);
    },
  };
}

function post(url, body, token = TEST_TOKEN) {
  const headers = { 'content-type': 'application/json' };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return fetch(url, { method: 'POST', headers, body });
}

await check('用「没有 get 的 ctx」跑 apply 也不抛（证明不再取服务）', () => {
  const { ctx, reg } = makeCtx();
  assert.equal(typeof ctx.get, 'undefined', '这个假 ctx 不该有 get —— 有的话就证明不了');
  assert.doesNotThrow(() => mod.apply(ctx, { port: TEST_PORT + 10, path: TEST_PATH, token: 'x' }));
  for (const dispose of reg.disposers) dispose();
  return 'apply 只碰 ctx.logger / ctx.effect';
});

await check('三条凭据来源全空 ⇒ 不监听、只 warn（不抛）', () => {
  const { ctx, reg } = makeCtx();
  mod.apply(ctx, { port: TEST_PORT + 11, path: TEST_PATH, tokenEnv: '', tokenFile: '', token: '' });
  assert.equal(reg.disposers.length, 0, '无凭据来源时不应注册服务器');
  assert.ok(
    reg.logs.some(([, m]) => m.includes('未配置')),
    '应记一条「已禁用」日志',
  );
  return '静默禁用 + warn';
});

await check('effect 注册了清理函数（HMR 重载不泄漏端口）', () => {
  const { ctx, reg } = makeCtx();
  mod.apply(ctx, { port: TEST_PORT + 12, path: TEST_PATH, token: 'x' });
  assert.ok(reg.disposers.length > 0, 'effect 没有返回 disposer，重载会泄漏监听');
  for (const dispose of reg.disposers) dispose();
  return `${reg.disposers.length} 个 disposer`;
});

// ─────────────────────────── C. 端到端（真起服务器） ───────────────────────────

await check('端到端：假端点 → 一次 HTTP 往返 200 + 端点返回的 result', async () => {
  clearChannel();
  const { endpoint, calls } = makeEndpoint();
  const undo = publishFake(endpoint);
  const server = await listen();
  try {
    const res = await post(
      server.url,
      JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }),
    );
    assert.equal(res.status, 200, `对 token 应 200，实际 ${res.status}`);
    const payload = await res.json();
    assert.equal(payload.jsonrpc, '2.0');
    assert.equal(payload.id, 7);
    assert.equal(
      payload.result.seenBy,
      'selfcheck-endpoint',
      'result 不是假端点给的 —— 请求没走到通道端点，桥接在自己编响应',
    );
    assert.equal(calls.length, 1, '假端点没被调用');
    return '200 + result 来自通道端点（不是桥接自编）';
  } finally {
    await server.close();
    undo();
    clearChannel();
  }
});

await check('端到端：通道为空 → 503 + -32603 + 中文原因', async () => {
  clearChannel();
  const server = await listen({ port: TEST_PORT + 1 });
  try {
    const res = await post(
      server.url,
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    );
    assert.equal(res.status, 503, `通道为空应 503，实际 ${res.status}`);
    assert.match(res.headers.get('content-type') ?? '', /^application\/json; charset=utf-8$/);
    const payload = await res.json();
    assert.equal(payload.id, null);
    assert.equal(payload.error.code, -32603);
    assert.match(payload.error.message, /oblivion core endpoint unavailable: /);
    assert.match(payload.error.message, /未找到通道/);
    return '503 · {"code":-32603,"message":"oblivion core endpoint unavailable: 未找到通道"}';
  } finally {
    await server.close();
  }
});

await check('端到端：健康路由（present 跟随通道 / 无需 token / 非 GET 405）', async () => {
  clearChannel();
  const { endpoint } = makeEndpoint();
  const undo = publishFake(endpoint);
  const server = await listen({ port: TEST_PORT + 2 });
  try {
    const health = await fetch(`${server.base}${TEST_HEALTH}`);
    assert.equal(health.status, 200);
    const payload = await health.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.port, TEST_PORT + 2);
    assert.equal(payload.path, TEST_PATH);
    assert.equal(typeof payload.uptimeMs, 'number');
    assert.equal(payload.endpoint.present, true, '通道里有端点，present 应为 true');
    assert.equal(payload.endpoint.owner, 'selfcheck');
    assert.equal(payload.endpoint.version, '9.9.9-fake');
    assert.equal(payload.endpoint.ready, true);

    const wrongMethod = await fetch(`${server.base}${TEST_HEALTH}`, { method: 'POST', body: '{}' });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get('allow'), 'GET');
    return `200 · present=true owner=selfcheck version=9.9.9-fake · 非 GET → 405`;
  } finally {
    await server.close();
    undo();
    clearChannel();
  }
});

await check('端到端：鉴权三态（无 token 401 / 错 token 401 / 对 token 200）', async () => {
  clearChannel();
  const { endpoint } = makeEndpoint();
  const undo = publishFake(endpoint);
  const server = await listen({ port: TEST_PORT + 3 });
  try {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' });
    assert.equal((await post(server.url, body, null)).status, 401, '无 token 应 401');
    assert.equal((await post(server.url, body, 'wrong-token')).status, 401, '错 token 应 401');
    assert.equal((await post(server.url, body)).status, 200, '对 token 应 200');
    return '401 / 401 / 200';
  } finally {
    await server.close();
    undo();
    clearChannel();
  }
});

await check('端到端：路由边界（404 / 405 / OPTIONS 204 + CORS）', async () => {
  clearChannel();
  const { endpoint } = makeEndpoint();
  const undo = publishFake(endpoint);
  const server = await listen({ port: TEST_PORT + 4 });
  try {
    const auth = { authorization: `Bearer ${TEST_TOKEN}` };
    const notFound = await fetch(`${server.base}/other`, { method: 'POST', headers: auth, body: '{}' });
    assert.equal(notFound.status, 404, `非端点路径应 404，实际 ${notFound.status}`);

    const wrongMethod = await fetch(server.url, { method: 'GET', headers: auth });
    assert.equal(wrongMethod.status, 405, `GET 应 405，实际 ${wrongMethod.status}`);
    assert.equal(wrongMethod.headers.get('allow'), 'POST, OPTIONS');

    const origin = 'chrome-extension://koealbifonogjljlppjngjnaejemdjhp';
    const preflight = await fetch(server.url, {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'POST' },
    });
    assert.equal(preflight.status, 204, `OPTIONS 应 204，实际 ${preflight.status}`);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);

    const evil = await fetch(server.url, { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
    assert.equal(evil.headers.get('access-control-allow-origin'), null, '白名单外的 Origin 不该回 CORS 头');
    return '404 / 405(Allow: POST, OPTIONS) / 204 + 白名单 CORS';
  } finally {
    await server.close();
    undo();
    clearChannel();
  }
});

await check('端到端：超 maxBodyBytes → 413', async () => {
  clearChannel();
  const { endpoint } = makeEndpoint();
  const undo = publishFake(endpoint);
  const server = await listen({ port: TEST_PORT + 5, maxBodyBytes: 256 });
  try {
    const res = await post(server.url, 'x'.repeat(4096)).catch(() => null);
    if (res === null) return '连接被 destroy（也算正确拒绝）';
    assert.equal(res.status, 413, `超限应 413，实际 ${res.status}`);
    return '413';
  } finally {
    await server.close();
    undo();
    clearChannel();
  }
});

// ─────────────────────────── 汇总 ───────────────────────────

for (const [status, name, detail] of results) {
  const suffix = detail === '' ? '' : `\n        ${detail}`;
  console.log(`${status}  ${name}${suffix}`);
}
console.log(`\n${results.length} 项，失败 ${failed}，跳过 ${skipped}`);
process.exit(failed > 0 ? 1 : 0);
