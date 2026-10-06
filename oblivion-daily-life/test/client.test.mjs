/**
 * 有数（@oblivion/daily-life）· 客户端纯逻辑单测（测 lib/ 产物）。
 *
 * 三块：
 *   - `format.ts`：金额/日期/百分比的**显示口径**（null 必须是 `—`，不能显示成 ¥0）；
 *   - `api.ts`：fetch 可注入，于是「非 200 / 坏 JSON / 网络抛错 / 校验失败」全都能钉住；
 *   - `register.ts`：注册 tab 的三条路径 + **不许换引用**那条踩过的坑。
 */

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let kit;

before(async () => {
  kit = await import(pathToFileURL(join(ROOT, 'lib', 'testkit.js')).href);
});

/** 一条带派生指标的行（只写测试关心的字段）。 */
function row(overrides = {}, derived = {}) {
  return {
    id: 'dl-test01-ab',
    name: '相机',
    buyPrice: 5000,
    buyDate: '2024-06-01',
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
    derived: {
      holdingDays: 100,
      recovered: 0,
      dailyCost: 50,
      serviceDaysTarget: 365,
      usageProgress: 0.27,
      usageRatio: 0.27,
      overdueDays: 0,
      retentionRate: null,
      idleDays: 3,
      status: 'serving',
      soldDelta: null,
      ...derived,
    },
  };
}

/** 假的 fetch：按序返回给定响应。 */
function fakeFetch(responses) {
  const calls = [];
  const impl = async (input, init) => {
    calls.push({ input, init });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { impl, calls };
}

describe('金额显示', () => {
  it('两位小数 + 千分位', () => {
    assert.equal(kit.money(8999), '¥8,999.00');
    assert.equal(kit.money(245680.5), '¥245,680.50');
    assert.equal(kit.money(0), '¥0.00');
    assert.equal(kit.money(9.9), '¥9.90');
  });

  it('null / NaN 显示 —，绝不显示成 ¥0.00', () => {
    for (const value of [null, undefined, Number.NaN]) assert.equal(kit.money(value), '—', String(value));
  });

  it('负数把符号放在 ¥ 前面', () => {
    assert.equal(kit.money(-80), '-¥80.00');
    assert.equal(kit.signedMoney(-80), '-¥80.00');
    assert.equal(kit.signedMoney(120), '+¥120.00');
  });

  it('日耗一位小数并收掉 .0', () => {
    assert.equal(kit.moneyPerDay(9.9), '¥9.9/天');
    assert.equal(kit.moneyPerDay(10), '¥10/天');
    assert.equal(kit.moneyPerDay(1000), '¥1,000/天');
    assert.equal(kit.moneyPerDay(null), '—');
  });

  it('百分比取整', () => {
    assert.equal(kit.percentText(0.826), '83%');
    assert.equal(kit.percentText(0), '0%');
    assert.equal(kit.percentText(null), '—');
  });

  it('数字展示按位数截断并收掉尾随 .0', () => {
    assert.equal(kit.numberText(9.94), '9.9');
    assert.equal(kit.numberText(10), '10');
    assert.equal(kit.numberText(null), '—');
  });
});

describe('日期显示', () => {
  it('形状对的日期原样露出', () => {
    assert.equal(kit.dayText('2025-08-12'), '2025-08-12');
    assert.equal(kit.daysText(908), '908 天');
  });

  it('形状不对 / null / 空串都是 —（不猜、不补零）', () => {
    for (const value of [null, undefined, '', '2025/08/12', '25-08-12', '今天']) assert.equal(kit.dayText(value), '—', String(value));
    assert.equal(kit.daysText(null), '—');
  });
});

describe('状态与文案', () => {
  it('状态标签有中文，未知状态原样露出', () => {
    assert.equal(kit.statusLabel('serving'), '服役中');
    assert.equal(kit.statusLabel('idle'), '闲置中');
    assert.equal(kit.statusLabel('sold'), '已卖出');
    assert.equal(kit.statusLabel('future-status'), 'future-status');
  });

  it('色档只分三档', () => {
    assert.equal(kit.statusTone('serving'), 'good');
    assert.equal(kit.statusTone('idle'), 'warn');
    assert.equal(kit.statusTone('sold'), 'muted');
  });

  it('进度文案：超标时补一句「超标 N 天」', () => {
    assert.equal(kit.progressText(row()), '服役 27%');
    assert.equal(kit.progressText(row({}, { usageProgress: 1, overdueDays: 42 })), '服役 100% · 超标 42 天');
  });

  it('副标题：在役给闲置天数，已卖出给保值与差额', () => {
    const serving = kit.metaText(row({}, { holdingDays: 908, idleDays: 12 }));
    assert.match(serving, /总价 ¥5,000\.00/);
    assert.match(serving, /已用 908 天/);
    assert.match(serving, /闲置 12 天/);

    const sold = kit.metaText(row({ soldDate: '2025-01-01', soldPrice: 3200 }, { status: 'sold', retentionRate: 0.64, soldDelta: -1800 }));
    assert.match(sold, /保值 64%/);
    assert.match(sold, /差额 -¥1,800\.00/);
    assert.doesNotMatch(sold, /闲置/);
  });

  it('「用过一次」提示：次数与最后使用日都能缺', () => {
    assert.equal(kit.useHintText(row({ useCount: 3, lastUsedAt: '2025-05-30' })), '用过 3 次 · 最后一次 2025-05-30');
    assert.equal(kit.useHintText(row({ useCount: null, lastUsedAt: null })), '用过 — 次 · 最后一次 —');
  });

  it('计数行固定四项', () => {
    const stats = kit.summarize([row()], {});
    assert.equal(kit.countLine(stats), '共 1 件 · 服役中 1 · 闲置 0 · 已卖出 0');
  });

  it('KPI 恰好三格（一屏不超过三个数字）', () => {
    const stats = kit.summarize([row()], {});
    const cells = kit.kpiRow(stats);
    assert.equal(cells.length, 3);
    assert.deepEqual(cells.map((cell) => cell.label), ['账面投入', '日耗合计', '闲置损耗']);
    assert.match(cells[0].value, /^¥/);
    assert.match(cells[1].value, /\/天$/);
  });

  it('HTTP 状态码 → 人话，未知码只报码', () => {
    assert.equal(kit.httpText(405), '请求方式不对');
    assert.equal(kit.httpText(403), '跨源请求被拒绝');
    assert.equal(kit.httpText(409), '账本已满（上限 2000 件）');
    assert.equal(kit.httpText(413), '请求体太大');
    assert.match(kit.httpText(400, ['name 不能为空', 'buyPrice 必须是不小于 0 的数字']), /^字段没填对：name 不能为空；/);
    assert.equal(kit.httpText(418), '请求失败（HTTP 418）');
  });
});

describe('api：读状态', () => {
  const goodState = {
    ok: true,
    plugin: '@oblivion/daily-life',
    version: '0.0.1',
    generatedAt: '2025-06-01T00:00:00.000Z',
    dataFile: 'C:/x/assets.json',
    loadError: null,
    skipped: 0,
    items: [],
    stats: {},
  };

  it('相对路径 + GET（同源，端口漂移也活着）', async () => {
    const { impl, calls } = fakeFetch([{ ok: true, status: 200, json: async () => goodState }]);
    const result = await kit.fetchState({ fetchImpl: impl });
    assert.equal(result.ok, true);
    assert.equal(calls[0].input, kit.DEFAULT_STATUS_PATH);
    assert.equal(calls[0].input.startsWith('http'), false, '必须是相对路径');
    assert.equal(calls[0].init.method, 'GET');
  });

  it('非 200 → 折成错误，带状态码', async () => {
    const { impl } = fakeFetch([{ ok: false, status: 500, json: async () => ({ ok: false, error: 'internal error' }) }]);
    const result = await kit.fetchState({ fetchImpl: impl });
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
  });

  it('坏 JSON → 说清是形状问题', async () => {
    const { impl } = fakeFetch([{ ok: true, status: 200, json: async () => ({ hello: 'world' }) }]);
    const result = await kit.fetchState({ fetchImpl: impl });
    assert.equal(result.ok, false);
    assert.match(result.error, /非预期形状/);
  });

  it('json() 抛错不炸出去', async () => {
    const { impl } = fakeFetch([
      {
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('boom');
        },
      },
    ]);
    const result = await kit.fetchState({ fetchImpl: impl });
    assert.equal(result.ok, false);
  });

  it('网络抛错 → status 0', async () => {
    const { impl } = fakeFetch([new Error('ECONNREFUSED')]);
    const result = await kit.fetchState({ fetchImpl: impl });
    assert.equal(result.ok, false);
    assert.equal(result.status, 0);
    assert.match(result.error, /ECONNREFUSED/);
  });

  it('环境里没有 fetch 也如实回答（不是抛异常）', async () => {
    const saved = globalThis.fetch;
    globalThis.fetch = undefined;
    try {
      const result = await kit.fetchState();
      assert.equal(result.ok, false);
      assert.match(result.error, /没有 fetch/);
    } finally {
      globalThis.fetch = saved;
    }
  });

  it('自定义路径可覆盖', async () => {
    const { impl, calls } = fakeFetch([{ ok: true, status: 200, json: async () => goodState }]);
    await kit.fetchState({ fetchImpl: impl, statusPath: '/custom/status' });
    assert.equal(calls[0].input, '/custom/status');
  });
});

describe('api：写动作', () => {
  it('POST + JSON 体，成功回 payload', async () => {
    const { impl, calls } = fakeFetch([{ ok: true, status: 200, json: async () => ({ ok: true, item: { id: 'dl-a-aa' } }) }]);
    const result = await kit.sendAction({ action: 'add', item: { name: 'x' } }, { fetchImpl: impl });
    assert.equal(result.ok, true);
    assert.equal(calls[0].input, kit.DEFAULT_ITEMS_PATH);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), { action: 'add', item: { name: 'x' } });
    assert.deepEqual(kit.itemOf(result.payload), { id: 'dl-a-aa' });
  });

  it('400 把 errors 数组带出来（界面要能逐条显示）', async () => {
    const { impl } = fakeFetch([{ ok: false, status: 400, json: async () => ({ ok: false, error: 'invalid fields', errors: ['name 不能为空'] }) }]);
    const result = await kit.sendAction({ action: 'add', item: {} }, { fetchImpl: impl });
    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.deepEqual(result.errors, ['name 不能为空']);
    assert.match(result.error, /name 不能为空/);
  });

  it('200 但 ok !== true → 也算失败', async () => {
    const { impl } = fakeFetch([{ ok: true, status: 200, json: async () => ({ hello: 1 }) }]);
    const result = await kit.sendAction({ action: 'remove', id: 'dl-a-aa' }, { fetchImpl: impl });
    assert.equal(result.ok, false);
  });

  it('itemOf 对空 payload 给 null', () => {
    assert.equal(kit.itemOf({}), null);
    assert.equal(kit.itemOf({ item: null }), null);
  });
});

describe('api：表单草稿', () => {
  it('空表单默认「今天买入」', () => {
    const draft = kit.defaultDraft('2025-08-12');
    assert.equal(draft.buyDate, '2025-08-12');
    assert.equal(draft.name, '');
    assert.equal(draft.buyPrice, '');
  });

  it('空串一律变 null（不是 \'\' 也不是 0）', () => {
    const item = kit.draftToItem({ name: '  耳机  ', buyPrice: '', buyDate: ' 2025-01-01 ', category: '   ', serviceDaysTarget: '', note: '' });
    assert.equal(item.name, '耳机');
    assert.equal(item.buyPrice, null);
    assert.equal(item.buyDate, '2025-01-01');
    assert.equal(item.category, null);
    assert.equal(item.serviceDaysTarget, null);
    assert.equal(item.note, null);
  });

  it('数字解析：合法给数，非法给 NaN（让服务端去判错）', () => {
    assert.equal(kit.draftToItem({ buyPrice: '120.5' }).buyPrice, 120.5);
    assert.equal(kit.draftToItem({ serviceDaysTarget: '365' }).serviceDaysTarget, 365);
    assert.equal(Number.isNaN(kit.draftToItem({ buyPrice: 'abc' }).buyPrice), true);
  });
});

describe('register：三种结局 + 不许换引用', () => {
  const component = () => null;

  it('服务在 → registered，并且把 disposer 交给 effect 释放', () => {
    const seen = [];
    const effects = [];
    const ctx = {
      inject: (_deps, callback) => callback({ betterSidebar: { registerTab: (descriptor) => { seen.push(descriptor); return () => undefined; } } }),
      effect: (callback, label) => effects.push(label),
    };
    const result = kit.registerDailyLifeTab(ctx, component, () => undefined);
    assert.equal(result.status, 'registered');
    assert.equal(seen.length, 1);
    assert.equal(effects.length, 1);
    assert.match(String(effects[0]), /better-sidebar tab/);
  });

  it('descriptor 的形状：id 是自有命名空间、title 取回中文名', () => {
    const descriptor = kit.dailyLifeDescriptor(component);
    assert.equal(descriptor.id, kit.DAILY_LIFE_TAB_ID);
    assert.equal(descriptor.id, 'oblivion:daily-life');
    assert.equal(typeof descriptor.title, 'function');
    assert.equal(descriptor.title(), '有数');
    assert.equal(descriptor.single, true);
    assert.equal(typeof descriptor.order, 'number');
  });

  it('服务不在 → no-service + 一条 warn（不抛）', () => {
    const warnings = [];
    const ctx = { inject: (_deps, callback) => callback({}) };
    const result = kit.registerDailyLifeTab(ctx, component, (message) => warnings.push(message));
    assert.equal(result.status, 'no-service');
    assert.equal(warnings.length, 1);
  });

  it('service.registerTab 抛错 → failed（不把插件拖崩）', () => {
    const warnings = [];
    const ctx = {
      inject: (_deps, callback) =>
        callback({
          betterSidebar: {
            registerTab: () => {
              throw new Error('sidebar exploded');
            },
          },
        }),
    };
    const result = kit.registerDailyLifeTab(ctx, component, (message) => warnings.push(message));
    assert.equal(result.status, 'failed');
    assert.match(String(result.detail), /sidebar exploded/);
    assert.equal(warnings.length, 1);
  });

  it('结果对象**在注入回调里被就地改写**（换引用就是 panel 那个「点击没反应」的坑）', () => {
    let callbackRef;
    const ctx = {
      inject: (_deps, callback) => {
        callbackRef = callback; // 先存起来，模拟「回调稍后才触发」
        return undefined;
      },
    };
    const result = kit.registerDailyLifeTab(ctx, component, () => undefined);
    assert.equal(result.status, 'no-service', '回调没跑之前是 no-service');
    callbackRef({ betterSidebar: { registerTab: () => () => undefined } });
    assert.equal(result.status, 'registered', '回调跑完后**同一个对象**必须已经变成 registered');
  });

  it('没有 inject 时退回 ctx.get（老外壳）', () => {
    const ctx = { get: (name) => (name === 'betterSidebar' ? { registerTab: () => undefined } : undefined) };
    assert.equal(kit.registerDailyLifeTab(ctx, component, () => undefined).status, 'registered');
    assert.equal(kit.registerDailyLifeTab({}, component, () => undefined).status, 'no-service');
  });
});
