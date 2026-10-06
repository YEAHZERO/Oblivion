import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * `~` / `~/x` 是配置里的书写便利，Host 的工作目录不可假定，
 * 因此这里必须自己展开，不能依赖 cwd。
 */
export function expandHome(p: string): string {
  const home = homedir();
  if (!p) return home;
  if (p === '~') return home;
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(home, p.slice(2));
  return isAbsolute(p) ? p : resolve(p);
}