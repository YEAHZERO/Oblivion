import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { KnowledgeItem } from '../types.js';

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
      if (!f.endsWith('.json')) continue;
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