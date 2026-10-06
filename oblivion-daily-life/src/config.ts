/**
 * 有数（@oblivion/daily-life）· 宿主侧配置。
 *
 * 默认值就是**冻结规格**里的那一套：数据根 `~/.oblivion/daily-life/assets.json`、
 * 路由 `GET /daily-life/status` + `POST /daily-life/items`。
 * bundle patch（`dsh.bundle.patch.yml`）会**整段替换** config 而不是合并，
 * 所以想改任何一个字段，就把整段 config 一起写全。
 */

import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { IDLE_WARN_DAYS } from './metrics.js';

export interface Config {
  /** 账本文件（单文件 JSON）。 */
  readonly dataFile: string;
  /** 闲置阈值（天）。 */
  readonly idleWarnDays: number;
  /** 读路由。 */
  readonly statusPath: string;
  /** 写路由。 */
  readonly itemsPath: string;
  /** 账本条目上限（防误操作）。 */
  readonly maxItems: number;
  readonly logPrefix: string;
}

export const DEFAULT_CONFIG: Config = {
  dataFile: '~/.oblivion/daily-life/assets.json',
  idleWarnDays: IDLE_WARN_DAYS,
  statusPath: '/daily-life/status',
  itemsPath: '/daily-life/items',
  maxItems: 2000,
  logPrefix: '[oblivion-daily-life]',
};

/** `~` 展开：Host 的 cwd 不可假定，必须自己展开。 */
export function expandHome(value: string): string {
  if (!value) return homedir();
  if (value === '~') return homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2));
  return isAbsolute(value) ? value : resolve(value);
}

export function asConfig(raw?: Partial<Config>): Config {
  return { ...DEFAULT_CONFIG, ...(raw ?? {}) };
}
