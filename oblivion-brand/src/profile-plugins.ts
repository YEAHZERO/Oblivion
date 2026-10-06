/**
 * 读 profile 目录，产出「个人已安装插件」清单（宿主半边）。
 *
 * 数据源只有两个文件，都是**事实来源**（不猜、不缓存）：
 *   - `<profileDir>/package.json` 的 `dependencies`（谁被装了、装的是什么规格）
 *     与 `dsh.profile.bundles`（谁会被按 bundle 激活）；
 *   - `<profileDir>/cordis.patch.yml`（谁被补丁行挂载 —— `@oblivion/core`、
 *     `@oblivion/panel` 就是这样进来的，它们不出现在 `bundles` 里）。
 *
 * 「已启用」的判据 = `bundled || patched`：只装了依赖但既不在 bundles 里、
 * 也没有补丁行的包，宿主**不会**加载它（实测样本：`dsh-creator-mode-plus`、
 * `dsh-whale-widget`）。面板把这种显示成「已装未启用」，避免误以为在跑。
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { restoreCommand, type InstalledPlugin, type PluginListPayload } from './plugin-list.js';

/** profile 的名字与目录。 */
export interface ProfileLocation {
  readonly profile: string;
  readonly dir: string;
}

function text(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 从环境变量定位 profile 目录。
 *
 * 优先 `DSH_PROFILE_DIR`（宿主直接给的就是绝对路径）；否则用
 * `DSH_HOME`（或调用方给的 `homeDir`）拼 `profiles/<DSH_PROFILE 或 desktop>`。
 * 两者都没有则返回 `null` —— 调用方据此报「找不到 profile 目录」而不是读错地方。
 */
export function resolveProfile(
  env: Readonly<Record<string, string | undefined>>,
  homeDir: string,
): ProfileLocation | null {
  const explicitDir = text(env['DSH_PROFILE_DIR']);
  const explicitProfile = text(env['DSH_PROFILE']);
  if (explicitDir !== '') {
    return { profile: explicitProfile !== '' ? explicitProfile : basename(explicitDir), dir: explicitDir };
  }
  const home = text(env['DSH_HOME']);
  const base = home !== '' ? home : homeDir !== '' ? join(homeDir, '.dsh') : '';
  if (base === '') return null;
  const profile = explicitProfile !== '' ? explicitProfile : 'desktop';
  return { profile, dir: join(base, 'profiles', profile) };
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8')) as unknown;
}

function findDependencies(parsed: unknown): Array<[string, string]> {
  if (parsed === null || typeof parsed !== 'object') return [];
  const dependencies: unknown = (parsed as Record<string, unknown>)['dependencies'];
  if (dependencies === null || typeof dependencies !== 'object') return [];
  const pairs: Array<[string, string]> = [];
  for (const [name, spec] of Object.entries(dependencies as Record<string, unknown>)) {
    if (typeof spec === 'string') pairs.push([name, spec]);
  }
  return pairs;
}

function findBundles(parsed: unknown): string[] {
  if (parsed === null || typeof parsed !== 'object') return [];
  const dsh: unknown = (parsed as Record<string, unknown>)['dsh'];
  if (dsh === null || typeof dsh !== 'object') return [];
  const profile: unknown = (dsh as Record<string, unknown>)['profile'];
  if (profile === null || typeof profile !== 'object') return [];
  const bundles: unknown = (profile as Record<string, unknown>)['bundles'];
  if (!Array.isArray(bundles)) return [];
  return bundles.filter((item): item is string => typeof item === 'string');
}

/** bundles 里可能写成 `name@1.2.3`，因此不能只用 `has(name)` 判定。 */
function isBundled(bundles: readonly string[], name: string): boolean {
  return bundles.some((item) => item === name || item.startsWith(`${name}@`));
}

function installedVersion(dir: string, name: string): string | null {
  const file = join(dir, 'node_modules', name, 'package.json');
  if (!existsSync(file)) return null;
  try {
    const parsed = readJson(file);
    if (parsed !== null && typeof parsed === 'object') {
      const version: unknown = (parsed as Record<string, unknown>)['version'];
      if (typeof version === 'string' && version !== '') return version;
    }
  } catch {
    // 装坏了/半装状态都可能读不出来：版本只是辅助信息，不值得让整份清单失败。
  }
  return null;
}

/** 本地链接（`link:`/`file:`/`workspace:`）与 npm 规格的重装方式不同，要分开展示。 */
function kindOf(spec: string): InstalledPlugin['kind'] {
  return /^(link|file|workspace):/.test(spec) ? 'link' : 'npm';
}

/**
 * 读出一份清单。**只读磁盘，不写任何东西**（面板每次打开都会拉一次，不能带副作用）。
 */
export function readInstalledPlugins(location: ProfileLocation, at: number = Date.now()): PluginListPayload {
  const problems: string[] = [];
  const profileFile = join(location.dir, 'package.json');
  let dependencies: Array<[string, string]> = [];
  let bundles: string[] = [];

  if (!existsSync(profileFile)) {
    problems.push(`profile 目录里没有 package.json：${profileFile}`);
  } else {
    try {
      const parsed = readJson(profileFile);
      dependencies = findDependencies(parsed);
      bundles = findBundles(parsed);
    } catch (error) {
      problems.push(`package.json 解析失败：${describe(error)}`);
    }
  }

  const patchFile = join(location.dir, 'cordis.patch.yml');
  let patchText = '';
  if (existsSync(patchFile)) {
    try {
      patchText = readFileSync(patchFile, 'utf8');
    } catch (error) {
      problems.push(`cordis.patch.yml 读不到：${describe(error)}`);
    }
  }

  const entries: InstalledPlugin[] = dependencies
    .map(([name, spec]): InstalledPlugin => {
      const bundled = isBundled(bundles, name);
      // 补丁文件里出现的包名 = 被 insert 行挂载。用 contains 而不是精确解析 YAML：
      // 补丁文件是宿主的格式，本插件只需一个「这个包有没有被写进去」的显示判据，
      // 解析失败时要退化成「没挂载」而不是抛错（清单宁可少标，不可整份失败）。
      const patched = patchText.includes(name);
      return {
        name,
        spec,
        kind: kindOf(spec),
        version: installedVersion(location.dir, name),
        bundled,
        patched,
        active: bundled || patched,
        restore: restoreCommand(location.profile, spec),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

  return {
    profile: location.profile,
    profileDir: location.dir,
    generatedAt: at,
    entries,
    problems,
  };
}
