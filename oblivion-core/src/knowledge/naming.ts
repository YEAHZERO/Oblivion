/**
 * 沉淀件的**命名与打标签**（纯字符串，无 IO、无 LLM）。
 *
 * ## 为什么要有这个文件
 *
 * 所有者 2026-10-06 看了一眼知识库：
 *
 *   > 「这些沉淀的文档，命名上看不出是什么内容，单纯只是我的问题的简写而已，
 *   >   需要在沉淀整理的时候顺便命名 + 打标签」
 *
 * 之前的口径是 `deriveTitle()` = **问句第一行的前 60 字**、`deriveTopic()` = **问句里第一个
 * 3–20 字的词串**，于是文件名长成 `给出实施的具体方案.md`、`查看这个方案.md`、
 * `我的0.md` —— 名字是「我问了什么」，不是「这里讲了什么」。
 *
 * ## 口径（确定性的，不调模型）
 *
 * 命名优先级：
 *   ① 答案里**第一个不像套话的小标题**（`## 怎么装` ⇒ `怎么装`）；
 *   ② 否则去掉「查看 / 给出 / 这个 / 请」这类水词、并截到第一个标点之前的问句；
 *   ③ 再不行才退回原始问句（绝不产出空名）。
 *
 * 为什么不调模型：`qa-loop` 是**每轮自动**跑的，插件不许在主线里调 LLM
 * （设计书的硬约束）；而 `oblivion_digest` 那条路本来就是模型给的标题，不受这里影响。
 * 所以这里只做「确定性的改写」：能去掉水词、能用答案自己的小标题，就已经把
 * 「问题简写」变成「内容名字」了。
 *
 * 打标签：技术词 + 包名（`@scope/name`、`dsh-*`）+ 正文里的 `#tag` + 一张中文词表
 * （中文没有词边界，靠 `[/插件/ → plugin]` 这种映射把内容变成能筛的标签）。
 * 出口一律过 `sanitizeTags()`：格式词（`md`/`json`/`yaml`/`ts`…）、路径碎片（`Users`/`local`…）、
 * 纯数字（`15044`）都不是标签，只能把标签位吃光（所有者 2026-10-06 点名「标签噪声」）。
 */

/** 答案里那些「是结构、不是内容」的小标题，不该拿来当名字。 */
const GENERIC = new Set([
  '结论',
  '结论先行',
  '要点',
  '摘要',
  '总结',
  '说明',
  '概览',
  '回答',
  '正文',
  '背景',
  '步骤',
  '方法',
  '建议',
  '注意事项',
  '下一步',
  '风险',
  '方案',
  '状态',
  '目标',
  '结果',
  '问题',
  '实现',
  '具体做法',
  '关键点',
  '分点说明',
]);

/** 问句开头的水词（去掉它们名字才开始像「内容」）。 */
const LEAD_NOISE =
  /^(请|请你|帮我|帮忙|麻烦|现在|然后|接着|先|需要|想要|我要|我们|我|你|这个|那个|这两个|那两个|关于|如何|怎么|为什么|是否|能否|可以|查看|看一下|看看|检查|核对|复核|分析|给出|说明|解释|介绍|对比|比较|整理|列出|写一个|做一个|实现|修改|修复|添加|把|将|我的|还是|不行的话就|单独做一个|直接)/;

/** 名字在第一个标点处就该断（问句往往是「标题，然后一堆补充」）。 */
const PUNCT = /[，。！？；：、,.!?;:（(【[]/;

/**
 * 开头/结尾的装饰性标点（含全角）。
 *
 * 回填时实测到的坏名字：`，按照你的建议执行…`、`（改代码，更稳）：让 bridge…`、
 * `还是不行` ⇒ `不行` —— 前者是标点没去干净，后者见 `WEAK_TITLES`。
 */
const EDGE_PUNCT =
  /^[\s·:：;；,，.。、\-—–_~!！?？…/\\|"'`（(「『【《〈\[{<]+|[\s·:：;；,，.。、\-—–_~!！?？…/\\|"'`）)」』】》〉\]}>]+$/g;

/** 名字最长多少字（文件名要能一眼读完，也远小于 `safeName()` 的 80 字节上限）。 */
const MAX_TITLE = 32;

/**
 * 这些「名字」不含任何内容信息 —— 它们是**对话里的应答**，不是主题。
 *
 * 回填实测：`untitled.md → 继续.md`、`还是不行.md → 不行.md`。改名反而更糟，
 * 所以遇到这类名字就**守住原名**（见 `fileNameOf()`：标题弱则退回 `topic`）。
 */
const WEAK_TITLES = new Set([
  '继续',
  '继续吧',
  '继续查',
  '行',
  '不行',
  '可以',
  '好的',
  '好',
  '是',
  '对',
  '没有',
  '没事',
  '嗯',
  '哦',
  '知道',
  '明白',
  '收到',
  '测试',
  '试试',
  '看看',
  '再看',
  '下一个',
  '开始',
  '完成',
  '好了',
  '重启',
  '重启了',
  '已重启',
  '已重开',
  '已装',
  '已经装了',
  'ok',
  'okay',
  'yes',
  'no',
  'done',
  'untitled',
]);

/** 技术词（与 0.1.x 的旧表兼容，另补了几个本机在用的）。 */
const TECH =
  /\b(dsh|dshx|cordis|npm|pnpm|docker|sqlite|fts5|json|jsonl|yaml|toml|api|mcp|wsl2?|arkts|flutter|esbuild|vitest|node|nodejs|react|typescript|javascript|playwright|chromium|msedge|edge|chrome|obsidian|markdown|tsx|ts|js|md)\b/gi;

/**
 * 标签黑名单：**只说明「这是什么格式 / 这是路径上的哪个词」，不说明「讲了什么」**。
 *
 * 起因（所有者 2026-10-06）：「顺手把标签噪声治掉」——主题页与笔记实测长出了
 * `#md #json #ts #js #yaml #untitled #15044 #Users` 这类标签：
 *   - 格式词来自 `TECH`（`ts|js|md|json` 这些**方言词**在每篇笔记里都命中，等于没打）；
 *   - `15044` / `Users` 这种来自 `topicHint`（问句里第一个词串）与路径碎片；
 * 一页只能挂 12 个标签，噪声把真正的主题词挤出去了。
 */
const TAG_STOPWORDS = new Set([
  // 文件格式 / 扩展名：出现了不代表主题
  'md', 'markdown', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'txt', 'csv', 'log',
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'css', 'html', 'xml',
  // 占位词与路径碎片（实测出现过）
  'untitled', 'readme', 'read', 'docs', 'tmp', 'temp',
  'users', 'user', 'projects', 'library', 'appdata', 'programs', 'local', 'home', 'desktop', 'downloads',
]);

/** 一篇笔记最多挂几个标签（索引页/主题页才不会被标签淹没）。 */
export const TAG_MAX = 8;

/** 中文 → 英文标签：中文没词边界，命中即打标，让中文笔记也有可筛的标签。 */
const ZH_TAGS: Array<[RegExp, string]> = [
  [/插件/, 'plugin'],
  [/面板|侧栏|sidebar/i, 'panel'],
  [/知识库|沉淀|笔记/, 'knowledge-base'],
  [/搜索/, 'search'],
  [/抓取|爬取/, 'fetch'],
  [/密钥|令牌|\btoken\b|api\s*key/i, 'credential'],
  [/重启|重开|重新打开/, 'restart'],
  [/配置|补丁|patch/i, 'config'],
  [/会话|对话/, 'session'],
  [/版本|升级/, 'version'],
  [/图谱|双链|反链/, 'graph'],
  [/画像|风格|偏好/, 'profile'],
  [/写盘|落盘|持久化/, 'persistence'],
  [/索引/, 'index'],
  [/标签/, 'tag'],
  [/命名|文件名/, 'naming'],
  [/报错|异常|失败|不行/, 'error'],
  [/测试|自检|用例/, 'test'],
  [/文档|说明|README/i, 'docs'],
  [/性能|卡顿|慢/, 'performance'],
  [/迁移|移植|搬到/, 'migration'],
  [/安装|装载|挂载/, 'install'],
  [/模型|llm|deepseek/i, 'llm'],
];

function squeeze(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** 去掉 markdown 装饰、结尾标点；过长则截断（文件名与索引都要短）。 */
function cleanTitle(raw: string): string {
  let text = squeeze(raw.replace(/[#*`>~]/g, ' '));
  // URL 不能当名字：回填实测出现过 `这两个：https___github.com_wqty123_….md`。
  text = squeeze(text.replace(/https?:\/\/\S+/gi, ' ').replace(/\bwww\.\S+/gi, ' '));
  text = squeeze(text.replace(EDGE_PUNCT, ''));
  text = text.replace(/[。.，,；;：:、!！?？…]+$/g, '');
  // 「结论：应该这么做」→「应该这么做」：套话只当噪声，不当名字。
  for (const generic of GENERIC) {
    if (text.length > generic.length + 2 && (text.startsWith(generic + '：') || text.startsWith(generic + ':'))) {
      text = squeeze(text.slice(generic.length + 1));
      break;
    }
  }
  if (text.length > MAX_TITLE) text = text.slice(0, MAX_TITLE - 1) + '…';
  // 截断会切出新的尾标点（`…（窗口 10 条，显示最近 6 条` 这种），所以收尾要再来一次。
  return squeeze(text.replace(EDGE_PUNCT, ''));
}

/**
 * 这个名字是不是「等于没名字」（纯应答、或短到无法表达内容）。
 *
 * 管线（`fileNameOf()`）与回填脚本都用它守住一个底线：**改名不能把名字改得更差**。
 */
export function isWeakTitle(title: string): boolean {
  const text = cleanTitle(title ?? '').toLowerCase();
  if (text === '' || text.length < 3) return true;
  return WEAK_TITLES.has(text);
}

/** ① 答案里第一个不像套话的小标题 / 加粗小标题。 */
function titleFromAnswer(answer: string): string {
  for (const line of answer.split('\n')) {
    const row = line.trim();
    const heading = row.match(/^#{1,6}\s+(.+?)\s*#*$/);
    // 加粗小标题：`**结论**：应该这么做` / `**两套配置的差别**` —— 只要开头是加粗短语就算，
    // 不必整行只有它（这是本机答案里最常见的一种「小标题」写法）。
    const bold = row.match(/^\*\*(.{2,40}?)\*\*/);
    const raw = heading?.[1] ?? bold?.[1];
    if (raw === undefined) continue;
    const title = cleanTitle(raw);
    if (title === '' || title.length < 2) continue;
    if (GENERIC.has(title)) continue;
    return title;
  }
  return '';
}

/**
 * ② 问句去水词。
 *
 * **不在第一个标点处截断**（0.2.1 的第一版这么做过，实测把好名字截没了）：
 * 「查看opencode的配置，里面有API和密钥」截成「opencode的配置」，而「里面有API和密钥」
 * 恰恰是这条沉淀的内容。所以保留整句，交给 `cleanTitle()` 按 32 字上限收尾。
 */
function titleFromQuestion(question: string): string {
  const first = question
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '');
  if (first === undefined) return '';
  let text = squeeze(first);
  // 反复去掉开头水词：「给出实施的具体方案」→「实施的具体方案」。
  for (let round = 0; round < 4; round += 1) {
    const next = text.replace(LEAD_NOISE, '').trim();
    if (next === text || next === '') break;
    text = next;
  }
  text = squeeze(text.replace(/^[的了吗呢啊呀吧哦]+/, ''));
  return cleanTitle(text);
}

/**
 * 沉淀件的名字：**优先用答案自己的小标题**，否则改写问句，最后才退回问句原文。
 * 传入的是整段答案（不是摘要），这里只看前几行。
 */
export function titleFromQA(question: string, answer: string): string {
  const fromAnswer = titleFromAnswer(answer ?? '');
  if (fromAnswer !== '' && fromAnswer.length >= 2) return fromAnswer;
  const fromQuestion = titleFromQuestion(question ?? '');
  if (fromQuestion !== '') return fromQuestion;
  return 'untitled';
}

/**
 * 标签清洗（纯函数，`tagsFromQA()` 与主题页渲染共用）。
 *
 * 口径：
 *   ① 去 `#` 前缀与首尾空白；空串丢掉；
 *   ② `TAG_STOPWORDS` 里的格式词/路径碎片丢掉；
 *   ③ **必须含字母**（`15044` 这种纯数字是 topic 碎片，不是标签）；
 *   ④ 大小写不敏感去重（`TS` 与 `ts` 是同一个标签）；
 *   ⑤ 保留 `cap` 个（默认 8）。
 */
export function sanitizeTags(tags: readonly string[], cap: number = TAG_MAX): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    const value = squeeze(String(raw ?? '')).replace(/^#+/, '');
    if (value === '' || value.length > 40) continue;
    const lower = value.toLowerCase();
    if (TAG_STOPWORDS.has(lower)) continue;
    if (!/\p{L}/u.test(value)) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(value);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * 标签：技术词 + 包名（`@scope/name` / `dsh-*`）+ 正文 `#tag` + 中文词表命中。
 *
 * 扫的是**问句 + 答案**（旧实现只扫答案，于是「问句里点名的插件」反而没被打上）。
 * 出口统一过 `sanitizeTags()`（上限 8，与旧口径一致）。
 */
export function tagsFromQA(question: string, answer: string, extra: string[] = []): string[] {
  const haystack = (question ?? '') + '\n' + (answer ?? '');
  const out: string[] = [];
  for (const tag of extra) {
    // `extra` 传进来的是 `topicHint`（通常是包名/技术词）。回填时实测到过一条坏标签：
    // 某篇笔记的 topic 就是问句本身（`继续查并修掉这个激活问题`），于是整句话被当标签打上。
    // 标签只收「技术词形状」（ASCII、无空格），其余一律丢掉。
    const value = squeeze(tag);
    if (value !== '' && value.length <= 40 && /^[A-Za-z0-9@][A-Za-z0-9@._+/-]*$/.test(value)) out.push(value);
  }
  for (const match of haystack.matchAll(TECH)) out.push(match[0].toLowerCase());
  // 包名：@scope/name 与 dsh-* 是这台机器上「最有用的一类标签」（一个包名 = 一个主题域）。
  for (const match of haystack.matchAll(/@[a-z0-9][\w.-]*\/[\w.-]+/gi)) out.push(match[0].toLowerCase());
  for (const match of haystack.matchAll(/\bdsh-[\w-]+/gi)) out.push(match[0].toLowerCase());
  // 正文里手写的 #标签。前面不能是 `#`（否则 markdown 的 `## 内容` 会被认成标签「内容」）。
  for (const match of haystack.matchAll(/(?<![#\w])#([\p{L}\p{N}_-]{2,20})/gu)) out.push(match[1]);
  for (const [pattern, tag] of ZH_TAGS) if (pattern.test(haystack)) out.push(tag);
  return sanitizeTags(out, TAG_MAX);
}
