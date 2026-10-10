/**
 * @oblivion/http-bridge · 请求体读取。
 *
 * 有界读取：超过上限立即断开，不让一个恶意请求把内存吃光。
 * 同时校验 UTF-8 合法性 —— 非法字节序列应该报 400 而不是被静默替换。
 */

import type { IncomingMessage } from 'node:http';

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/**
 * 读取请求体，返回 UTF-8 字符串。
 *
 * @throws {HttpError} 超限 413 / 非 UTF-8 400
 */
export function readBody(request: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    request.on('data', (chunk: Buffer) => {
      if (settled) return;
      total += chunk.length;
      if (total > maxBytes) {
        // 停止接收并断开，不给攻击者继续写的机会
        request.destroy();
        fail(new HttpError(413, 'request body too large'));
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      if (settled) return;
      settled = true;
      const buffer = Buffer.concat(chunks);
      try {
        // fatal: true —— 非法 UTF-8 直接抛，而不是替换成 U+FFFD
        resolve(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
      } catch {
        reject(new HttpError(400, 'body is not valid UTF-8'));
      }
    });

    request.on('error', (error: Error) => fail(error));
    request.on('aborted', () => fail(new HttpError(400, 'request aborted')));
  });
}
