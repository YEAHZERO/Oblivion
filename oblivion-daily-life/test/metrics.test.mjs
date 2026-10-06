/**
 * 有数（@oblivion/daily-life）· 指标层单测（测 lib/ 产物，与仓库其它插件同一策略）。
 *
 * 运行：node --test（package.json 的 test 脚本）
 *
 * 这一批钉的是**口径**：金额圆整、持有天数含首日、进度截断与超标天数、
 * 保值率的 null 语义、闲置阈值、汇总的 NaN 兜底、校验的必填与成对规则。
 * 每条断言背后都对应规格里的一条裁决 —— 改口径必须改这里的断言，不能被悄悄改掉。
 */

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// 顶层 await：`describe` 的函数体在收集阶段就执行，所以 kit 必须在**导入期**就绪
// （放在 `before` 钩子里会晚一步，describe 体里访问 kit 会炸）。
const kit = await import(pathToFileURL(join(ROOT, 'lib', 'testkit.js')).href);

/** 一条完整记录（测试里只写关心的字段）。 */
function item(overrides = {}) {
  return {
    id: 'dl-test01-ab',
    name: '测试物品',
    buyPrice: 1000,
    buyDate: '2025-01-01',
    category: null,
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

describe('金额圆整（显式 HALF_UP 到 2 位）', () => {
  it('0.005 / 1.005 / 2.675 三个边界都向上', () => {
    assert.equal(kit.roundMoney(0.005), 0.01);
    assert.equal(kit.roundMoney(1.005), 1.01, '裸 Math.round(1.005*100) 会得到 1.00');
    assert.equal(kit.roundMoney(2.675), 2.68);
  });

  it('负数按绝对值舍入后再加符号', () => {
    assert.equal(kit.roundMoney(-1.005), -1.01);
  });

  it('非有限数一律 0（账本里 NaN 比 0 更糟）', () => {
    assert.equal(kit.roundMoney(Number.NaN), 0);
    assert.equal(kit.roundMoney(Number.POSITIVE_INFINITY), 0);
  });
});

describe('持有天数：含首日、最小 1 天', () => {
  it('当天买入 = 1 天（不是 0，避免除零）', () => {
    const today = kit.parseDay('2025-01-01');
    assert.equal(kit.deriveItem(item({ buyDate: '2025-01-01' }), today).holdingDays, 1);
  });

  it('买了 3 个日历日 = 3 天（含首日）', () => {
    const today = kit.parseDay('2025-01-03');
    assert.equal(kit.deriveItem(item({ buyDate: '2025-01-01' }), today).holdingDays, 3);
  });

  it('已卖出：算到卖出日为止，不再随今天增长', () => {
    const today = kit.parseDay('2026-01-01');
    const sold = item({ buyDate: '2025-01-01', soldDate: '2025-02-01', soldPrice: 800 });
    assert.equal(kit.deriveItem(sold, today).holdingDays, 32);
  });
});

describe('真实日均成本', () => {
  it('未卖出 = 买入价 / 持有天数（2 位）', () => {
    const today = kit.parseDay('2025-01-10');
    const derived = kit.deriveItem(item({ buyPrice: 1000, buyDate: '2025-01-01' }), today);
    assert.equal(derived.holdingDays, 10);
    assert.equal(derived.dailyCost, 100);
  });

  it('已卖出：回收的钱从分子里扣掉 —— 用回本的东西日耗为负就是「赚回来了」', () => {
    const today = kit.parseDay('2025-01-11');
    const derived = kit.deriveItem(item({ buyPrice: 1000, buyDate: '2025-01-01', soldDate: '2025-01-10', soldPrice: 1200 }), today);
    assert.equal(derived.recovered, 1200);
    assert.equal(derived.dailyCost, -20);
    assert.equal(derived.soldDelta, 200);
  });
});

describe('服役进度：进度条截断、超标天数不截断', () => {
  it('未超标：usageProgress = 持有/目标，overdueDays = 0', () => {
    const today = kit.parseDay('2025-04-11'); // 100 天
    const derived = kit.deriveItem(item({ buyDate: '2025-01-01', serviceDaysTarget: 365 }), today);
    assert.equal(derived.holdingDays, 101);
    assert.equal(derived.overdueDays, 0);
    assert.ok(Math.abs(derived.usageProgress - 101 / 365) < 1e-9);
    assert.equal(derived.usageRatio, derived.usageProgress);
  });

  it('超标：进度封顶 1，但 usageRatio / overdueDays 如实给出', () => {
    const today = kit.parseDay('2025-01-11'); // 11 天
    const derived = kit.deriveItem(item({ buyDate: '2025-01-01', serviceDaysTarget: 10 }), today);
    assert.equal(derived.usageProgress, 1);
    assert.equal(derived.usageRatio, 1.1);
    assert.equal(derived.overdueDays, 1);
  });

  it('目标留空走默认 1095 天', () => {
    const today = kit.parseDay('2025-01-02');
    assert.equal(kit.deriveItem(item({ buyDate: '2025-01-01' }), today).serviceDaysTarget, kit.DEFAULT_SERVICE_DAYS);
  });
});

describe('保值率只用真数字，不用 0 冒充「没算」', () => {
  it('未卖出 → null', () => {
    assert.equal(kit.deriveItem(item(), kit.parseDay('2025-02-01')).retentionRate, null);
  });

  it('已卖出 → soldPrice / buyPrice', () => {
    const derived = kit.deriveItem(
      item({ buyPrice: 1000, buyDate: '2025-01-01', soldDate: '2025-06-01', soldPrice: 620 }),
      kit.parseDay('2026-01-01'),
    );
    assert.equal(derived.retentionRate, 0.62);
  });

  it('买入价为 0 时不做除法（宁可 null）', () => {
    const derived = kit.deriveItem(
      item({ buyPrice: 0, buyDate: '2025-01-01', soldDate: '2025-02-01', soldPrice: 10 }),
      kit.parseDay('2025-03-01'),
    );
    assert.equal(derived.retentionRate, null);
  });
});

describe('闲置判定', () => {
  it('最近使用日距今 ≥ 阈值 → idle', () => {
    const today = kit.parseDay('2025-06-01');
    const derived = kit.deriveItem(item({ buyDate: '2025-01-01', lastUsedAt: '2025-03-01' }), today);
    assert.equal(derived.idleDays, 92);
    assert.equal(derived.status, 'idle');
  });

  it('刚好卡在阈值前一天 → 仍是 serving（阈值本身归闲置）', () => {
    const today = kit.parseDay('2025-06-01');
    assert.equal(kit.deriveItem(item({ buyDate: '2025-01-01', lastUsedAt: '2025-03-04' }), today).status, 'serving'); // 89 天
    assert.equal(kit.deriveItem(item({ buyDate: '2025-01-01', lastUsedAt: '2025-03-03' }), today).status, 'idle'); // 90 天
  });

  it('从没记过使用 → 从买入日起算（买了就吃灰也算闲置）', () => {
    const today = kit.parseDay('2025-06-01');
    assert.equal(kit.deriveItem(item({ buyDate: '2025-01-01' }), today).idleDays, 151);
  });

  it('已卖出优先于闲置', () => {
    const derived = kit.deriveItem(
      item({ buyDate: '2024-01-01', soldDate: '2025-01-01', soldPrice: 100 }),
      kit.parseDay('2025-06-01'),
    );
    assert.equal(derived.status, 'sold');
  });

  it('阈值可配（不用字面量）', () => {
    const derived = kit.deriveItem(item({ buyDate: '2025-01-01', lastUsedAt: '2025-05-01' }), kit.parseDay('2025-06-01'), {
      idleWarnDays: 10,
    });
    assert.equal(derived.status, 'idle');
  });
});

describe('汇总：状态计数、净投入、闲置损耗、保值率', () => {
  const today = kit.parseDay('2025-06-01');
  const rows = [
    kit.rowOf(item({ id: 'dl-a-aa', name: '在用', buyPrice: 1000, buyDate: '2025-05-01', lastUsedAt: '2025-05-30', category: '数码' }), today),
    kit.rowOf(item({ id: 'dl-b-bb', name: '吃灰', buyPrice: 2000, buyDate: '2025-01-01', lastUsedAt: '2025-01-02', category: '家电' }), today),
    kit.rowOf(item({ id: 'dl-c-cc', name: '卖掉了', buyPrice: 500, buyDate: '2024-01-01', soldDate: '2025-01-01', soldPrice: 400 }), today),
  ];
  const stats = kit.summarize(rows);

  it('状态三分与净值', () => {
    assert.equal(stats.count, 3);
    assert.equal(stats.servingCount, 1);
    assert.equal(stats.idleCount, 1);
    assert.equal(stats.soldCount, 1);
    assert.equal(stats.netSpend, 3100, '买入 3500 - 回收 400');
    assert.equal(stats.soldValue, 400);
  });

  it('日常损耗只算在用/闲置，闲置单独列一份', () => {
    assert.ok(stats.dailyTotal > stats.idleBurn);
    assert.ok(stats.idleBurn > 0);
  });

  it('全局保值率 = Σ卖出 / Σ买入（只算已卖出那批）', () => {
    assert.equal(stats.retentionRate, 0.8);
  });

  it('分类分布按价值排序，未分类归入「其他」', () => {
    assert.deepEqual(stats.byCategory.map((bucket) => bucket.category), ['家电', '数码', '其他']);
  });

  it('榜单条数受 top 控制', () => {
    assert.equal(kit.summarize(rows, { top: 1 }).topDaily.length, 1);
  });

  it('NaN 不污染汇总（safeSum 兜底）', () => {
    const broken = kit.rowOf(item({ buyPrice: Number.NaN, buyDate: '2025-05-01' }), today);
    const mixed = kit.summarize([broken, ...rows]);
    assert.ok(Number.isFinite(mixed.netSpend));
    assert.equal(mixed.netSpend, 3100, 'NaN 当 0，而不是把整笔账变成 NaN');
  });
});

describe('校验与归一（所有写路径的必经之路）', () => {
  const today = kit.parseDay('2025-06-01');

  it('必填：name / buyPrice / buyDate', () => {
    const result = kit.validateItem({}, today);
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 3);
  });

  it('buyPrice 必须是 ≥ 0 的有限数', () => {
    assert.equal(kit.validateItem({ name: 'x', buyPrice: -1, buyDate: '2025-01-01' }, today).ok, false);
    assert.equal(kit.validateItem({ name: 'x', buyPrice: 0, buyDate: '2025-01-01' }, today).ok, true);
  });

  it('日期形状与未来日期都被挡住', () => {
    assert.match(kit.validateItem({ name: 'x', buyPrice: 1, buyDate: '2025-1-1' }, today).errors.join('|'), /YYYY-MM-DD/);
    assert.match(kit.validateItem({ name: 'x', buyPrice: 1, buyDate: '2025-12-01' }, today).errors.join('|'), /未来/);
    assert.equal(kit.validateItem({ name: 'x', buyPrice: 1, buyDate: '2025-02-30' }, today).ok, false, '不存在的日历日也要挡住');
  });

  it('soldDate / soldPrice 必须成对', () => {
    assert.match(kit.validateItem({ name: 'x', buyPrice: 1, buyDate: '2025-01-01', soldDate: '2025-02-01' }, today).errors.join('|'), /soldPrice/);
    assert.match(kit.validateItem({ name: 'x', buyPrice: 1, buyDate: '2025-01-01', soldPrice: 100 }, today).errors.join('|'), /soldDate/);
    assert.equal(kit.validateItem({ name: 'x', buyPrice: 1, buyDate: '2025-01-01', soldDate: '2025-02-01', soldPrice: 100 }, today).ok, true);
  });

  it('卖出日不能早于买入日', () => {
    const result = kit.validateItem({ name: 'x', buyPrice: 1, buyDate: '2025-03-01', soldDate: '2025-02-01', soldPrice: 1 }, today);
    assert.match(result.errors.join('|'), /不能早于 buyDate/);
  });

  it('可空字段统一归一成 null（不是空串）', () => {
    const result = kit.validateItem({ name: 'x', buyPrice: 1, buyDate: '2025-01-01', category: '  ', note: '', imagePath: '  ' }, today);
    assert.equal(result.ok, true);
    assert.equal(result.value.category, null);
    assert.equal(result.value.note, null);
    assert.equal(result.value.imagePath, null);
  });

  it('name 长度上限 40 字', () => {
    const long = 'x'.repeat(41);
    assert.equal(kit.validateItem({ name: long, buyPrice: 1, buyDate: '2025-01-01' }, today).ok, false);
  });

  it('serviceDaysTarget 必须是正数', () => {
    assert.equal(kit.validateItem({ name: 'x', buyPrice: 1, buyDate: '2025-01-01', serviceDaysTarget: 0 }, today).ok, false);
    assert.equal(kit.validateItem({ name: 'x', buyPrice: 1, buyDate: '2025-01-01', serviceDaysTarget: '365' }, today).ok, true);
  });
});

describe('日期工具', () => {
  it('parseDay 走本地日历日，不是 UTC', () => {
    const at = kit.parseDay('2025-08-12');
    assert.equal(kit.formatDay(at), '2025-08-12');
    assert.equal(new Date(at).getHours(), 0);
  });

  it('parseDay 拒绝非法输入', () => {
    for (const bad of ['', '2025/08/12', '2025-13-01', '2025-02-30', 20250812, null]) {
      assert.equal(kit.parseDay(bad), null, String(bad));
    }
  });

  it('daysBetween 按日历日差（同一天 0，跨一天 1）', () => {
    assert.equal(kit.daysBetween(kit.parseDay('2025-01-01'), kit.parseDay('2025-01-01')), 0);
    assert.equal(kit.daysBetween(kit.parseDay('2025-01-01'), kit.parseDay('2025-01-02')), 1);
  });

  it('todayStart 归零到当天零点', () => {
    const at = kit.todayStart(Date.now());
    assert.equal(kit.formatDay(at), kit.formatDay(Date.now()));
    assert.equal(new Date(at).getHours(), 0);
  });
});
