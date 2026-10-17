/**
 * 设置分节（`settings.section`）的**纯逻辑**：字段表、补丁构造、下拉框选项、错误文案。
 *
 * 为什么单独一层：JSX 组件在 Node 里测不了，而「哪些键、写成什么值会落进
 * `<dataRoot>/settings.json`」这件事**必须**能测 —— 它是写盘的最后一道闸。
 * 所以字段表、`buildPatch()`、`loadSettings()`、`postSettings()` 全在这里（零 React 依赖），
 * 经 `src/testkit.ts` 导出，由 `test/panel.test.mjs` 直接盯住。
 *
 * ## 三层配置的语义（`@oblivion/core` 的 `settings-file.ts`，本页据此设计）
 *
 *   `DEFAULT_CONFIG`  <  **profile 的插件 config**  <  **`<dataRoot>/settings.json`**（本页写的）
 *
 * 由此推出三条**必须如实体现在界面上**的行为：
 *
 *   ① 本页写下去的值**压过 profile** —— 否则「界面里改了、profile 又把它盖回去」查不出来；
 *   ② 传 `null` 是「**从设置层删掉这一键**」（= 恢复默认 = 回到下层），不是「写一个等于默认的值」
 *      （`writeSettings()` 就是这么实现的；写一个等于默认的值会把 profile 的值也一起压掉）；
 *   ③ 写下去要**重启 DSH** 才进各子模块（`apply()` 那一刻配置就固化进 mdRoot / 各阈值了），
 *      所以界面必须把「设置页要的值」与「正在跑的值」分开显示（`pending`）。
 *
 * ## 为什么读的是 core 自己挂的路由
 *
 * 面板的定位是「**只读**数据面，绝不重写别人的文件」，而 Cordis 服务表跨插件取不到
 * （实测：桥接 `inject: ['oblivion']` 从未激活）⇒ 面板不能 `ctx.get('oblivion')` 去调 core。
 * 于是 core 自己挂 `GET|POST /oblivion-core/settings`（`oblivion-core/src/settings-route.ts`），
 * 本页只 `fetch` 同源的它 —— 写语义（sanitize / 深合并 / 原子写）因此只有一份。
 */

/**
 * 设置分节在 DSH 设置里的位置：品牌 45 → 键盘导航 46 → **知识库 47** → better-sidebar 100。
 * 三个 Oblivion 插件按「装了什么就挨着排」的顺序落在官方各分节之前。
 *
 * 放在 `settings-model.ts` 里是为了**只有一份**：注册用的 descriptor、组件自己的标题、
 * 诊断自报、自检断言都读它 —— 改一处不会漏另一处。
 */
export const SETTINGS_SECTION_ID = 'oblivion-knowledge';
export const SETTINGS_SECTION_ORDER = 47;
export const SETTINGS_SECTION_LABEL = 'Oblivion 知识库';

/** 与 `@oblivion/core` 的 `SETTINGS_ROUTE` 逐字相同（自检在两侧源码上比对这一个字面量）。 */
export const SETTINGS_ROUTE = '/oblivion-core/settings';

/** 每个键最终是谁定的（与 core 的 `ConfigSource` 同形）。 */
export type ConfigSource = 'default' | 'plugin' | 'settings';

export interface RouteEntry {
  provider: string;
  model: string;
}

/** `organize.catalog()` 的下拉框数据源（宿主 provider 注册表）。 */
export interface Catalog {
  providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string }> }>;
  routes: RouteEntry[];
  routeSource: 'config' | 'host-default' | 'none';
  llmAvailable: boolean;
}

/** `GET /oblivion-core/settings` 的回包（= core 的 `SettingsSnapshot` + catalog + 版本）。 */
export interface SettingsPayload {
  ok?: boolean;
  version?: string;
  path?: string;
  /** 设置层里的**原始值**（就是这个文件的内容）。 */
  values: Record<string, unknown>;
  /** 每个键（含 `organize.<子键>`）最终是谁定的。 */
  sources: Record<string, ConfigSource>;
  /** **正在跑**的配置 —— 与 `values` 不一致的键要重启才生效。 */
  effective: Record<string, unknown>;
  writable?: string[];
  /** 要重启 DSH 才生效的键。 */
  pending?: string[];
  catalog?: Catalog | null;
}

/** `POST` 的回包：在快照之上多了 write 的如实回报。 */
export interface PatchResult extends SettingsPayload {
  saved?: boolean;
  changed?: string[];
  rejected?: string[];
  restartRequired?: boolean;
}

/**
 * 表单里一个字段的值。
 *
 * 三态是刻意的：
 *   · `undefined`（= **键不在表单里**）—— 没碰过这一格，保存时**不写**；
 *   · `null` —— 明确要求「恢复默认」⇒ 写 `null`，从设置层删掉这一键；
 *   · 具体值 —— 写它。
 * 少一态就会出两种 bug：「点保存把整份配置固化下来」（把 undefined 当值写），
 * 或「恢复默认变成了写一个等于默认的值」（把 null 当值写）。
 */
export type FormValue = string | number | boolean | RouteEntry[] | null;

/** 表单：键 = 字段表里的 `key`（`organize.enabled` 这种点号路径），值是上面那个三态。 */
export type FormState = Record<string, FormValue>;

export type FieldKind = 'text' | 'number' | 'bool' | 'select' | 'routes';

export type GroupId = 'data' | 'organize' | 'model' | 'threshold';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  group: GroupId;
  /** 数字的**显示换算**：显示值 = 实际值 / scale（分钟、秒这类只改给人看，落盘仍是原单位）。 */
  scale?: number;
  unit?: string;
  step?: number;
  min?: number;
  hint?: string;
}

export interface GroupSpec {
  id: GroupId;
  title: string;
  hint: string;
}

/**
 * 分组（顺序即渲染顺序）。
 *
 * 只关**这四组**：所有者在 2026-10-17 裁定的范围是「知识库路径 / 模型选择 + 自动切换 /
 * 自动整理开关」，判定阈值那一组是顺着面板的「调参建议」加上的 —— 建议里给的就是那两个键，
 * 没有这一组，用户看到建议却改不了。其余 20 多个键（图谱权重、透视参数…）留在 profile 里改，
 * 界面底部会如实说清这件事（`writableNote()`）。
 */
export const GROUPS: GroupSpec[] = [
  { id: 'data', title: '知识库位置', hint: '笔记与条目落在本机哪个目录。' },
  {
    id: 'organize',
    title: '自动整理（用宿主里可用的模型）',
    hint: '复用 DSH 的 provider 与密钥跑模型：插件只报 provider / model，密钥由宿主适配器解析。',
  },
  { id: 'model', title: '模型与自动切换', hint: '主路失败会按顺序试备用路 —— 这就是「自动切换」。' },
  { id: 'threshold', title: '判定阈值', hint: '面板「调参建议」里给候选值的两个键。' },
];

/**
 * 字段表（**唯一一份**：界面渲染与补丁构造都过它）。
 *
 * `hint` 写的是「这个键在运行时到底管什么」，不是复述标签 —— 设置页最容易长出的
 * 是「一排看不懂的开关」，这里刻意把默认值与后果写进提示。
 */
export const FIELDS: FieldSpec[] = [
  {
    key: 'mdRoot',
    label: '知识库路径',
    kind: 'text',
    group: 'data',
    hint: '默认 ~/OblivionKB。改了要重启 DSH 才生效（core 装载时就把路径固化了）。',
  },

  {
    key: 'organize.enabled',
    label: '自动整理总开关',
    kind: 'bool',
    group: 'organize',
    hint: '默认关。打开后按下面的范围与节奏调用模型。',
  },
  {
    key: 'organize.digest',
    label: '会话整理产出',
    kind: 'bool',
    group: 'organize',
    hint: '把走过的会话整理成 04_会话整理/ 下的笔记。',
  },
  {
    key: 'organize.retitle',
    label: '知识库标题与标签回填',
    kind: 'bool',
    group: 'organize',
    hint: '名字看不出内容的笔记，按内容重命名并补关键词。',
  },
  {
    key: 'organize.autoApply',
    label: '回填自动落地',
    kind: 'bool',
    group: 'organize',
    hint: '默认关：只出预览（preview），要不要真改由你确认 —— 回填会动知识库里的文件名。',
  },
  {
    key: 'organize.everyTurns',
    label: '每几轮整理一次',
    kind: 'number',
    group: 'organize',
    min: 0,
    step: 1,
    hint: '0 = 不按轮触发（只在工具里手动跑）。',
  },
  {
    key: 'organize.minIntervalMs',
    label: '两次整理至少间隔',
    kind: 'number',
    group: 'organize',
    scale: 60_000,
    unit: '分钟',
    min: 0,
    step: 1,
    hint: '防止多轮连跑时反复叫模型。',
  },
  {
    key: 'organize.batchSize',
    label: '每批最多处理',
    kind: 'number',
    group: 'organize',
    unit: '篇',
    min: 1,
    step: 1,
    hint: '一次送进 prompt 的候选上限。',
  },
  {
    key: 'organize.maxTokens',
    label: '单次调用最大输出',
    kind: 'number',
    group: 'organize',
    unit: 'token',
    min: 1,
    step: 64,
    hint: '太小会把模型的话截断在 JSON 中间。',
  },
  {
    key: 'organize.timeoutMs',
    label: '单次调用超时',
    kind: 'number',
    group: 'organize',
    scale: 1000,
    unit: '秒',
    min: 1,
    step: 5,
    hint: '到点就换下一条路（备用路因此才有意义）。',
  },

  { key: 'organize.provider', label: '主 provider', kind: 'select', group: 'model', hint: '留空 = 跟随宿主的默认选路。' },
  { key: 'organize.model', label: '主 model', kind: 'select', group: 'model', hint: '候选来自上面那个 provider 在宿主注册表里的模型。' },
  { key: 'organize.fallbacks', label: '备用路（自动切换）', kind: 'routes', group: 'model', hint: '按顺序试；主路与备用路里重复的路会被 core 去掉。' },

  { key: 'semanticThreshold', label: '语义阈值', kind: 'number', group: 'threshold', min: 0, step: 0.05, hint: '低于它的语义相似度不算同一条知识。' },
  { key: 'valueThreshold', label: '价值阈值', kind: 'number', group: 'threshold', min: 0, step: 0.05, hint: '低于它的问答不入库（捕获率低时最该调这个）。' },
];

export function fieldsOf(group: GroupId): FieldSpec[] {
  return FIELDS.filter((field) => field.group === group);
}

/** 字段表里的键集合 —— `writableNote()` 用它算「没关到的键」。 */
export function surfacedKeys(): string[] {
  return FIELDS.map((field) => field.key);
}

/** 把 `organize.enabled` 拆成 `{ head: 'organize', sub: 'enabled' }`；顶层键只有 head。 */
export function splitFieldKey(key: string): { head: string; sub?: string } {
  const dot = key.indexOf('.');
  if (dot < 0) return { head: key };
  return { head: key.slice(0, dot), sub: key.slice(dot + 1) };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 读一个字段的**当前值**与**来源**。
 *
 * 取值口径：设置层有就用它，否则用 `effective`（正在跑的那份）。因为
 * `sources[key] !== 'settings'` 时 `effective[key]` 就是下层配置的值 —— 两句话对得上。
 * （设置层有值时 `effective` 可能还是旧值：那是 pending，界面另有「待重启」标记。）
 */
export function resolveField(
  payload: SettingsPayload,
  key: string,
): { value: unknown; source: ConfigSource; fromSettings: boolean } {
  const { head, sub } = splitFieldKey(key);
  const raw = sub === undefined
    ? payload.values[head]
    : (isPlainObject(payload.values[head]) ? (payload.values[head] as Record<string, unknown>)[sub] : undefined);
  const effective = sub === undefined
    ? payload.effective[head]
    : (isPlainObject(payload.effective[head]) ? (payload.effective[head] as Record<string, unknown>)[sub] : undefined);
  const fromSettings = raw !== undefined && raw !== null;
  const source = payload.sources[key] ?? (fromSettings ? 'settings' : 'default');
  return { value: fromSettings ? raw : effective, source, fromSettings };
}

/** `settings` / `plugin` / `default` → 给人看的来源名（与 knowledge.ts 的 `sourceLabel` 不同：那是知识条目的来源类型）。 */
export function configSourceLabel(source: ConfigSource): string {
  if (source === 'settings') return '设置页';
  if (source === 'plugin') return '插件配置';
  return '默认值';
}

/** 设置某一格。`undefined` = 撤掉这一格的改动（回到「没碰过」），落盘时不会出现这一键。 */
export function setField(form: FormState, key: string, value: FormValue | undefined): FormState {
  const next: FormState = { ...form };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/** 表单里有几格被碰过（= 保存时会涉及的键数）。 */
export function draftCount(form: FormState): number {
  return Object.keys(form).length;
}

/**
 * 两个值是不是同一个（数组按顺序比，`null`/`undefined` 与缺省一律当「没设」）。
 *
 * 只用于**判断要不要写** —— 不参与落盘，所以字符串化比较足够。
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === undefined || a === null) return b === undefined || b === null;
  if (b === undefined || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 编辑一格：**改回当前值就等于撤掉改动**（写回 `undefined`）。
 *
 * 为什么：`sources[key] === 'settings'` 时把值改回原样，若还留着一次写，
 * 结果是把一个多余的值钉进设置层（压过 profile）；改回原样就该「什么都不写」。
 */
export function editField(form: FormState, payload: SettingsPayload, key: string, value: FormValue): FormState {
  if (sameValue(value, resolveField(payload, key).value)) return setField(form, key, undefined);
  return setField(form, key, value);
}

/**
 * 恢复默认：设置层有这个键 ⇒ 写 `null`（删掉它，回到下层）；
 * 设置层没有、只是表单里改了 ⇒ 撤掉改动即可（不带 `null` 下去，免得白写一次盘）。
 */
export function resetField(form: FormState, payload: SettingsPayload, key: string): FormState {
  return setField(form, key, resolveField(payload, key).fromSettings ? null : undefined);
}

/**
 * 主 provider / model 这一对**在宿主清单里对不上**时返回一句提示，对得上回 `null`。
 *
 * 为什么要求准：对不上的组合照样能写进设置层（core 会如实报给宿主，失败后切备用路），
 * 所以这里**不改用户的配置**，只把话说出来 —— 静默替他改才是更坏的行为。
 */
export function routeProblem(
  catalog: Catalog | null | undefined,
  provider: string,
  model: string,
): string | null {
  if (provider === '' || model === '') return null;
  const found = (catalog?.providers ?? []).find((item) => item.id === provider);
  if (found === undefined) return 'provider「' + provider + '」不在宿主注册表里（清单来自宿主的 provider 注册表）。';
  if (!found.models.some((item) => item.id === model)) {
    return 'provider「' + provider + '」下没有 model「' + model + '」—— 这条组合会调用失败并切到备用路。';
  }
  return null;
}

/**
 * 表单 → `{patch, keys}`。
 *
 * 两条约定：
 *   · `null` **原样传下去** —— `writeSettings()` 认它是「删掉这一键」（恢复默认）；
 *     这里绝不能把它 `sanitizeSettings()` 掉，那正是 core 侧踩过的坑。
 *   · 输出**键序稳定**（排序），这样同一份表单永远得到同一个请求体，单测能逐字比对。
 */
export function buildPatch(form: FormState): { patch: Record<string, unknown>; keys: string[] } {
  const patch: Record<string, unknown> = {};
  const organize: Record<string, unknown> = {};
  const keys: string[] = [];
  for (const key of Object.keys(form).sort()) {
    const value = form[key];
    const { head, sub } = splitFieldKey(key);
    if (sub === undefined) patch[head] = value;
    else organize[sub] = value;
    keys.push(key);
  }
  if (Object.keys(organize).length > 0) patch.organize = organize;
  return { patch, keys };
}

/**
 * 数字输入框的文本 → 值。
 *
 * 三种结果：`null` = 空串（**恢复默认**，与那一格右上角的「恢复默认」同一个意思）、
 * `undefined` = 没读懂（**不动这一格**，别把 `abc` 当成 0 写下去）、否则是数。
 */
export function parseNumberText(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}

/** 实际值 → 输入框文本（按 `scale` 换算；`null`/`undefined` 回空串 = 用默认）。 */
export function numberText(value: unknown, scale = 1): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value === undefined || value === null ? '' : String(value);
  const shown = value / scale;
  return String(Number.isFinite(shown) ? shown : value);
}

/** 一条路 → `provider / model`。 */
export function routeText(route: RouteEntry | null | undefined): string {
  if (!route || route.provider === '' || route.model === '') return '（没配全）';
  return route.provider + ' / ' + route.model;
}

/** 一串路 → 「a / b → c / d」（空数组给一句人话，不是空字符串）。 */
export function routesText(routes: readonly RouteEntry[] | undefined): string {
  if (!routes || routes.length === 0) return '（没有可用的路）';
  return routes.map((route) => routeText(route)).join(' → ');
}

/** `routes` 是怎么来的 + 现在会走哪条 —— 设置页顶部那一行「打开会用哪条路」。 */
export function catalogSummary(catalog: Catalog | null | undefined): { label: string; routes: string } {
  if (!catalog) return { label: '宿主没回清单（core 版本旧或没装载）', routes: '—' };
  if (!catalog.llmAvailable) return { label: '宿主没有 llm 服务', routes: '（自动整理会跳过）' };
  const label = catalog.routeSource === 'config'
    ? '按这条设置里的 provider / model'
    : catalog.routeSource === 'host-default'
      ? '宿主的默认选路（本页没指定 provider）'
      : '没有可用的路';
  return { label, routes: routesText(catalog.routes) };
}

export interface Option {
  value: string;
  label: string;
}

/**
 * provider 下拉框：**第一项是空值**「跟随宿主默认」，其余逐条列宿主注册表。
 *
 * 自定义 provider（profile 里经 `config.providers` 登记、`baseURL` 指向自建服务的，如 `agnes`）
 * 与官方在宿主里是同一份注册表 ⇒ 这里**不需要**任何特判，列出来就是能选。
 */
export function providerOptions(catalog: Catalog | null | undefined): Option[] {
  const options: Option[] = [{ value: '', label: '（跟随宿主默认）' }];
  for (const provider of catalog?.providers ?? []) {
    const count = provider.models.length;
    options.push({
      value: provider.id,
      label: provider.name === provider.id ? provider.id : provider.name + '（' + provider.id + '）' + (count === 0 ? ' · 无模型' : ''),
    });
  }
  return options;
}

/** 某个 provider 的模型。provider 为空或不在清单里 ⇒ 只剩「（跟随宿主默认）」/当前值那一项。 */
export function modelOptions(catalog: Catalog | null | undefined, provider: string): Option[] {
  const options: Option[] = [{ value: '', label: '（跟随宿主默认）' }];
  if (provider === '') return options;
  const found = (catalog?.providers ?? []).find((item) => item.id === provider);
  for (const model of found?.models ?? []) {
    options.push({ value: model.id, label: model.name === model.id ? model.id : model.name + '（' + model.id + '）' });
  }
  return options;
}

/**
 * 把「当前值」补进选项里（不在清单里时）。
 *
 * 为什么必须补：provider 被从 profile 删掉、或 model 改名之后，`<select>` 找不到这个值会
 * **静默跳到第一项**，用户一保存就把配置改掉了 —— 那不是他点的。补一条
 * 「（不在宿主清单里）」既保住了显示，也让「为什么自动整理失败」看得出来。
 */
export function withCurrent(options: readonly Option[], current: string): Option[] {
  if (current === '' || options.some((option) => option.value === current)) return [...options];
  return [...options, { value: current, label: current + '（不在宿主清单里）' }];
}

/** `organize.fallbacks` → 行（只留两端都有的，空的丢掉 —— 与 core 的 `buildRoutes()` 同口径）。 */
export function fallbacksOf(payload: SettingsPayload): RouteEntry[] {
  const value = resolveField(payload, 'organize.fallbacks').value;
  if (!Array.isArray(value)) return [];
  const out: RouteEntry[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) continue;
    out.push({ provider: String(item.provider ?? ''), model: String(item.model ?? '') });
  }
  return out;
}

/** 一行是否「已经配全」（两端都有）—— 只用来标灰，不替用户删。 */
export function isCompleteRoute(route: RouteEntry): boolean {
  return route.provider !== '' && route.model !== '';
}

/** 待重启的键 → 一句话（没有就是 `null`）。 */
export function pendingSentence(pending: readonly string[] | undefined): string | null {
  if (!pending || pending.length === 0) return null;
  return '这些键要重启 DSH 才生效：' + pending.join('、');
}

/** 保存结果 → 一句话（`kind` 决定界面颜色）。 */
export function describeSaveResult(result: PatchResult): { kind: 'ok' | 'warn' | 'error'; text: string } {
  if (result.saved === false) {
    return { kind: 'error', text: 'core 说设置没写进磁盘（看它的日志）。' };
  }
  const changed = result.changed ?? [];
  const rejected = result.rejected ?? [];
  const pending = result.pending ?? [];
  if (changed.length === 0 && rejected.length === 0) {
    return { kind: 'warn', text: '写下去了，但值和原来一样（changed 为空）。' };
  }
  const parts: string[] = [];
  if (changed.length > 0) parts.push('已保存 ' + changed.join('、'));
  if (rejected.length > 0) parts.push('被 core 丢掉（键名不合法）：' + rejected.join('、'));
  const head = parts.join('；');
  if (pending.length > 0) return { kind: rejected.length > 0 ? 'warn' : 'ok', text: head + ' —— 要重启 DSH 才生效。' };
  return { kind: rejected.length > 0 ? 'warn' : 'ok', text: head + '。' };
}

/** 界面底部那句「剩下的键去哪改」。 */
export function writableNote(writable: readonly string[] | undefined, surfaced: readonly string[] = surfacedKeys()): string {
  const rest = (writable ?? []).filter((key) => key !== 'organize' && !surfaced.includes(key));
  if (rest.length === 0) return '';
  const shown = rest.slice(0, 6).join(' / ');
  return '这一页只管上面这些键。settings.json 还能写其余 ' + rest.length + ' 个（' + shown
    + (rest.length > 6 ? ' …' : '') + '），那些留在 profile 的插件 config 里改。';
}

/** 一个键的短名（去掉 `organize.` 前缀），错误文案里用。 */
export function shortKey(key: string): string {
  const { head, sub } = splitFieldKey(key);
  return sub === undefined ? head : sub;
}

/** HTTP 状态码 → 人话（core 那条路由的每一种拒绝都覆盖到）。 */
export function httpHint(status: number): string {
  switch (status) {
    case 400:
      return 'core 说这份补丁不是合法的 JSON 对象。';
    case 403:
      return 'core 拒了这个来源（写配置的请求只收本机页面）。';
    case 404:
      return '这条路由是 @oblivion/core 0.2.17 起的：core 没装载，或版本比它旧。';
    case 405:
      return 'core 这条路由只收 GET / POST。';
    case 413:
      return '补丁太大（core 的上限是 64 KiB）。';
    case 500:
      return 'core 自己报错了（写盘失败或 describe 失败），看它的日志。';
    default:
      return '';
  }
}

/** 最短的 fetch 面（结构化类型，便于单测塞假实现）。 */
export interface MinimalResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body?: string; credentials?: string; cache?: string },
) => Promise<MinimalResponse>;

export type SettingsOutcome =
  | { ok: true; payload: SettingsPayload }
  | { ok: false; error: string; status?: number };

export type PatchOutcome =
  | { ok: true; result: PatchResult }
  | { ok: false; error: string; status?: number };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 解析回包体；读不出 JSON 时回 `null`（调用方据此报「回包不是 JSON」）。 */
async function bodyOf(response: MinimalResponse): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** 回包里的 `error` 字段（core 每种拒绝都带一句英文短语，附上便于对日志）。 */
function serverErrorOf(body: unknown): string {
  if (!isPlainObject(body)) return '';
  const error = body.error;
  return typeof error === 'string' && error !== '' ? '（core 原话：' + error + '）' : '';
}

/**
 * 读设置快照。**不写任何东西**，失败一律转成一句人话（含 HTTP 码的专门解释）。
 */
export async function loadSettings(options: { fetch?: FetchLike; route?: string } = {}): Promise<SettingsOutcome> {
  const doFetch = options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (typeof doFetch !== 'function') return { ok: false, error: '当前环境没有 fetch。' };
  const route = options.route ?? SETTINGS_ROUTE;
  let response: MinimalResponse;
  try {
    response = await doFetch(route, { method: 'GET', headers: { accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' });
  } catch (error: unknown) {
    return { ok: false, error: '连不上 core 的设置路由：' + messageOf(error) };
  }
  const body = await bodyOf(response);
  if (!response.ok) return { ok: false, status: response.status, error: httpHint(response.status) + serverErrorOf(body) };
  if (!isPlainObject(body)) return { ok: false, status: response.status, error: 'core 的回包不是 JSON 对象。' };
  return { ok: true, payload: body as unknown as SettingsPayload };
}

/**
 * 写设置补丁。请求体固定是 `{patch: …}`（core 也收裸对象，那是给 `curl` 手测方便的）。
 *
 * 成功时把**整份刷新后的快照**带回来（core 的 POST 回包 = 写结果 + 新快照 + 新 catalog），
 * 所以界面不必再发一次 GET。
 */
export async function postSettings(
  patch: Record<string, unknown>,
  options: { fetch?: FetchLike; route?: string } = {},
): Promise<PatchOutcome> {
  const doFetch = options.fetch ?? (globalThis.fetch as unknown as FetchLike | undefined);
  if (typeof doFetch !== 'function') return { ok: false, error: '当前环境没有 fetch。' };
  const route = options.route ?? SETTINGS_ROUTE;
  let response: MinimalResponse;
  try {
    response = await doFetch(route, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ patch }),
      credentials: 'same-origin',
    });
  } catch (error: unknown) {
    return { ok: false, error: '保存失败（连不上 core）：' + messageOf(error) };
  }
  const body = await bodyOf(response);
  if (!response.ok) return { ok: false, status: response.status, error: httpHint(response.status) + serverErrorOf(body) };
  if (!isPlainObject(body)) return { ok: false, status: response.status, error: 'core 的回包不是 JSON 对象。' };
  return { ok: true, result: body as unknown as PatchResult };
}
