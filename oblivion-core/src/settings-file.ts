/**
 * `<dataRoot>/settings.json` —— **设置页可写**的配置层（DEC-030）。
 *
 * ## 为什么要有第三层配置
 *
 * 现在配置有两个来源：`DEFAULT_CONFIG`（代码里的默认值）与**插件 config**
 * （profile 补丁 `cordis.patch.yml` 里那条 `- id: '@oblivion/core'` 的 `config:`）。
 * 两者都要**改文件 + 重启 DSH**，所以「在插件设置里改路径 / 选模型」没法落在它们身上。
 *
 * 于是加一层：优先级 `DEFAULT_CONFIG` < **插件 config** < **本文件**。
 * 设置页写这一层 ⇒ 点一下即生效（下一轮读取就用新值），
 * 而且**压过 profile**，避免「界面里改了、profile 又把它盖回去」这种查不出来的 bug。
 *
 * ## 两条边界（刻意的）
 *
 *   ① **`dataRoot` 不能由本文件覆盖** —— 本文件就住在 `<dataRoot>/` 下面，
 *      让「住址」由「住址」自己决定是个死循环（读它之前就得知道它在哪）。
 *      `dataRoot` 只在 `DEFAULT_CONFIG` 与插件 config 里定。
 *   ② 只接受 `DEFAULT_CONFIG` 里**已存在的键**：写错一个键名不该静默生效，
 *      更不该把一堆垃圾带进运行时配置。
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CONFIG, mergeOrganize, type Config, type OrganizeConfig } from './config.js';
import { readJsonSafe, writeJsonAtomic } from './util/fs.js';
import { expandHome } from './util/paths.js';

/** 本文件名（相对 `dataRoot`）。 */
export const SETTINGS_FILE = 'settings.json';

/** `<dataRoot>/settings.json` 的绝对路径（`~` 会展开）。 */
export function settingsPathOf(dataRoot: string): string {
  return join(expandHome(dataRoot), SETTINGS_FILE);
}

/** 合法键 = `DEFAULT_CONFIG` 的键，但排除 `dataRoot`（见模块注释 ①）。 */
export function writableKeys(): string[] {
  return Object.keys(DEFAULT_CONFIG).filter((k) => k !== 'dataRoot');
}

/**
 * 把任意对象收敛成「只含合法键」的配置补丁。
 *
 * `organize` 单独处理：它是嵌套对象，且**只接受已知子键**
 * （否则设置页写错一个子键名就会被静默忽略，而不是被报出来）。
 */
export function sanitizeSettings(input: unknown): Record<string, unknown> {
  if (input === null || typeof input !== 'object') return {};
  const known = new Set(writableKeys());
  const organizeKeys = new Set(Object.keys(DEFAULT_CONFIG.organize));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    if (k === 'organize') {
      if (typeof v !== 'object') continue;
      const sub: Record<string, unknown> = {};
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (sv === undefined || sv === null) continue;
        if (!organizeKeys.has(sk)) continue;
        sub[sk] = sv;
      }
      if (Object.keys(sub).length > 0) out.organize = sub;
      continue;
    }
    if (!known.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * **同步**读设置层。
 *
 * 为什么同步：`apply()` 是同步函数（Cordis 的装载路径），而配置必须在**任何模块建起来之前**
 * 就定下来（`mdRoot` / `dataRoot` 要喂给每一个子模块）。一次小文件的同步读取，代价可忽略。
 * 读不到 / 坏的 / 不是对象 —— 一律回 `{}`，装载不因此失败。
 */
export function readSettingsSync(dataRoot: string): Record<string, unknown> {
  try {
    const raw = readFileSync(settingsPathOf(dataRoot), 'utf8');
    return sanitizeSettings(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

/** 异步读（面板/桥接侧用；语义与同步版一致）。 */
export async function readSettings(dataRoot: string): Promise<Record<string, unknown>> {
  return sanitizeSettings(await readJsonSafe<unknown>(settingsPathOf(dataRoot)));
}

/**
 * 写入设置层：**与现有内容合并**（`patch` 里的键覆盖，其余保留）。
 *
 * 传 `null` 作某个键的值可以**删掉这一键**（回到下层配置）—— 设置页的「恢复默认」按钮用得上。
 * 原子写（写临时文件 → rename），避免面板正好读到半截 JSON。
 */
export async function writeSettings(
  dataRoot: string,
  patch: Record<string, unknown>,
): Promise<{ path: string; keys: string[] }> {
  const path = settingsPathOf(dataRoot);
  const current = await readSettings(dataRoot);
  const merged: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete merged[k];
      continue;
    }
    if (v === undefined) continue;
    if (k === 'organize' && typeof v === 'object') {
      // 深合并：设置页只翻一个子键时，同块其他子键必须留住。
      const base = (merged.organize as Partial<OrganizeConfig> | undefined) ?? {};
      const sub: Record<string, unknown> = { ...base };
      for (const [sk, sv] of Object.entries(v as Record<string, unknown>)) {
        if (sv === undefined) continue;
        if (sv === null) delete sub[sk];
        else sub[sk] = sv;
      }
      merged.organize = sub;
      continue;
    }
    merged[k] = v;
  }
  const clean = sanitizeSettings(merged);
  await writeJsonAtomic(path, clean);
  return { path, keys: Object.keys(clean) };
}

/**
 * 把设置层叠到插件 config 之上，得到一份「合并后的原始配置」。
 *
 * 返回值可以直接喂 `resolveConfig()`（它再补 `DEFAULT_CONFIG` 与嵌套块）。
 * `dataRoot` 由 `pluginConfig` 决定（见模块注释 ①），设置层里若有也被丢弃。
 */
export function mergeSettingsConfig(
  pluginConfig: Record<string, unknown>,
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...pluginConfig };
  const clean = sanitizeSettings(settings);
  for (const [k, v] of Object.entries(clean)) {
    if (k === 'organize' && typeof v === 'object') {
      out.organize = mergeOrganize(
        mergeOrganize(DEFAULT_CONFIG.organize, pluginConfig.organize as Partial<OrganizeConfig> | undefined),
        v as Partial<OrganizeConfig>,
      );
      continue;
    }
    out[k] = v;
  }
  return out;
}

export type ConfigSource = 'default' | 'plugin' | 'settings';

/**
 * 每个键**最终是谁定的** —— 设置页要显示「生效值 + 来源」。
 *
 * 没有这一层，「我明明在界面里改了怎么没生效」只能靠人去猜三层配置的先后；
 * 有了它，面板可以直接把 `settings` / `plugin` / `default` 标在值旁边。
 */
export function configSources(
  pluginConfig: Record<string, unknown>,
  settings: Record<string, unknown>,
  keys: readonly string[] = writableKeys(),
): Record<string, ConfigSource> {
  const clean = sanitizeSettings(settings);
  const out: Record<string, ConfigSource> = {};
  for (const key of keys) {
    if (clean[key] !== undefined) out[key] = 'settings';
    else if (pluginConfig[key] !== undefined && pluginConfig[key] !== null) out[key] = 'plugin';
    else out[key] = 'default';
  }
  return out;
}

/** 只读快照，便于面板一次拿到「三层 + 来源」而不必自己拼。 */
export function describeSettings(
  pluginConfig: Record<string, unknown>,
  dataRoot: string,
): { path: string; values: Record<string, unknown>; sources: Record<string, ConfigSource> } {
  const values = readSettingsSync(dataRoot);
  return { path: settingsPathOf(dataRoot), values, sources: configSources(pluginConfig, values) };
}

/** 便捷：把 `Config` 里的 organize 块单独取出来（调用方常只需要它）。 */
export function organizeOf(config: Config): OrganizeConfig {
  return config.organize ?? DEFAULT_CONFIG.organize;
}
