import { mkdir, rename, writeFile as nodeWriteFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * **原子写入**（写临时文件 → 同目录 rename）。
 *
 * ## 为什么必须原子
 *
 * 实测事故：`status.json` 被写成「一个完整 JSON 对象 + 另一次写入的碎片」——
 * 根因是同一时刻有两个写者（Host 装载时的快照 + 另一个进程/实例的同名写入），
 * 而 `fs.writeFile` 是**截断 + 覆盖**：先截断到 0，再分块写入，
 * 两个写者交错就会留下半截内容。面板于是报 `SyntaxError: Unexpected non-whitespace character after JSON`。
 *
 * rename 在同一文件系统内是原子的：读者要么看到旧内容，要么看到新内容，**不会看到中间态**。
 * 这对「另一个进程随时会来读」的状态文件（status.json / decisions.jsonl / feedback.json / graph.json）
 * 是硬要求，不是优化。
 */
export async function writeTextAtomic(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), '.' + process.pid + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.tmp');
  await nodeWriteFile(tmp, text, 'utf8');
  await rename(tmp, path);
}

/**
 * core 内部的**默认写盘入口**：与 `node:fs/promises.writeFile` 同名同签名，但走原子路径。
 *
 * 为什么复用这个名字：写盘这件事**不该**让每个调用点都记得「要原子」——2026-10-06 审计发现
 * 只有 `status.json` 接了原子写，其余 8 处（feedback / profile / graph / store / 笔记 / 索引页 /
 * 整理件 / 冲突页）都还是裸 `writeFile`，而它们全是「另一个进程随时会读」的文件。
 * 把安全的那条路设成默认，才不会随下一次改动回退。
 *
 * 唯一**没有**走这里的是追加（`node:fs/promises.appendFile`，留痕每条一行、单次小写入）：
 * 追加要做原子就得读全文再整体重写，代价远大于收益（见 `stats/trace.ts` 的 `record`）。
 * 第三个参数（编码）为兼容既有调用点保留，内容一律按 UTF-8 写。
 */
export async function writeFile(path: string, text: string, _encoding?: string): Promise<void> {
  return writeTextAtomic(path, text);
}

/** 原子写 JSON（自动补尾换行，便于人读）。 */
export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeTextAtomic(path, JSON.stringify(value, null, 2) + '\n');
}

/** 读 JSON；文件不存在或内容损坏都返回 `undefined`（调用方决定怎么解释）。 */
export async function readJsonSafe<T>(path: string): Promise<T | undefined> {
  try {
    const { readFile } = await import('node:fs/promises');
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}
