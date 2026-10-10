/**
 * @oblivion/http-bridge · 鉴权。
 *
 * 三道门：
 *   1. 回环地址 —— 防局域网/公网访问（知识库是私人数据）；
 *   2. `Authorization: Bearer <token>` —— 防本机其它程序；
 *   3. 常量时间比较 —— 防时序侧信道。
 *
 * `::ffff:127.0.0.1` 必须在回环白名单里：Windows 上 Node 常把 IPv4
 * 映射成 IPv6 形式，漏了它会导致本机请求全部 401（实测踩过）。
 *
 * 与 0.1.0 版本的差异：token 不再走 `ctx.credentials`，改为**直接读环境变量**。
 * 理由：`credentials` 是 DSH 的内部服务，声明它会让本包在缺少该服务的组合里
 * 停在 pending；而桥接只需要「一个启动时确定的字符串」。环境变量由 DSH 启动脚本
 * 或系统环境提供，依赖面最小。
 */

import { readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';

export interface AuthVerdict {
  ok: boolean;
  /** 失败时的 HTTP 状态码；成功时无意义。 */
  status: number;
  /** 失败原因（写日志用，不回给客户端）。 */
  reason: string;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** 规范化远端地址：去掉端口与方括号。 */
export function normalizeAddress(value: unknown): string {
  const raw = String(value ?? '');
  if (raw === '') return '';
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    return end >= 0 ? raw.slice(1, end) : raw;
  }
  const lastColon = raw.lastIndexOf(':');
  // IPv4 带端口：只有一个冒号
  if (lastColon > 0 && raw.indexOf(':') === lastColon) return raw.slice(0, lastColon);
  return raw;
}

export function isLoopbackRequest(request: IncomingMessage): boolean {
  return LOOPBACK.has(normalizeAddress(request.socket?.remoteAddress));
}

/**
 * 常量时间字符串比较。
 *
 * 先比长度会泄漏长度信息，但 token 长度本身就是公开的（Base64 定长），
 * 所以这里保留长度短路，只保证**逐字符比较不提前返回**。
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 从请求头里取出 Bearer token；缺失返回空串。 */
export function bearerFrom(request: IncomingMessage): string {
  const raw = request.headers?.authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return '';
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match === null ? '' : match[1].trim();
}

/** 校验请求是否被授权。 */
export function checkAuth(
  request: IncomingMessage,
  token: string,
  requireLoopback = true,
): AuthVerdict {
  if (requireLoopback && !isLoopbackRequest(request)) {
    return { ok: false, status: 401, reason: 'non-loopback origin' };
  }
  if (token === '') {
    return { ok: false, status: 503, reason: 'bridge token unavailable' };
  }
  const presented = bearerFrom(request);
  if (presented === '' || !safeEqual(presented, token)) {
    return { ok: false, status: 401, reason: 'invalid token' };
  }
  return { ok: true, status: 200, reason: '' };
}

/**
 * 读取 token，**按优先级链**依次尝试三条来源：
 *
 *   1. `direct`   —— 配置里直接给的字符串（最高优先级）
 *   2. `filePath` —— 凭据文件（读整个文件，去首尾空白；文件不存在视为「没给」）
 *   3. `envName`  —— 环境变量名（最低优先级，向后兼容）
 *
 * ## 为什么要有前两条（2026-10-06 实测）
 *
 * 原实现只有第 3 条。踩到的坑：**宿主的进程环境是它启动那一刻的快照**。
 * 用户级环境变量在宿主启动之后才设、或宿主从更早的父进程继承了旧环境时，
 * `process.env[name]` 就是空的。而 bridge 的 `apply()` 一旦读到空 token
 * 会**直接 return 不监听端口** —— 症状是「端口不开、无错误、只有一行 info」，
 * 极难定位。对一个「必须稳定监听固定端口」的服务来说，把启动条件押在
 * 环境继承上是不成立的假设。
 *
 * 三条来源都是**每个请求读一次**，所以运行期改文件无需重启。
 */
export function readToken(
  direct: string,
  filePath: string,
  envName: string,
): string {
  // ① 直给
  if (direct !== '') return direct;

  // ② 文件：读不到就当没给（不抛 —— 凭据缺失应由鉴权层回 503，而不是让进程崩）
  if (filePath !== '') {
    const fromFile = readTokenFile(filePath);
    if (fromFile !== '') return fromFile;
  }

  // ③ 环境变量
  if (envName === '') return '';
  const value = process.env[envName];
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 从文件读 token：整个文件内容去首尾空白。
 *
 * **不按行读**：token 是 Base64 定长串，不会含换行；按行读反而要处理
 * CRLF/末尾空行等边角。整个文件 trim 一次最不容易出错。
 */
function readTokenFile(path: string): string {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return '';
  }
}
