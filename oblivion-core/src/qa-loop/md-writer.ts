import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { KnowledgeItem } from '../types.js';
import { isoDate } from '../util/time.js';

export type MdAction = 'created' | 'appended' | 'duplicate';

export interface MdPayload {
  action: MdAction;
  item: KnowledgeItem;
  /** 仅 duplicate 分支使用：被补进来的来源。 */
  mergedSource?: { type: string; ref: string };
}

function safeName(topic: string): string {
  return (topic || 'untitled').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
}

/**
 * 新条目渲染。`<!-- oblivion:id=… -->` 是幂等连接键：
 * 同一个 id 重复落盘不会生成第二份。
 */
function renderNew(item: KnowledgeItem): string {
  const tags = item.tags.map((t) => '#' + t).join(' ');
  const sources = item.sources.map((s) => '- `' + s.type + '`: ' + s.ref).join('\n');
  const note = item.content.replace(/\s+/g, ' ').slice(0, 100);
  return [
    '# ' + item.title,
    '',
    '>Date :  ' + isoDate(item.created_at),
    '>Source：Oblivion',
    '>Note：' + note,
    '>Tags： ' + tags,
    '',
    '## 内容',
    '',
    item.content,
    '',
    '## 来源',
    '',
    sources,
    '',
    '<!-- oblivion:id=' + item.id + ' version=' + item.version + ' -->',
    '',
  ].join('\n');
}

function appendSection(existing: string, item: KnowledgeItem): string {
  const parts = item.content.split('\n\n---\n\n');
  const tail = parts[parts.length - 1] ?? '';
  const block = [
    '',
    '## 追加（' + isoDate(item.updated_at) + '）',
    '',
    tail,
    '',
    '<!-- oblivion:append id=' + item.id + ' version=' + item.version + ' -->',
    '',
  ].join('\n');
  const head = existing.replace(/<!-- oblivion:id=.*?-->\n?/g, '').trimEnd();
  return head + '\n\n' + block;
}

function appendSource(existing: string, payload: MdPayload): string {
  if (!payload.mergedSource) return existing;
  const line = '- `' + payload.mergedSource.type + '`: ' + payload.mergedSource.ref + '（重复捕获，仅补来源）';
  if (existing.includes(line)) return existing;
  return existing.trimEnd() + '\n' + line + '\n';
}

/**
 * 写主题笔记。三个分支都以 id 为连接键，因此重放同一次捕获是幂等的。
 * 落盘路径 = mdRoot/10-Topics/<topic>.md —— 与设计书的目录约定一致。
 */
export async function writeMD(root: string, payload: MdPayload): Promise<string> {
  const dir = join(root, '10-Topics');
  await mkdir(dir, { recursive: true });
  const path = join(dir, safeName(payload.item.topic) + '.md');
  const existing = await readFile(path, 'utf8').catch(() => '');

  switch (payload.action) {
    case 'created': {
      if (existing.includes('oblivion:id=' + payload.item.id)) return path;
      const body = existing ? existing.trimEnd() + '\n\n' + renderNew(payload.item) : renderNew(payload.item);
      await writeFile(path, body, 'utf8');
      return path;
    }
    case 'appended':
      await writeFile(path, appendSection(existing, payload.item), 'utf8');
      return path;
    case 'duplicate':
      await writeFile(path, appendSource(existing, payload), 'utf8');
      return path;
  }
}