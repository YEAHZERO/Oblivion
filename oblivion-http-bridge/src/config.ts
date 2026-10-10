/**
 * @oblivion/http-bridge · 配置解析。
 *
 * 与 @oblivion/core 的 config.ts 同风格：导出 DEFAULT_CONFIG，
 * apply() 里做 `{ ...DEFAULT_CONFIG, ...rawConfig }`。
 *
 * **端口固定 42081 是刻意的**（2026-10-06 用户裁定）：
 * DSH 默认每次启动分配随机端口，浏览器扩展里填的 URL 下次就失效。
 * 固定端口后扩展配置一次即可长期使用。
 *
 * **默认 host 是 127.0.0.1 而非 0.0.0.0**：知识库是私人数据，
 * 绝不能让局域网内其他机器访问。
 */

import type { ResolvedConfig } from './types.js';

/** 固定端口。改这里要同步改 DeepSeek++ 扩展里的 URL。 */
export const DEFAULT_PORT = 42081;

/** 仅回环监听。 */
export const DEFAULT_HOST = '127.0.0.1';

/** MCP 端点路径。 */
export const DEFAULT_PATH = '/oblivion/mcp';

/** 请求体上限：1 MB，与现役 shell host 的 native message 上限对齐。 */
export const DEFAULT_MAX_BODY_BYTES = 1_048_576;

/**
 * DeepSeek++ 扩展 ID 白名单。
 *
 * 扩展在 service worker 里发请求（manifest 的 host_permissions 已含 http 通配），
 * 实际上不受 CORS 限制；但预检仍可能发生，这里显式放行。
 * 换扩展/重装扩展后 ID 可能变，届时更新这一项。
 */
export const DEFAULT_ALLOWED_ORIGINS = [
  'chrome-extension://koealbifonogjljlppjngjnaejemdjhp',
];

export const DEFAULT_CONFIG: ResolvedConfig = {
  port: DEFAULT_PORT,
  host: DEFAULT_HOST,
  path: DEFAULT_PATH,
  // 直给与文件默认都为空：默认仍走环境变量，保持向后兼容。
  // 需要绕开环境继承时，在 profile patch 里填这两项之一。
  token: '',
  tokenFile: '',
  tokenEnv: 'OBLIVION_BRIDGE_TOKEN',
  requireLoopback: true,
  maxBodyBytes: DEFAULT_MAX_BODY_BYTES,
  allowedOrigins: DEFAULT_ALLOWED_ORIGINS,
  debug: false,
};

/** 把任意输入收敛成合法配置；非法值回退默认，绝不抛。 */
export function resolveConfig(raw: Partial<ResolvedConfig> | undefined): ResolvedConfig {
  const merged = { ...DEFAULT_CONFIG, ...(raw ?? {}) };
  return {
    port: normalizePort(merged.port),
    host: typeof merged.host === 'string' && merged.host !== '' ? merged.host : DEFAULT_HOST,
    path: normalizePath(merged.path),
    token: typeof merged.token === 'string' ? merged.token.trim() : DEFAULT_CONFIG.token,
    tokenFile: typeof merged.tokenFile === 'string' ? merged.tokenFile.trim() : DEFAULT_CONFIG.tokenFile,
    tokenEnv: typeof merged.tokenEnv === 'string' ? merged.tokenEnv.trim() : DEFAULT_CONFIG.tokenEnv,
    requireLoopback: merged.requireLoopback !== false,
    maxBodyBytes: normalizePositiveInt(merged.maxBodyBytes, DEFAULT_MAX_BODY_BYTES),
    allowedOrigins: Array.isArray(merged.allowedOrigins)
      ? merged.allowedOrigins.filter((value): value is string => typeof value === 'string' && value !== '')
      : DEFAULT_ALLOWED_ORIGINS,
    debug: merged.debug === true,
  };
}

function normalizePort(value: unknown): number {
  const port = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return DEFAULT_PORT;
  return port;
}

function normalizePath(value: unknown): string {
  if (typeof value !== 'string' || value === '') return DEFAULT_PATH;
  const withSlash = value.startsWith('/') ? value : `/${value}`;
  return withSlash.length > 1 && withSlash.endsWith('/') ? withSlash.slice(0, -1) : withSlash;
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return n;
}
