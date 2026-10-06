/**
 * 读 profile 目录，产出「个人已安装插件」清单（宿主半边）。
 *
 * 数据源都是**事实来源**（不猜、不缓存）：
 *   - `<profileDir>/package.json` 的 `dependencies`（谁被装了、装的是什么规格）
 *     与 `dsh.profile.bundles`（谁会被按 bundle 激活）；
 *   - `<profileDir>/cordis.patch.yml`（**用户层**补丁：谁被 insert 行挂载，
 *     例如 `@oblivion/vimc`）；
 *   - 每个 bundle 自己 `dsh.bundle.patch` 指向的补丁文件（**组合层**补丁：
 *     例如 `@oblivion/bundle` 的文件里就插了 `@oblivion/core`、`@oblivion/panel`、
 *     `@oblivion/http-bridge`）。
 *
 * 「已启用」的判据 = `bundled || patched`（两层补丁任意一层挂上即算）：
 * 只装了依赖但哪一层都没挂的包，宿主**不会**加载它（实测样本：
 * `dsh-creator-mode-plus`）。面板把这种显示成「已装未启用」，避免误以为在跑。
 *
 * ⚠️ 2026-10-06 修正：早先只扫用户层补丁，于是把由 `@oblivion/bundle` 的
 * **组合层**补丁挂上的 core / panel 误标成「已装未启用」（而它们的路由当时
 * 正在正常响应）——「清单说没跑、实际在跑」比不显示更坏，所以这里必须扫全。
 */

import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  restoreCommand,
  type InstalledPlugin,
  type PluginLayer,
  type PluginListPayload,
} from './plugin-list.js';

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

/** `@oblivion/bundle@1.2.3` → `@oblivion/bundle`（带作用域的包名里 `@` 只在开头，从后往前找才安全）。 */
function bundleNameOf(item: string): string {
  const at = item.lastIndexOf('@');
  return at > 0 ? item.slice(0, at) : item;
}

/**
 * 读一个**已装包**的 `dsh.bundle.patch` 指向的补丁文件内容（找不到返回空串）。
 *
 * 这就是「组合层补丁」的来源：`@oblivion/bundle` 自己没有 `lib/index.js`
 * 逻辑，它的全部意义就是那个文件 —— 里面插了 core / panel / http-bridge。
 * 只用文本 contains 判「某个包有没有被写进去」，不解析 YAML：解析失败要退化成
 * 「这层没有」，而不是让整份清单失败。
 */
function bundlePatchOf(dir: string, name: string): string {
  const pkgDir = join(dir, 'node_modules', name);
  const pkgFile = join(pkgDir, 'package.json');
  if (!existsSync(pkgFile)) return '';
  try {
    const parsed = readJson(pkgFile);
    if (parsed === null || typeof parsed !== 'object') return '';
    const dsh: unknown = (parsed as Record<string, unknown>)['dsh'];
    if (dsh === null || typeof dsh !== 'object') return '';
    const bundle: unknown = (dsh as Record<string, unknown>)['bundle'];
    if (bundle === null || typeof bundle !== 'object') return '';
    const patch: unknown = (bundle as Record<string, unknown>)['patch'];
    if (typeof patch !== 'string' || patch === '') return '';
    const file = resolve(pkgDir, patch);
    return existsSync(file) ? readFileSync(file, 'utf8') : '';
  } catch {
    // 半装状态读不出来：这一层就不参与判定，不抛错。
    return '';
  }
}

/** 把 `dsh.profile.bundles` 里每个 bundle 的补丁文件拼成一段文本，供 contains 判定。 */
function bundleLayerPatch(dir: string, bundles: readonly string[]): string {
  return bundles.map((item) => bundlePatchOf(dir, bundleNameOf(item))).join('\n');
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
  let userPatch = '';
  if (existsSync(patchFile)) {
    try {
      userPatch = readFileSync(patchFile, 'utf8');
    } catch (error) {
      problems.push(`cordis.patch.yml 读不到：${describe(error)}`);
    }
  }

  // 组合层补丁：每个 bundle 自己声明的 `dsh.bundle.patch`（core / panel 在这一层）。
  const bundlePatch = bundleLayerPatch(location.dir, bundles);

  const entries: InstalledPlugin[] = dependencies
    .map(([name, spec]): InstalledPlugin => {
      const bundled = isBundled(bundles, name);
      // 两层补丁各自用 contains 判定：补丁文件是宿主的格式，本插件只需一个
      // 「这个包有没有被写进去」的显示判据；命中哪一层决定「改它要不要重启」。
      const inUserPatch = userPatch.includes(name);
      const inBundlePatch = bundlePatch.includes(name);
      const layer: PluginLayer = bundled
        ? 'bundles'
        : inUserPatch
          ? 'user-patch'
          : inBundlePatch
            ? 'bundle-patch'
            : 'none';
      const patched = inUserPatch || inBundlePatch;
      return {
        name,
        spec,
        kind: kindOf(spec),
        version: installedVersion(location.dir, name),
        bundled,
        patched,
        layer,
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
