import { mkdir, readFile, readdir } from 'node:fs/promises';
import { writeFile } from '../util/fs.js';
import { join } from 'node:path';
import type { KnowledgeItem } from '../types.js';

/**
 * 条目文件名的形状 = `newId() + '.json'`（`util/time.ts`：`ts-<base36 时间>-<2 位随机>.json`）。
 *
 * 为什么要按名字先过滤（实测 2026-10-07）：`dataRoot` 里同时住着 `graph.json`（**3.64 MB**）、
 * `graph-events.json`（295 KB）、`status.json`、`mount-diag.json` 这些**非条目**状态文件，旧实现把
 * 每个 `.json` 都 `JSON.parse` 一遍再靠 `typeof parsed.id === 'string'` 丢掉 —— 也就是每轮捕获
 * 都白读白解 3.6 MB，只为得出「它不是条目」。
 *
 * 代价要说清楚：以后若改了 `newId()` 的格式而这条正则没同步，就会**静默漏掉全部条目**。
 * `test/core.test.mjs` 有一条断言把 `newId() + '.json'` 钉在这个形状上。
 */
export const ENTRY_FILE_RE = /^ts-[0-9a-z]+-[0-9a-z]{2}\.json$/;

/**
 * 一条知识一个 JSON 文件，冲突另存 conflicts/ 子目录（双版本保留，不静默合并）。
 *
 * 这里**没有**缓存、没有 watcher、没有定时器：索引在需要时从磁盘重建。
 * 千条量级的 readdir + JSON.parse 是几十毫秒级（R-201），先不上增量机制。
 */
export class KnowledgeStore {
  constructor(private readonly root: string) {}

  get conflictsRoot(): string {
    return join(this.root, 'conflicts');
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await mkdir(this.conflictsRoot, { recursive: true });
  }

  async loadAll(): Promise<KnowledgeItem[]> {
    const files = await readdir(this.root).catch(() => [] as string[]);
    const items: KnowledgeItem[] = [];
    for (const f of files) {
      if (!ENTRY_FILE_RE.test(f)) continue;
      try {
        const raw = await readFile(join(this.root, f), 'utf8');
        const parsed = JSON.parse(raw) as KnowledgeItem;
        if (parsed && typeof parsed.id === 'string') items.push(parsed);
      } catch {
        // 单个文件撕裂或手改坏了，不能让整个索引挂掉。
      }
    }
    return items;
  }

  async save(item: KnowledgeItem): Promise<void> {
    await this.init();
    await writeFile(join(this.root, item.id + '.json'), JSON.stringify(item, null, 2) + '\n', 'utf8');
  }

  /** 冲突记录返回文件名，便于在日志/工具输出里指认。 */
  async saveConflict(payload: unknown): Promise<string> {
    await this.init();
    const id = 'conflict-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    await writeFile(join(this.conflictsRoot, id + '.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
    return id;
  }
}