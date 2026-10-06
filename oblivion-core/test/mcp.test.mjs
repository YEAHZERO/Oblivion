/**
 * `@oblivion/core` · MCP 模块测试（协议分发 + 进程内通道 + 工具面）。
 *
 * 这一块原先属于 `@oblivion/http-bridge`（那边只测「MCP 分发的行为」），
 * 搬进 core 之后在这里测；bridge 那边只剩传输层（HTTP/鉴权/CORS/503）。
 *
 * 重点覆盖三件真机上真的会出问题的事：
 *   1. 通知（无 id）必须不回复 —— 回了会让扩展的 streamable_http 挂住；
 *   2. 未知工具是 **-32602** 而不是 -32601（现役 host 的口径，改错了扩展会收紧校验）；
 *   3. 通道跨「模块副本」必须认同一个键 —— 用 `Symbol.for`，测试直接从全局读一遍。
 */

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

let kit;

/** 一份会记录调用参数的假门面：断言工具真的把参数映射对了。 */
function fakeFacade() {
  const calls = { capture: [], query: [] };
  const facade = {
    version: '9.9.9-test',
    knowledge: {
      async capture(input) {
        calls.capture.push(input);
        return { pass: true, action: 'created', score: 0.8 };
      },
      async query(input) {
        calls.query.push(input);
        return { count: 0, results: [] };
      },
    },
  };
  return { facade, calls };
}

const rpc = (body) => JSON.stringify(body);

describe('MCP 协议分发（handleMcpMessage）', () => {
  before(async () => {
    kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
  });

  it('initialize 回协议版本与门面版本；门面缺席时版本是 unknown 但仍应答', async () => {
    const { facade } = fakeFacade();
    const withFacade = await kit.handleMcpMessage({ facade, rawBody: rpc({ jsonrpc: '2.0', id: 1, method: 'initialize' }) });
    assert.equal(withFacade.jsonrpc, '2.0');
    assert.equal(withFacade.error, undefined);
    assert.equal(withFacade.result.protocolVersion, '2025-06-18');
    assert.equal(withFacade.result.serverInfo.name, 'oblivion');
    assert.equal(withFacade.result.serverInfo.version, '9.9.9-test');
    assert.deepEqual(withFacade.result.capabilities, { tools: {} });

    const noFacade = await kit.handleMcpMessage({ facade: null, rawBody: rpc({ jsonrpc: '2.0', id: 2, method: 'initialize' }) });
    assert.equal(noFacade.result.serverInfo.version, 'unknown');
    assert.equal(noFacade.result.protocolVersion, '2025-06-18');
  });

  it('通知（无 id）一律不回；ping 有 id 才回', async () => {
    assert.equal(await kit.handleMcpMessage({ facade: null, rawBody: rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }) }), null);
    assert.equal(await kit.handleMcpMessage({ facade: null, rawBody: rpc({ jsonrpc: '2.0', method: 'tools/list' }) }), null);
    const pong = await kit.handleMcpMessage({ facade: null, rawBody: rpc({ jsonrpc: '2.0', id: 7, method: 'ping' }) });
    assert.deepEqual(pong.result, {});
  });

  it('tools/list 给出两个工具与 inputSchema；名字与工具面一致', async () => {
    const listed = await kit.handleMcpMessage({ facade: null, rawBody: rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' }) });
    const names = listed.result.tools.map((tool) => tool.name);
    assert.deepEqual(names, ['oblivion_capture_page', 'oblivion_search']);
    assert.deepEqual(names, kit.mcpToolNames());
    for (const tool of listed.result.tools) {
      assert.equal(typeof tool.description, 'string');
      assert.equal(tool.inputSchema.type, 'object');
    }
  });

  it('错误码口径：未知工具 -32602、未知方法 -32601、坏 JSON -32700、jsonrpc 非 2.0 -32600', async () => {
    const unknownTool = await kit.handleMcpMessage({ facade: null, rawBody: rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope' } }) });
    assert.equal(unknownTool.error.code, -32602);

    const unknownMethod = await kit.handleMcpMessage({ facade: null, rawBody: rpc({ jsonrpc: '2.0', id: 5, method: 'resources/list' }) });
    assert.equal(unknownMethod.error.code, -32601);

    const broken = await kit.handleMcpMessage({ facade: null, rawBody: '{ not json' });
    assert.equal(broken.error.code, -32700);

    const wrongVersion = await kit.handleMcpMessage({ facade: null, rawBody: rpc({ jsonrpc: '1.0', id: 6, method: 'ping' }) });
    assert.equal(wrongVersion.error.code, -32600);

    const notObject = await kit.handleMcpMessage({ facade: null, rawBody: '[1,2,3]' });
    assert.equal(notObject.error.code, -32600);
  });

  it('门面缺席时 tools/call 回 -32603（不是协议错误，是还没就绪）', async () => {
    const response = await kit.handleMcpMessage({
      facade: null,
      rawBody: rpc({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'oblivion_search', arguments: { query: 'x' } } }),
    });
    assert.equal(response.error.code, -32603);
    assert.match(response.error.message, /facade not ready/);
  });

  it('工具异常包成 isError:true 的正常响应（MCP 规范：业务失败不是协议错误）', async () => {
    const { facade } = fakeFacade();
    const response = await kit.handleMcpMessage({
      facade,
      rawBody: rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'oblivion_search', arguments: { query: '   ' } } }),
    });
    assert.equal(response.error, undefined);
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /query 不能为空/);
  });

  it('成功调用回 [{type:"text",text}]，且 text 是 JSON 字符串', async () => {
    const { facade } = fakeFacade();
    const response = await kit.handleMcpMessage({
      facade,
      rawBody: rpc({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'oblivion_search', arguments: { query: 'cordis' } } }),
    });
    assert.equal(response.result.isError, false);
    assert.equal(response.result.content[0].type, 'text');
    assert.deepEqual(JSON.parse(response.result.content[0].text), { count: 0, results: [] });
  });
});

describe('MCP 工具面（tools.ts）', () => {
  before(async () => {
    kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
  });

  const callTool = async (name, args) => {
    const { facade, calls } = fakeFacade();
    const response = await kit.handleMcpMessage({
      facade,
      rawBody: rpc({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    });
    return { response, calls };
  };

  it('capture_page：selection 优先于 content，url 判成 url 源，sessionId 固定 http-bridge', async () => {
    const { response, calls } = await callTool('oblivion_capture_page', {
      url: 'https://example.com/a',
      title: '标题',
      content: '正文',
      selection: '  选中的片段  ',
      tags: ['dsh', '', '  '],
    });
    assert.equal(response.result.isError, false);
    const input = calls.capture[0];
    assert.equal(input.answer, '选中的片段');
    assert.equal(input.question, '标题');
    assert.deepEqual(input.sources, [{ type: 'url', ref: 'https://example.com/a' }]);
    assert.deepEqual(input.tagsHint, ['dsh']);
    assert.equal(input.sessionId, 'http-bridge');
    assert.equal(typeof input.capturedAt, 'number');
  });

  it('capture_page：没有 title 时用 url 当问句；内容全空则报错（isError）', async () => {
    const empty = await callTool('oblivion_capture_page', { url: 'https://example.com', title: '', content: '   ' });
    assert.equal(empty.response.result.isError, true);
    assert.equal(empty.calls.capture.length, 0);

    const noTitle = await callTool('oblivion_capture_page', { url: 'https://example.com/b', title: '', content: '正文' });
    assert.equal(noTitle.calls.capture[0].question, 'https://example.com/b');
  });

  it('capture_page：非 http(s) 的 ref 判成 doc 源（与 core 的 tools.ts 同规则）', async () => {
    const { calls } = await callTool('oblivion_capture_page', { url: 'C:/tmp/x.md', title: 't', content: 'c' });
    assert.deepEqual(calls.capture[0].sources, [{ type: 'doc', ref: 'C:/tmp/x.md' }]);
  });

  it('search：limit 缺省 10、越界与非法值回落 10、合法值透传', async () => {
    const cases = [
      [{ query: 'a' }, 10],
      [{ query: 'a', limit: 3 }, 3],
      [{ query: 'a', limit: 0 }, 10],
      [{ query: 'a', limit: 51 }, 10],
      [{ query: 'a', limit: 2.5 }, 10],
      [{ query: 'a', limit: '8' }, 8],
    ];
    for (const [args, expected] of cases) {
      const { calls } = await callTool('oblivion_search', args);
      assert.equal(calls.query[0].limit, expected, JSON.stringify(args));
    }
  });
});

describe('MCP 进程内通道（channel.ts）', () => {
  before(async () => {
    kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
    kit.clearMcpChannel();
  });

  it('通道键是 Symbol.for 字面量 —— 换个模块副本也得认同一个键', () => {
    assert.equal(kit.MCP_CHANNEL, '@oblivion/core/mcp');
    assert.equal(kit.MCP_API_VERSION, 1);
    assert.equal(kit.MCP_OWNER, '@oblivion/core');
    assert.equal(kit.channelKey(), Symbol.for('@oblivion/core/mcp'));
    assert.equal(kit.channelKey(), kit.channelKey());
  });

  it('发布 → 解析 → describe 反映端点；disposer 清掉自己的槽', () => {
    kit.clearMcpChannel();
    assert.equal(kit.resolveMcp(), null);
    assert.equal(kit.describeMcpChannel().present, false);

    const { endpoint, dispose } = kit.registerMcp({ facade: fakeFacade().facade });
    const found = kit.resolveMcp();
    assert.equal(found, endpoint);
    const info = kit.describeMcpChannel();
    assert.equal(info.present, true);
    assert.equal(info.owner, '@oblivion/core');
    assert.equal(info.version, '9.9.9-test');
    assert.equal(info.ready, true);
    assert.deepEqual(info.tools, ['oblivion_capture_page', 'oblivion_search']);

    dispose();
    assert.equal(kit.resolveMcp(), null);
  });

  it('契约版本不匹配的槽一律不解析、describe 报 absent', () => {
    kit.clearMcpChannel();
    const stale = { apiVersion: 99, owner: 'old-core', version: () => '0.0.1', describe: () => ({ apiVersion: 99, owner: 'old-core', version: '0.0.1', tools: [], ready: true }), handle: async () => null };
    globalThis[Symbol.for('@oblivion/core/mcp')].set('old-core', { apiVersion: 99, owner: 'old-core', endpoint: stale, at: Date.now() });
    assert.equal(kit.resolveMcp(), null);
    assert.equal(kit.describeMcpChannel().present, false);
    kit.clearMcpChannel();
  });

  it('同 owner 再发布 = 顶替；旧 disposer 不许误删新端点', () => {
    kit.clearMcpChannel();
    const first = kit.registerMcp({ facade: fakeFacade().facade });
    const second = kit.registerMcp({ facade: fakeFacade().facade });
    assert.equal(kit.resolveMcp(), second.endpoint);
    first.dispose(); // 旧的一号已经被顶替，调用它的 disposer 不能把新的删掉
    assert.equal(kit.resolveMcp(), second.endpoint);
    second.dispose();
    assert.equal(kit.resolveMcp(), null);
  });

  it('端点门面缺席（装载早期）：ready=false，但 handle 仍按协议应答', async () => {
    kit.clearMcpChannel();
    const { endpoint, dispose } = kit.registerMcp({ facade: null });
    assert.equal(endpoint.describe().ready, false);
    assert.equal(kit.describeMcpChannel().ready, false);
    const response = await endpoint.handle(rpc({ jsonrpc: '2.0', id: 11, method: 'initialize' }));
    assert.equal(response.result.protocolVersion, '2025-06-18');
    dispose();
  });

  it('端到端：发布 → 解析 → handle 调通工具（写入落到同一个假门面）', async () => {
    kit.clearMcpChannel();
    const { facade, calls } = fakeFacade();
    const { endpoint, dispose } = kit.registerMcp({ facade });
    const resolved = kit.resolveMcp();
    assert.equal(resolved, endpoint);

    const response = await resolved.handle(
      rpc({ jsonrpc: '2.0', id: 12, method: 'tools/call', params: { name: 'oblivion_capture_page', arguments: { url: 'https://x.test/', title: 'T', content: 'C' } } }),
    );
    assert.equal(response.result.isError, false);
    assert.equal(calls.capture.length, 1);
    assert.deepEqual(JSON.parse(response.result.content[0].text), { pass: true, action: 'created', score: 0.8 });
    dispose();
  });
});
