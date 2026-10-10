/**
 * @oblivion/http-bridge 单元测试（node --test）。
 *
 * ## 本文件测什么（0.1.1 起）
 *
 * 只测**传输层**：路由 / CORS / 鉴权 / 请求体边界 / 状态码 / 通道解析。
 * MCP 的协议分发与工具面归 `@oblivion/core`（`oblivion-core/src/mcp/`），
 * 那边的 `test/mcp.test.mjs` 测 `initialize` / `tools/list` / `tools/call` /
 * 错误码 —— 本文件不该再出现 `-32700` / `tools/list` 这类断言。
 *
 * 桥接**不认识门面**：它只从进程内通道取一个 `handle(rawBody)`。所以这里
 * 往全局通道塞一个假端点，断言「请求真的被交给了端点」，而不是断言协议细节。
 *
 * 与 selfcheck 的分工：
 *   - selfcheck 验「装起来对不对」（端到端、契约字面量、真起服务器）；
 *   - 本文件验「边界对不对」（401/404/405/413/503/CORS/契约版本）。
 */

import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { after, before, describe, it } from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const mod = await import(pathToFileURL(join(ROOT, 'lib', 'index.js')).href);
const bundleText = readFileSync(join(ROOT, 'lib', 'index.js'), 'utf8');

const PORT = 42098;
const PATH = '/oblivion/mcp';
const HEALTH = `${PATH}/health`;
const TOKEN = 'test-token-abcdef';

/** 通道键：与 src/channel.ts 的 MCP_CHANNEL 逐字相同（selfcheck 逐字比对两处源码）。 */
const CHANNEL_KEY = Symbol.for('@oblivion/core/mcp');

// ─────────────────────────── 假端点与假的宿主上下文 ───────────────────────────

/**
 * 假端点：记录 `handle` 的入参，回一个最小合法的 JSON-RPC 响应。
 *
 * `ready` 可调 —— 用来验证 resolve 的「优先 ready」逻辑。
 */
function makeEndpoint(overrides = {}) {
  const calls = [];
  const endpoint = {
    apiVersion: 1,
    owner: 'fake',
    version: () => '9.9.9',
    describe: () => ({
      apiVersion: 1,
      owner: 'fake',
      version: '9.9.9',
      tools: ['oblivion_search'],
      ready: true,
    }),
    handle: async (raw) => {
      calls.push(raw);
      const parsed = JSON.parse(raw);
      // 通知（无 id）回 null：传输层应当落 204
      if (parsed.id === undefined || parsed.id === null) return null;
      return { jsonrpc: '2.0', id: parsed.id, result: { ok: true, echo: parsed.method } };
    },
    ...overrides,
  };
  return { endpoint, calls };
}

/** 把（若干）端点放进全局通道；返回清理函数。 */
function publishFake(endpoint, owner = 'fake', apiVersion = 1, at = Date.now()) {
  const key = Symbol.for('@oblivion/core/mcp');
  const slot = { apiVersion, owner, endpoint, at };
  const existing = globalThis[key];
  const registry = existing instanceof Map ? existing : new Map();
  registry.set(owner, slot);
  Object.defineProperty(globalThis, key, { value: registry, configurable: true });
  return () => {
    registry.delete(owner);
  };
}

/** 清空全局通道（测试隔离的关键：别的用例不该看见我们塞的端点）。 */
function clearChannel() {
  const registry = globalThis[CHANNEL_KEY];
  if (registry instanceof Map) registry.clear();
}

/**
 * 假宿主上下文。
 *
 * **刻意不提供 `get`**：桥接 `inject: []`、一次都不该取服务。它若还去
 * `ctx.get('oblivion')`，这里会当场抛 TypeError（这正是我们要的护栏）。
 */
function makeCtx() {
  const disposers = [];
  return {
    disposers,
    ctx: {
      logger: { info: () => {}, warn: () => {} },
      effect: (fn) => {
        const d = fn();
        if (typeof d === 'function') disposers.push(d);
      },
    },
  };
}

/** 起一个桥接实例，等它真的开始监听（用不需要 token 的健康路由探测）。 */
async function listen(port, config = {}) {
  const made = makeCtx();
  process.env.OBLIVION_BRIDGE_TOKEN = TOKEN;
  mod.apply(made.ctx, { port, path: PATH, ...config });
  await waitForHealth(port);
  return {
    base: `http://127.0.0.1:${port}`,
    url: `http://127.0.0.1:${port}${PATH}`,
    dispose: () => {
      for (const d of made.disposers) d();
    },
    close: async () => {
      for (const d of made.disposers) d();
      await waitForPortClosed(port);
    },
  };
}

/** 轮询健康路由直到服务器起来；起不来就抛（避免用 sleep 猜时间）。 */
async function waitForHealth(port, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}${HEALTH}`);
      if (res.status === 200) return await res.json();
    } catch {
      /* 还没监听，继续等 */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`port ${port} 在 3s 内没有监听`);
}

/**
 * 等端口真的释放。
 *
 * `server.close()` 只是「不再接受新连接」，已有的 keep-alive 连接会让端口
 * 多占一会儿 —— 下一个用例若用同号端口会 EADDRINUSE，而 `server.on('error')`
 * 只 warn 不抛，于是新服务器静默没起来、探测到的却是**旧**服务器。
 * 每个 after 都等一次，避免这种假通过。
 */
async function waitForPortClosed(port, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      await fetch(`http://127.0.0.1:${port}${HEALTH}`);
    } catch {
      return; // 连接被拒 = 端口释放了
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`port ${port} 在 3s 内没有释放`);
}

/** 带（或不带）token 发一次 POST。 */
function post(url, body, token = TOKEN) {
  const headers = { 'content-type': 'application/json' };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return fetch(url, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

// ─────────────────────────── 1. 配置常量 ───────────────────────────

describe('配置常量（产物文本断言）', () => {
  it('默认端口是 42081（固定，不是随机）', () => {
    assert.match(bundleText, /var DEFAULT_PORT = 42081/);
  });

  it('默认 host 是回环，绝不是 0.0.0.0', () => {
    assert.match(bundleText, /var DEFAULT_HOST = "127\.0\.0\.1"/);
    assert.doesNotMatch(bundleText, /0\.0\.0\.0/);
  });

  it('默认路径是 /oblivion/mcp，健康路由由它派生', () => {
    assert.match(bundleText, /var DEFAULT_PATH = "\/oblivion\/mcp"/);
    assert.match(bundleText, /\/health/, '产物里没有健康路由');
  });

  it('inject 是空数组，且产物里没有 ctx.get("oblivion")', () => {
    assert.match(bundleText, /var inject = \[\]/);
    assert.doesNotMatch(bundleText, /get\("oblivion"\)|get\('oblivion'\)/);
  });
});

// ─────────────────────────── 2. 通道为空：503 ───────────────────────────

describe('通道为空（端点缺席）', () => {
  let server;
  before(async () => {
    clearChannel();
    server = await listen(PORT + 1);
  });
  after(async () => {
    await server.close(); // 等端口真的释放，别让下一个用例的 EADDRINUSE 假通过
    clearChannel();
  });

  it('POST 回 503 + JSON-RPC -32603 + 中文原因', async () => {
    const res = await post(server.url, { jsonrpc: '2.0', id: 1, method: 'initialize' });
    assert.equal(res.status, 503);
    assert.match(res.headers.get('content-type'), /^application\/json; charset=utf-8$/);
    const payload = await res.json();
    assert.equal(payload.jsonrpc, '2.0');
    assert.equal(payload.id, null);
    assert.equal(payload.error.code, -32603);
    assert.match(payload.error.message, /oblivion core endpoint unavailable: /);
    assert.match(payload.error.message, /未找到通道/);
  });

  it('健康路由仍回 200，且 endpoint.present === false', async () => {
    const res = await fetch(`${server.base}${HEALTH}`);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.endpoint.present, false);
    assert.match(payload.endpoint.reason, /未找到通道/);
  });
});

// ─────────────────────────── 3. 通道里有端点：正常传输 ───────────────────────────

describe('通道里有假端点', () => {
  let server;
  let calls;
  let endpoint;

  before(async () => {
    clearChannel();
    const made = makeEndpoint();
    calls = made.calls;
    endpoint = made.endpoint;
    publishFake(endpoint);
    server = await listen(PORT);
  });

  after(async () => {
    await server.close(); // 等端口真的释放，别让下一个用例的 EADDRINUSE 假通过
    clearChannel();
  });

  it('POST → 200 + 端点返回的 JSON-RPC 响应（请求真的交给了端点）', async () => {
    const res = await post(server.url, { jsonrpc: '2.0', id: 42, method: 'tools/list' });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^application\/json; charset=utf-8$/);
    const payload = await res.json();
    assert.equal(payload.jsonrpc, '2.0');
    assert.equal(payload.id, 42);
    assert.deepEqual(payload.result, { ok: true, echo: 'tools/list' });
    assert.equal(calls.length, 1, '端点没被调用');
    assert.equal(JSON.parse(calls[0]).method, 'tools/list');
  });

  it('通知（无 id）→ 端点回 null → 204', async () => {
    const res = await post(server.url, { jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.equal(res.status, 204);
  });

  it('端点抛异常 → 200 + -32603（协议层兜底，不落 500）', async () => {
    const boom = makeEndpoint({
      handle: async () => {
        throw new Error('boom-from-endpoint');
      },
    });
    const undo = publishFake(boom.endpoint, 'boom-owner');
    try {
      const res = await post(server.url, { jsonrpc: '2.0', id: 9, method: 'ping' });
      assert.equal(res.status, 200);
      const payload = await res.json();
      assert.equal(payload.error.code, -32603);
      assert.match(payload.error.message, /boom-from-endpoint/);
    } finally {
      undo();
    }
  });

  it('健康路由 200 且 endpoint.present === true（版本/工具来自端点）', async () => {
    const res = await fetch(`${server.base}${HEALTH}`);
    assert.equal(res.status, 200);
    const payload = await res.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.port, PORT);
    assert.equal(payload.path, PATH);
    assert.equal(typeof payload.uptimeMs, 'number');
    assert.equal(payload.endpoint.present, true);
    assert.equal(payload.endpoint.owner, 'fake');
    assert.equal(payload.endpoint.version, '9.9.9');
    assert.deepEqual(payload.endpoint.tools, ['oblivion_search']);
    assert.equal(payload.endpoint.ready, true);
  });

  it('健康路由不需要 token', async () => {
    const res = await fetch(`${server.base}${HEALTH}`);
    assert.equal(res.status, 200, '健康路由应当无需鉴权');
  });

  it('健康路由非 GET → 405 且 Allow: GET', async () => {
    const res = await fetch(`${server.base}${HEALTH}`, { method: 'POST', body: '{}' });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET');
  });
});

// ─────────────────────────── 4. 契约版本不匹配 ───────────────────────────

describe('契约版本', () => {
  after(() => {
    clearChannel();
  });

  it('apiVersion 不匹配的端点一律当没有（不许猜着调）', async () => {
    clearChannel();
    // 裸读 lib 里的 resolve：产物把 MCP_API_VERSION 内联，所以这一条同时
    // 断言「传输层读的版本就是它自己声明的 1」。
    assert.match(bundleText, /var MCP_API_VERSION = 1/);
    const { endpoint } = makeEndpoint({ apiVersion: 2 });
    const undo = publishFake(endpoint, 'future-core', 2);
    try {
      const server = await listen(PORT + 5, { token: TOKEN });
      try {
        const res = await post(server.url, { jsonrpc: '2.0', id: 1, method: 'initialize' });
        assert.equal(res.status, 503, '版本不匹配应当 503，而不是拿 2.0 端点硬调');
        const payload = await res.json();
        assert.equal(payload.error.code, -32603);
        assert.match(payload.error.message, /契约版本不匹配：期望 1，实际 2/);
      } finally {
        server.dispose();
      }
    } finally {
      undo();
    }
  });
});

// ─────────────────────────── 5. 鉴权 ───────────────────────────

describe('鉴权', () => {
  let server;
  before(async () => {
    clearChannel();
    publishFake(makeEndpoint().endpoint);
    server = await listen(PORT + 2);
  });
  after(async () => {
    await server.close(); // 等端口真的释放，别让下一个用例的 EADDRINUSE 假通过
    clearChannel();
  });

  it('缺 token → 401（不泄露端点是否存在）', async () => {
    const res = await post(server.url, { jsonrpc: '2.0', id: 1, method: 'ping' }, null);
    assert.equal(res.status, 401);
  });

  it('错 token → 401', async () => {
    const res = await post(server.url, { jsonrpc: '2.0', id: 1, method: 'ping' }, 'wrong-token');
    assert.equal(res.status, 401);
  });

  it('对 token → 200', async () => {
    const res = await post(server.url, { jsonrpc: '2.0', id: 1, method: 'ping' });
    assert.equal(res.status, 200);
  });

  it('config.token 直给压过环境变量（不依赖环境继承）', async () => {
    clearChannel();
    publishFake(makeEndpoint().endpoint);
    const direct = 'direct-token-xyz';
    const srv = await listen(PORT + 6, { token: direct });
    // listen() 会把 OBLIVION_BRIDGE_TOKEN 设成测试通用 token；这里**在监听之后**
    // 再覆盖它，才能真的证明「直给值压过环境变量」而不是「环境变量恰好也是它」。
    process.env.OBLIVION_BRIDGE_TOKEN = 'env-token-should-lose';
    try {
      assert.equal(
        (await post(srv.url, { jsonrpc: '2.0', id: 1, method: 'ping' }, direct)).status,
        200,
        '直给的 token 应当被接受',
      );
      assert.equal(
        (await post(srv.url, { jsonrpc: '2.0', id: 1, method: 'ping' }, 'env-token-should-lose')).status,
        401,
        '环境变量里的 token 应当被直给值压过',
      );
    } finally {
      srv.dispose();
      delete process.env.OBLIVION_BRIDGE_TOKEN;
      clearChannel();
    }
  });

  it('tokenFile 从文件读，容忍 CRLF 与末尾空行', async () => {
    clearChannel();
    publishFake(makeEndpoint().endpoint);
    const tokenFile = join(tmpdir(), `oblivion-token-${Date.now()}.txt`);
    writeFileSync(tokenFile, 'file-token-abc\r\n\n', 'utf8');
    const srv = await listen(PORT + 7, { tokenFile });
    try {
      assert.equal((await post(srv.url, { jsonrpc: '2.0', id: 1, method: 'ping' }, 'file-token-abc')).status, 200);
    } finally {
      srv.dispose();
      rmSync(tokenFile, { force: true });
      clearChannel();
    }
  });

  it('三条凭据来源全空 ⇒ 不监听端口（apply 直接 return）', async () => {
    const p = PORT + 8;
    const made = makeCtx();
    mod.apply(made.ctx, { port: p, path: PATH, token: '', tokenFile: '', tokenEnv: '' });
    await new Promise((r) => setTimeout(r, 300));
    try {
      let refused = false;
      try {
        await fetch(`http://127.0.0.1:${p}${PATH}`, { method: 'POST', body: '{}' });
      } catch {
        refused = true; // 连接被积极拒绝 = 端口没开
      }
      assert.equal(refused, true, '无凭据来源时不应监听端口');
    } finally {
      for (const d of made.disposers) d();
    }
  });
});

// ─────────────────────────── 6. 路由与 CORS ───────────────────────────

describe('路由与 CORS', () => {
  let server;
  before(async () => {
    clearChannel();
    publishFake(makeEndpoint().endpoint);
    server = await listen(PORT + 3);
  });
  after(async () => {
    await server.close(); // 等端口真的释放，别让下一个用例的 EADDRINUSE 假通过
    clearChannel();
  });

  const EXT_ORIGIN = 'chrome-extension://koealbifonogjljlppjngjnaejemdjhp';

  it('非本端点路径 → 404（多一个路径就多一份攻击面）', async () => {
    const res = await post(`${server.base}/other`, '{}');
    assert.equal(res.status, 404);
  });

  it('非 POST（打 MCP 端点）→ 405，Allow 是 POST, OPTIONS', async () => {
    const res = await fetch(server.url);
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'POST, OPTIONS');
  });

  it('OPTIONS 预检 → 204 + CORS 头（且不要求鉴权）', async () => {
    const res = await fetch(server.url, {
      method: 'OPTIONS',
      headers: { origin: EXT_ORIGIN, 'access-control-request-method': 'POST' },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), EXT_ORIGIN);
    assert.match(res.headers.get('access-control-allow-methods'), /POST/);
    assert.match(res.headers.get('access-control-allow-methods'), /OPTIONS/);
    assert.equal(res.headers.get('vary'), 'origin');
  });

  it('白名单之外的 Origin 不回 CORS 头（默认不放开）', async () => {
    const res = await fetch(server.url, {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });

  it('超 maxBodyBytes → 413（专用小上限实例，不靠打 1MB 触发）', async () => {
    clearChannel();
    publishFake(makeEndpoint().endpoint);
    const srv = await listen(PORT + 4, { maxBodyBytes: 256 });
    try {
      const res = await post(srv.url, 'x'.repeat(4096), TOKEN).catch(() => null);
      if (res === null) {
        // 超限时服务端会 destroy 连接，fetch 有时直接抛 —— 也是正确拒绝
        return;
      }
      assert.equal(res.status, 413);
      assert.match(await res.text(), /too large/);
    } finally {
      await srv.close();
      clearChannel();
    }
  });
});
