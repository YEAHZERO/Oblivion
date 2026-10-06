/**
 * @oblivion/panel — Node 半边（宿主侧）。
 *
 * 只做两件事，都不碰认知逻辑：
 *
 *   ① **留座与自证**：给 Cordis Loader 一个可挂载入口，写启动标记
 *      `console.log('[oblivion-panel] loaded')`（与 dshx.yml 的 marker 逐字相同），
 *      并落一份 `%TEMP%\oblivion-panel\host-mount.json` 自证据文件。
 *   ② **只读数据面**：注册 `GET /oblivion-panel/status`，把 `@oblivion/core`
 *      落在磁盘上的观测数据（`status.json` / `decisions.jsonl` / `ts-*.json` / `01_问答沉淀/`）
 *      装配成一个 JSON 给浏览器半边渲染。
 *
 * ## 安全边界
 *
 *   - **只读**：没有任何写路径，也不接受用户输入拼路径（路径全部来自本插件 config）；
 *   - 只接受 GET，其它方法 405；响应 `cache-control: no-store`；
 *   - 读入有上限（单 JSON 256 KB、jsonl 2 MB、每类最多 50 条），不会因为数据长大而拖垮页面；
 *   - 内容只有：版本、计数、拦截原因、条目标题与路径 —— **不含会话原文**。
 *
 * ## 为什么不让浏览器半边直接读文件
 *
 * 浏览器半边没有 fs 权限。要么走宿主路由（本文件），要么依赖第三方 Remote 约定；
 * 前者是本仓已验证的做法（`@oblivion/vimc` 的诊断路由同一套 `webServer.register`）。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildSnapshot } from './snapshot.js';

/** 与 dshx.yml 的 marker 逐字相同。 */
export const name = '@oblivion/panel';

/** 浏览器半边不需要宿主服务；Node 半边用 webServer 挂路由。 */
export const inject: string[] = [];

export const VERSION = '0.0.1';

interface Config {
  readonly dataRoot: string;
  readonly fallbackMdRoot: string;
  readonly recentLimit: number;
  readonly routePath: string;
  readonly logPrefix: string;
}

const DEFAULT_CONFIG: Config = {
  dataRoot: '~/.oblivion/data',
  fallbackMdRoot: 'C:/Library/那些渐渐被遗忘',
  recentLimit: 10,
  routePath: '/oblivion-panel/status',
  logPrefix: '[oblivion-panel]',
};

interface RouteScope {
  webServer?: {
    register(route: {
      kind: 'exact';
      path: string;
      handler: (request: IncomingMessage, response: ServerResponse) => void;
    }): unknown;
  };
}

interface HostCtx {
  inject?(deps: readonly string[], callback: (scope: RouteScope) => void): unknown;
  logger?: { warn?: (...args: unknown[]) => void; info?: (...args: unknown[]) => void };
}

/** `~` 展开：Host 的 cwd 不可假定，必须自己展开。 */
export function expandHome(value: string): string {
  if (!value) return homedir();
  if (value === '~') return homedir();
  if (value.startsWith('~/') || value.startsWith('~\\')) return join(homedir(), value.slice(2));
  return isAbsolute(value) ? value : resolve(value);
}

function asConfig(raw?: Partial<Config>): Config {
  return { ...DEFAULT_CONFIG, ...(raw ?? {}) };
}

/** 自证据文件：证明 Node 半边真的被装载过（dshx 验证面在本机不可用，见 WORKSPACE.md）。 */
function writeMountEvidence(warn: (message: string) => void): void {
  try {
    const dir = process.env.OBLIVION_PANEL_EVIDENCE_DIR || join(process.env.TEMP || process.env.TMP || '.', 'oblivion-panel');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'host-mount.json'),
      JSON.stringify({ plugin: name, version: VERSION, mountedAt: new Date().toISOString(), pid: process.pid }, null, 2) + '\n',
      'utf8',
    );
  } catch (error) {
    warn(`自证据文件写入失败：${String(error)}`);
  }
}

function installStatusRoute(ctx: HostCtx, config: Config, warn: (message: string) => void): void {
  if (typeof ctx.inject !== 'function') {
    warn('上下文没有 inject：只读数据面未挂载（浏览器半边仍会尝试注册面板 tab）');
    return;
  }
  ctx.inject(['webServer'], (scope) => {
    const server = scope.webServer;
    if (server === undefined || typeof server.register !== 'function') {
      warn('webServer 不可用：只读数据面未挂载');
      return;
    }
    const dataRoot = expandHome(config.dataRoot);
    server.register({
      kind: 'exact',
      path: config.routePath,
      handler: (request, response) => {
        if (request.method !== 'GET') {
          response.writeHead(405, { allow: 'GET', 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: 'method not allowed' }));
          return;
        }
        void buildSnapshot({
          dataRoot,
          recentLimit: config.recentLimit,
          fallbackMdRoot: config.fallbackMdRoot,
        })
          .then((snapshot) => {
            response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
            response.end(JSON.stringify({ ...snapshot, panelVersion: VERSION }));
          })
          .catch((error: unknown) => {
            warn(`快照装配失败：${String(error)}`);
            response.writeHead(500, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ ok: false, error: 'snapshot failed' }));
          });
      },
    });
  });
}

export function apply(rawCtx: unknown, rawConfig?: Partial<Config>): void {
  const ctx = rawCtx as HostCtx;
  const config = asConfig(rawConfig);
  const warn = (message: string): void => {
    ctx.logger?.warn?.(config.logPrefix + ' ' + message);
  };

  installStatusRoute(ctx, config, warn);
  writeMountEvidence(warn);

  ctx.logger?.info?.(config.logPrefix + ' 只读数据面：GET %s（dataRoot=%s）', config.routePath, expandHome(config.dataRoot));
  console.log('[oblivion-panel] loaded');
}
