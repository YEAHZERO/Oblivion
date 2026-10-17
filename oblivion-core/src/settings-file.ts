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
import { DEFAULT_CONFIG, mergeOrganize, resolveConfig, type Config, type OrganizeConfig } from './config.js';
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
 *
 * **嵌套块拆到子键一级**：只翻了 `organize.enabled` 时，`organize` 整块不该显示成「来自设置页」——
 * 那会让 `organize.model` 看起来也是界面里定的，而它其实还是默认值。所以额外产出
 * `organize.<子键>` 这些条目（顶层 `organize` 仍在，表示「这一块有没有被设置层碰过」）。
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
  const subSettings = clean.organize as Record<string, unknown> | undefined;
  const subPlugin = pluginConfig.organize as Record<string, unknown> | undefined;
  for (const sub of Object.keys(DEFAULT_CONFIG.organize)) {
    const full = 'organize.' + sub;
    if (subSettings?.[sub] !== undefined) out[full] = 'settings';
    else if (subPlugin?.[sub] !== undefined && subPlugin[sub] !== null) out[full] = 'plugin';
    else out[full] = 'default';
  }
  return out;
}

/** 稳定的 JSON 字符串（键排序）——比较配置值时不该受键序影响。 */
function stable(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  const rec = value as Record<string, unknown>;
  return '{' + Object.keys(rec).sort().map((k) => JSON.stringify(k) + ':' + stable(rec[k])).join(',') + '}';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 逐键比较两份配置，输出「哪些键不一样」；嵌套块（现在只有 `organize`）拆到**子键**一级。
 *
 * 为什么要到子键：设置页一行一行显示，用户改的是 `organize.enabled` 这一个格子，
 * 回「organize 变了」等于没说。另外 `organize` 整块判等会漏掉「块都在、只是某个子键不同」的情况。
 */
function changedPaths(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: readonly string[],
): string[] {
  const out: string[] = [];
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    const nested = isPlainObject((DEFAULT_CONFIG as unknown as Record<string, unknown>)[key]);
    if (!nested) {
      if (stable(a) !== stable(b)) out.push(key);
      continue;
    }
    // 嵌套块：**一侧整个缺席也要拆到子键**（「第一次写 organize」不该报成「organize 整块变了」，
    // 那样设置页没法把「你刚改的那个格子」标出来）。
    if (!isPlainObject(a) && !isPlainObject(b)) {
      if (stable(a) !== stable(b)) out.push(key);
      continue;
    }
    const aa = isPlainObject(a) ? a : {};
    const bb = isPlainObject(b) ? b : {};
    for (const sub of new Set([...Object.keys(aa), ...Object.keys(bb)])) {
      if (stable(aa[sub]) !== stable(bb[sub])) out.push(key + '.' + sub);
    }
  }
  return out.sort();
}

/**
 * 收下写请求里**不被接受**的键名。
 *
 * `sanitizeSettings()` 是**静默丢弃**（安全：写错键名不该生效），但设置页需要**知道**
 * 自己刚丢了一个键 —— 否则「点了保存、界面回成功、值却没变」会变成一个查不出来的 bug。
 * 所以写盘前先对着原始输入算一遍：哪些键会被丢。
 */
export function rejectedKeys(input: unknown): string[] {
  if (!isPlainObject(input)) return [];
  const known = new Set(writableKeys());
  const organizeKeys = new Set(Object.keys(DEFAULT_CONFIG.organize));
  const out: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (key === 'organize') {
      if (value === null) continue; // 整块删掉是合法操作
      if (!isPlainObject(value)) {
        out.push(key);
        continue;
      }
      for (const sub of Object.keys(value)) {
        if (!organizeKeys.has(sub)) out.push('organize.' + sub);
      }
      continue;
    }
    if (!known.has(key)) out.push(key);
  }
  return out.sort();
}

export interface SettingsSnapshot {
  /** `<dataRoot>/settings.json` 的绝对路径。 */
  path: string;
  /** 设置层里的**原始值**（就是那个文件的内容）。 */
  values: Record<string, unknown>;
  /** 每个键（含 `organize.<子键>`）最终是谁定的。 */
  sources: Record<string, ConfigSource>;
  /** **正在跑**的配置（下一轮装载会变成什么样，看 `values` 与 `pending`）。 */
  effective: Record<string, unknown>;
  /** 设置页**可以**写的键（`dataRoot` 不在其中，见模块注释 ①）。 */
  writable: string[];
  /**
   * 设置层要的值与**正在跑**的值不一致的键 —— 这些**要重启 DSH 才生效**。
   *
   * 为什么必须报：配置在 `apply()` 时就固化进各子模块了，设置层是**下一轮装载**才被读。
   * 不把这句说出来，「我改了怎么没变」会被当成 bug（设计稿 §10-A 也把
   * 「取消/重启后 core 读到的是新值」写成验收口径，两者对得上）。
   */
  pending: string[];
}

export interface SettingsPatchResult extends SettingsSnapshot {
  /** 文件写成功了吗。 */
  saved: boolean;
  /** 真正变了的键（写之前 vs 写之后）。空数组 = 这次点了个寂寞。 */
  changed: string[];
  /** 被丢掉的键名（`dataRoot` 也会出现在这里 —— 它不可由本文件覆盖）。 */
  rejected: string[];
  /** 是不是要重启 DSH 才生效（= `pending` 非空）。 */
  restartRequired: boolean;
}

/**
 * 设置页的服务面：**读**（生效值 + 来源）与**写**（原子落盘 + 如实回报）。
 *
 * 这条通路必须由 core 自己拥有，原因有两条实测依据：
 *   ① 面板的定位是「**只读**数据面，绝不重写别人的文件」（见 `oblivion-panel/README.md`），
 *      把 `settings.json` 的写语义复制到面板里更糟（两份 `sanitize` 迟早分叉）；
 *   ② Cordis 的服务表**跨插件取不到**（2026-10-17 实测：桥接 `inject: ['oblivion']`
 *      恒取不到、从未激活）⇒ 面板不能 `ctx.get('oblivion')` 来调这里，但可以走 HTTP。
 *      于是 core 自己挂一条路由（`src/settings-route.ts`），面板只 `fetch` 它。
 */
export interface SettingsService {
  describe(): SettingsSnapshot;
  patch(patch: Record<string, unknown>): Promise<SettingsPatchResult>;
}

export function createSettingsService(deps: {
  pluginConfig: Record<string, unknown>;
  dataRoot: string;
  /** 正在跑的配置（`apply()` 里那份 `config`）。 */
  effective: Record<string, unknown>;
}): SettingsService {
  const { pluginConfig, dataRoot, effective } = deps;

  const snapshot = (values: Record<string, unknown>): SettingsSnapshot => ({
    path: settingsPathOf(dataRoot),
    values,
    sources: configSources(pluginConfig, values),
    effective,
    writable: writableKeys(),
    // 「设置层要的」与「正在跑的」对不上 ⇒ 待重启。两侧都过 `resolveConfig`
    // 才能公平比较（默认值/`~` 展开/嵌套块合并都在那里做）。
    pending: changedPaths(
      resolveConfig(mergeSettingsConfig(pluginConfig, values)) as unknown as Record<string, unknown>,
      effective,
      writableKeys(),
    ),
  });

  const describe = (): SettingsSnapshot => snapshot(readSettingsSync(dataRoot));

  const patch = async (input: Record<string, unknown>): Promise<SettingsPatchResult> => {
    const before = await readSettings(dataRoot);
    const rejected = rejectedKeys(input);
    let saved = true;
    try {
      // 传**原始输入**而不是 `sanitizeSettings(input)`：`null` 在 sanitize 里是「丢掉这一项」，
      // 而它在 `writeSettings` 里是「**删掉这个键**，回到下层配置」—— 设置页的「恢复默认」全靠它。
      // （先 sanitize 一遍会把 `null` 提前吃掉，那条路就永远走不到。单测盯着这个回归。）
      await writeSettings(dataRoot, isPlainObject(input) ? input : {});
    } catch {
      saved = false;
    }
    const after = await readSettings(dataRoot);
    const base = snapshot(after);
    const changed = changedPaths(before, after, writableKeys());
    return {
      ...base,
      saved,
      changed,
      rejected,
      // 文件没写成功 ⇒ 「待重启」这句话别说得太满，但把当前不一致照实报出来。
      restartRequired: base.pending.length > 0,
    };
  };

  return { describe, patch };
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
