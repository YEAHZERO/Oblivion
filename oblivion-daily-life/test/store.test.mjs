/**
 * 有数（@oblivion/daily-life）· 账本存储层单测（测 lib/ 产物）。
 *
 * 钉的是**坏数据不静默吞掉**：
 *   - 文件不存在 = 空账本（不是错误）；
 *   - JSON 坏了 → 残骸改名留底 + `loadError` 上报，**绝不覆盖**；
 *   - 单条形状不合法 → 计入 `skipped`，其余照常读出来；
 *   - 原子写不留 `.tmp` 残渣；
 *   - id 只认自己生成的形状。
 */

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
let kit;
let tmp;

before(async () => {
  kit = await import(pathToFileURL(join(ROOT, 'lib', 'testkit.js')).href);
});

after(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

function freshFile(name = 'assets.json') {
  if (tmp === undefined) tmp = mkdtempSync(join(tmpdir(), 'oblivion-daily-life-store-'));
  return join(tmp, name);
}

function item(overrides = {}) {
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
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('读账本', () => {
  it('文件不存在 → 空账本，且不是错误', async () => {
    const store = kit.createLedgerStore(freshFile('empty.json'));
    const result = await store.load();
    assert.deepEqual(result, { items: [], loadError: null, skipped: 0 });
  });

  it('save → load 往返（按 createdAt 倒序）', async () => {
    const store = kit.createLedgerStore(freshFile('round.json'));
    await store.save([item({ id: 'dl-old-aa', createdAt: 1 }), item({ id: 'dl-new-bb', createdAt: 2 })]);
    const { items, loadError } = await store.load();
    assert.equal(loadError, null);
    assert.deepEqual(items.map((entry) => entry.id), ['dl-new-bb', 'dl-old-aa']);
  });

  it('落盘形状带 version / updatedAt / items', async () => {
    const file = freshFile('shape.json');
    const store = kit.createLedgerStore(file);
    await store.save([item()]);
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(parsed.version, kit.LEDGER_VERSION);
    assert.equal(typeof parsed.updatedAt, 'string');
    assert.ok(Array.isArray(parsed.items));
  });

  it('裸数组也认（用户手写的文件不该直接报废）', async () => {
    const file = freshFile('array.json');
    writeFileSync(file, JSON.stringify([item({ id: 'dl-raw-cc' })]), 'utf8');
    const { items } = await kit.createLedgerStore(file).load();
    assert.deepEqual(items.map((entry) => entry.id), ['dl-raw-cc']);
  });

  it('JSON 坏了 → 残骸改名留底 + loadError，原文件不被覆盖', async () => {
    const file = freshFile('broken.json');
    writeFileSync(file, '{ 这不是 JSON', 'utf8');
    const store = kit.createLedgerStore(file);
    const result = await store.load();
    assert.equal(result.items.length, 0);
    assert.match(String(result.loadError), /corrupt-/);
    assert.equal(existsSync(file), false, '坏文件必须被改名，而不是留在原地等着被下次写覆盖');
    const backups = readdirSync(tmp).filter((entry) => entry.startsWith('broken.json.corrupt-'));
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(join(tmp, backups[0]), 'utf8'), '{ 这不是 JSON', '留底必须是原文');
  });

  it('单条形状不合法 → 计入 skipped，其余照读', async () => {
    const file = freshFile('partial.json');
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        items: [
          item({ id: 'dl-good-aa' }),
          item({ id: 'dl-good-bb', name: '' }),
          item({ id: 'not-our-id' }),
          'not-an-object',
        ],
      }),
      'utf8',
    );
    const result = await kit.createLedgerStore(file).load();
    assert.deepEqual(result.items.map((entry) => entry.id), ['dl-good-aa']);
    assert.equal(result.skipped, 3);
  });

  it('数字字段被手改成字符串也能读回来（形状过滤而不是抛错）', async () => {
    const file = freshFile('coerce.json');
    writeFileSync(
      file,
      JSON.stringify({ version: 1, items: [{ id: 'dl-coerce-cc', name: 'x', buyDate: '2025-01-01', buyPrice: '120.5', note: '' }] }),
      'utf8',
    );
    const { items } = await kit.createLedgerStore(file).load();
    assert.equal(items[0].buyPrice, 120.5);
    assert.equal(items[0].note, null, '空串归一成 null');
  });
});

describe('原子写', () => {
  it('写完不留 .tmp 残渣，内容与入参一致', async () => {
    const file = freshFile('atomic.json');
    await kit.writeTextAtomic(file, 'hello 有数\n');
    assert.equal(readFileSync(file, 'utf8'), 'hello 有数\n');
    assert.deepEqual(readdirSync(tmp).filter((entry) => entry.endsWith('.tmp')), []);
  });

  it('目录不存在时自己建', async () => {
    const file = join(freshFile('nested'), 'a', 'b', 'assets.json');
    await kit.writeTextAtomic(file, '{}\n');
    assert.equal(existsSync(file), true);
  });
});

describe('id 形状', () => {
  it('newItemId 生成的 id 一律过 isSafeId', () => {
    for (let index = 0; index < 50; index += 1) {
      assert.equal(kit.isSafeId(kit.newItemId(Date.now() + index)), true);
    }
  });

  it('isSafeId 只认自己那套形状', () => {
    for (const good of ['dl-abc123-xy', 'dl-1-zz']) assert.equal(kit.isSafeId(good), true, good);
    for (const bad of ['', 'dl-', 'DL-abc-xy', 'dl-abc-xy-', 'dl-abc-x', 'dl-abc-xyz', '../../etc/passwd', 42, null]) {
      assert.equal(kit.isSafeId(bad), false, String(bad));
    }
  });
});

describe('applyChecked：新建与更新的差别只在 id / createdAt', () => {
  const checked = {
    name: '耳机',
    buyPrice: 999,
    buyDate: '2025-01-01',
    category: null,
    serviceDaysTarget: null,
    soldDate: null,
    soldPrice: null,
    lastUsedAt: null,
    useCount: null,
    note: null,
    imagePath: null,
  };

  it('新建：分配 id，createdAt = now', () => {
    const created = kit.applyChecked(undefined, checked, 1000);
    assert.match(created.id, /^dl-/);
    assert.equal(created.createdAt, 1000);
    assert.equal(created.updatedAt, 1000);
  });

  it('更新：保住 id 与 createdAt，只推进 updatedAt', () => {
    const existing = item({ id: 'dl-keep-aa', createdAt: 111, updatedAt: 111 });
    const updated = kit.applyChecked(existing, { ...checked, name: '换名了' }, 9999);
    assert.equal(updated.id, 'dl-keep-aa');
    assert.equal(updated.createdAt, 111);
    assert.equal(updated.updatedAt, 9999);
    assert.equal(updated.name, '换名了');
  });
});
