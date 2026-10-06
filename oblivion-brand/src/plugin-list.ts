/**
 * 「个人已安装插件」清单的**形状、校验与恢复命令**。
 *
 * 这个文件是**中立层**：不引任何 `node:` 模块，因此宿主半边（读 profile 目录）
 * 与浏览器半边（渲染列表 + 复制命令）可以共用同一套定义 —— 恢复命令的拼法
 * 只有一处，清单的校验只有一处。
 *
 * ## 为什么要有「恢复命令」
 *
 * 重建环境时最费时间的不是重装，而是**想起来装过什么、装的是哪个规格**：
 * 本机 profile 里既有 `link:C:/Projects/Oblivion/oblivion-brand` 这种本地链接，
 * 也有 `^0.24.1` 这种 npm 规格，两者的重装命令完全不同（见 `restoreCommand`）。
 * 面板把命令直接摆在每一条旁边，一键复制即可。
 */

/** 依赖的规格种类：本地链接（开发中）还是 npm 包（市场装的）。 */
export type PluginKind = 'link' | 'npm';

/** 清单里的一条。 */
export interface InstalledPlugin {
  /** 包名，例如 `dsh-better-sidebar` 或 `@oblivion/core`。 */
  readonly name: string;
  /** `package.json` 里的原始规格，例如 `link:C:/Projects/Oblivion/oblivion-core` 或 `^0.24.1`。 */
  readonly spec: string;
  /** 规格种类。 */
  readonly kind: PluginKind;
  /** 磁盘上实际装到的版本（读 `node_modules/<name>/package.json`）；读不到为 `null`。 */
  readonly version: string | null;
  /** 在 `dsh.profile.bundles` 里（宿主会按 bundle 激活它）。 */
  readonly bundled: boolean;
  /** 在 `cordis.patch.yml` 里被 insert（宿主按补丁行挂载它）。 */
  readonly patched: boolean;
  /** 实际会被加载 = `bundled || patched`。 */
  readonly active: boolean;
  /** 重装这一条用的命令。 */
  readonly restore: string;
}

/** `GET /obl-brand/plugins` 的响应体（去掉 `ok` 之后）。 */
export interface PluginListPayload {
  /** profile 名，例如 `desktop`。 */
  readonly profile: string;
  /** profile 目录的绝对路径。 */
  readonly profileDir: string;
  /** 生成时刻（毫秒）。 */
  readonly generatedAt: number;
  /** 条目（按包名排序）。 */
  readonly entries: readonly InstalledPlugin[];
  /** 读取过程中的问题（缺文件、坏 JSON 等），一条一句人话。 */
  readonly problems: readonly string[];
}

/**
 * 无需加引号的字符集（包名、规格、profile 名都落在这里面）。
 *
 * 刻意把 `^` 与 `~`（semver 的插入符/波浪号）算作**安全**：
 *   - PowerShell 里 `^` 不是元字符，加不加引号都一样；
 *   - 而 cmd.exe 里单引号**不是**引号（会被原样传给 pnpm），多此一举的引号反而更糟；
 *   - `^1.2.3` 在 cmd 里 caret 转义的是 `1`，等价于不转义，无害。
 * 真正必须加引号的（空格、`:`、`|`、`&`、`$`、反引号等）不在这个集合里。
 */
const SAFE_ARG = /^[A-Za-z0-9@._/+^~-]+$/;

/**
 * 按 Windows PowerShell 的规则给参数加引号。
 *
 * 只有含 `:`（`link:C:/...`）或空格的规格才需要引号；引号内的单引号要写成两个
 * （PowerShell 的转义规则，不是反斜杠）。**不用双引号**：双引号里 `$`、反引号
 * 仍会被展开，而规格里这些字符是可能出现的。
 */
export function quoteArg(value: string): string {
  if (value !== '' && SAFE_ARG.test(value)) return value;
  return "'" + value.replace(/'/g, "''") + "'";
}

/**
 * 重装某一条的命令。
 *
 * 形态与 `dsh plugin` 的实际用法一致（本仓库安装 `@oblivion/bundle` 时实测过）：
 * `dsh plugin --profile <profile> add <spec>`。
 */
export function restoreCommand(profile: string, spec: string): string {
  return `dsh plugin --profile ${quoteArg(profile)} add ${quoteArg(spec)}`;
}

/** 条目的状态文案（面板与自检共用，避免各写一份就漂）。 */
export function statusLabel(entry: Pick<InstalledPlugin, 'active'>): string {
  return entry.active ? '已启用' : '已装未启用';
}

/**
 * 把整份清单拼成可一次粘贴的多行命令（「复制全部」用）。
 *
 * 空清单返回空串 —— 调用方据此禁用按钮。刻意**不**生成 `.ps1` 文件、也不写清单文件：
 * 所有者 2026-10-06 裁定只做「面板里列出 + 每条一键复制」（见 README 的裁定记录）。
 */
export function totalRestoreScript(payload: Pick<PluginListPayload, 'entries'>): string {
  return payload.entries.map((entry) => entry.restore).join('\n');
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function asEntry(raw: unknown): InstalledPlugin | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const name = asString(record['name']);
  const spec = asString(record['spec']);
  const restore = asString(record['restore']);
  if (name === null || spec === null || restore === null) return null;
  const bundled = record['bundled'] === true;
  const patched = record['patched'] === true;
  const kind = record['kind'] === 'link' ? 'link' : 'npm';
  const version = asString(record['version']);
  return {
    name,
    spec,
    kind,
    version,
    bundled,
    patched,
    active: record['active'] === true || bundled || patched,
    restore,
  };
}

/**
 * 校验宿主返回的清单。
 *
 * 逐条严格校验：形状不对的条目**丢掉**，整份不是对象则返回 `null`
 * （面板据此显示「宿主没挂上这条路由」而不是把 `undefined` 渲染成空白）。
 * 版本升级期间宿主与客户端可能不同版，因此这里**不做**「字段必须齐全」之外的假设。
 */
export function normalizePluginList(raw: unknown): PluginListPayload | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const profile = asString(record['profile']);
  if (profile === null) return null;
  const entries = Array.isArray(record['entries'])
    ? record['entries'].map(asEntry).filter((entry): entry is InstalledPlugin => entry !== null)
    : [];
  const problems = Array.isArray(record['problems'])
    ? record['problems'].filter((item): item is string => typeof item === 'string')
    : [];
  return {
    profile,
    profileDir: asString(record['profileDir']) ?? '',
    generatedAt: typeof record['generatedAt'] === 'number' ? record['generatedAt'] : 0,
    entries,
    problems,
  };
}
