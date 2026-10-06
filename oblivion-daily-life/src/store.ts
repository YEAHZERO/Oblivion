/**
 * 有数（@oblivion/daily-life）· 账本存储层。
 *
 * 落盘形状（**单文件**，按冻结规格）：
 *
 *   ~/.oblivion/daily-life/assets.json
 *   { "version": 1, "updatedAt": "2026-10-06T23:30:00.000Z", "items": [ … ] }
 *
 * ## 为什么是单文件
 *
 * 规格冻结的就是单文件：账本要能**整份拷走/整份 diff**（换机器、进 git、发给别人），
 * 一件一个文件时「备份」就变成「拷一个目录」。代价是每次写都要整份重写 ——
 * 条目量级（家庭物品几百件、上限 `maxItems: 2000`）下这个代价可以忽略。
 * `@oblivion/core` 的知识库相反（一件一文件），因为它的条目是模型自动增长的；
 * 这里的条目是用户手填的，性质不同，取舍也就不同。
 *
 * ## 原子写与 Windows 的 EPERM
 *
 * 写临时文件再 `rename` 是标准做法，但**在 Windows 上 rename 会因瞬时占用
 * （杀软 / 索引器 / 另一个进程刚打开过目标）报 `EPERM: operation not permitted`**
 * —— `@oblivion/core` 在真实知识库里踩过两次。这里从一开始就带回退：
 * rename 失败 → 删临时文件 → 直接写目标（丢原子性、保内容）。
 *
 * ## 坏文件不静默吞掉
 *
 * `assets.json` 解析失败时**不覆盖**它：先把它改名成
 * `assets.json.corrupt-<时间戳>` 留底，再以空账本继续，并把这件事报给上层
 * （`loadError` 会出现在 `GET /daily-life/status` 里）。用户手改过 JSON 的话，
 * 那份残骸就是他唯一的线索，不能顺手删掉。
 */

import { mkdir, readFile, rename, unlink, writeFile as nodeWriteFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Category, Item } from './metrics.js';

/** 账本文件格式版本（将来迁移用；现在只有 1）。 */
export const LEDGER_VERSION = 1;

/** 条目 id：`dl-<base36 时间>-<2 位随机>`。 */
export function newItemId(at: number = Date.now()): string {
  const rand = Math.random().toString(36).slice(2, 4).padEnd(2, '0');
  return 'dl-' + at.toString(36) + '-' + rand;
}

/**
 * id 形状白名单。
 *
 * 单文件账本里 id 不再是文件名，但它**仍然是 Map 的键**（UI 选行、写回、删除都靠它），
 * 所以照旧收紧：只认自己生成的形状，不接受外部传入的任意字符串。
 */
export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && /^dl-[a-z0-9]{1,12}-[a-z0-9]{2}$/.test(id);
}

/** 原子写文本；`rename` 失败时退回直接写（见文件头「原子写与 Windows 的 EPERM」）。 */
export async function writeTextAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const stamp = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
  const tmp = join(dirname(path), '.' + process.pid + '-' + stamp + '.tmp');
  await nodeWriteFile(tmp, text, 'utf8');
  try {
    await rename(tmp, path);
  } catch {
    await unlink(tmp).catch(() => undefined);
    await nodeWriteFile(path, text, 'utf8');
  }
}

export interface LoadResult {
  items: Item[];
  /** 账本文件解析失败时的说明（已把残骸改名留底）。 */
  loadError: string | null;
  /** 被跳过的条目数（形状不合法，例如用户手改坏了某一条）。 */
  skipped: number;
}

export interface LedgerStore {
  /** 账本文件的绝对路径。 */
  file: string;
  load(): Promise<LoadResult>;
  save(items: Item[]): Promise<void>;
}

/** 一条记录「像不像物品」（磁盘文件是用户可手改的，绝不能信形状）。 */
function asItem(raw: unknown): Item | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  const name = typeof record.name === 'string' ? record.name : '';
  const buyDate = typeof record.buyDate === 'string' ? record.buyDate : '';
  if (!isSafeId(id) || name === '' || buyDate === '') return null;
  const nullable = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);
  const numberOrNull = (value: unknown): number | null => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null);
  return {
    id,
    name,
    buyPrice: Number.isFinite(Number(record.buyPrice)) ? Number(record.buyPrice) : 0,
    buyDate,
    category: nullable(record.category) as Category | null,
    serviceDaysTarget: numberOrNull(record.serviceDaysTarget),
    soldDate: nullable(record.soldDate),
    soldPrice: numberOrNull(record.soldPrice),
    lastUsedAt: nullable(record.lastUsedAt),
    useCount: numberOrNull(record.useCount),
    note: nullable(record.note),
    imagePath: nullable(record.imagePath),
    createdAt: Number.isFinite(Number(record.createdAt)) ? Number(record.createdAt) : 0,
    updatedAt: Number.isFinite(Number(record.updatedAt)) ? Number(record.updatedAt) : 0,
  };
}

export function createLedgerStore(dataFile: string): LedgerStore {
  return {
    file: dataFile,

    async load(): Promise<LoadResult> {
      let rawText: string;
      try {
        rawText = await readFile(dataFile, 'utf8');
      } catch {
        // 还没建账本：空账本，不是错误。
        return { items: [], loadError: null, skipped: 0 };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch (error) {
        // 残骸留底，绝不覆盖。
        const keep = dataFile + '.corrupt-' + Date.now().toString(36);
        await rename(dataFile, keep).catch(() => undefined);
        return { items: [], loadError: `${String(error)}（原文件已留底为 ${keep}）`, skipped: 0 };
      }

      const list = Array.isArray(parsed) ? parsed : ((parsed as Record<string, unknown> | null)?.items ?? []);
      const items: Item[] = [];
      let skipped = 0;
      for (const entry of Array.isArray(list) ? list : []) {
        const item = asItem(entry);
        if (item === null) skipped += 1;
        else items.push(item);
      }
      return {
        items: items.sort((left, right) => right.createdAt - left.createdAt),
        loadError: null,
        skipped,
      };
    },

    async save(items: Item[]): Promise<void> {
      const payload = {
        version: LEDGER_VERSION,
        updatedAt: new Date().toISOString(),
        items,
      };
      await writeTextAtomic(dataFile, JSON.stringify(payload, null, 2) + '\n');
    },
  };
}

/** 把校验过的字段落到一条记录上（新建或就地更新；`null` 字段是真被清掉了）。 */
export function applyChecked(
  existing: Item | undefined,
  checked: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>,
  now: number = Date.now(),
): Item {
  return {
    ...checked,
    id: existing?.id ?? newItemId(now),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
