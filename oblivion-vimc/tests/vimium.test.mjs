/**
 * @oblivion/vimc — Vimium-C 兼容层测试。
 *
 * 两半：
 *   ① **本机真实导出**：所有者提供的 `vimium_c-*.json`（若存在）必须能被导入，
 *      且键位语义与选项映射都对得上；文件不存在时跳过（测试保持可移植）。
 *   ② **内联小样例**：不依赖本机文件的纯逻辑用例（解析、提示串、排除规则、匹配）。
 *
 * 运行：`npm test`
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { Window } from 'happy-dom';

const BUNDLE = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
const requireFromBundle = createRequire(new URL('../lib/client.js', import.meta.url));

/** 本机真实导出（存在就用它做端到端断言）。 */
const REAL_CONFIG = 'C:\\Programs\\Configure\\vimium_c-20251214_001720.json';

/** 从构建产物里取测试缝隙（纯函数）。 */
function seam() {
  const win = new Window({ url: 'http://127.0.0.1:19387/' });
  globalThis.window = win;
  globalThis.document = win.document;
  let captured = null;
  win.__ModuleLoader__ = { load: (entry) => { captured = entry; } };
  new Function(BUNDLE)();
  const mod = captured.factory((id) => requireFromBundle(id));
  return { test: mod.__test, win };
}

const { test: vimc } = seam();

function commandsOf(parse) {
  return parse.bindings.map((binding) => `${binding.label}=${binding.command}`).sort();
}

test('提示串生成：短提示优先，多候选时前缀仍无歧义', () => {
  assert.deepEqual(vimc.generateHintStrings(3, 'dsa'), ['d', 's', 'a']);
  // 本机导出的字母表是 11 个字符（dsavewrqcxz）
  assert.equal('dsavewrqcxz'.length, 11);
  assert.deepEqual(vimc.generateHintStrings(11, 'dsavewrqcxz'), [...'dsavewrqcxz']);

  // 12 个候选：前 10 个拿单字母，剩下 2 个用「保留首字母 z」的两字母串
  const many = vimc.generateHintStrings(12, 'dsavewrqcxz');
  assert.equal(many.length, 12);
  assert.deepEqual(many.slice(0, 11), [...'dsavewrqcx', 'zd']);

  // 15 个候选：同样是 10 个单字母 + 5 个 z 开头的两字母
  const fifteen = vimc.generateHintStrings(15, 'dsavewrqcxz');
  assert.equal(fifteen.length, 15);
  assert.deepEqual(fifteen.slice(0, 10), [...'dsavewrqcx']);
  assert.deepEqual(fifteen.slice(10), ['zd', 'zs', 'za', 'zv', 'ze']);

  // 关键性质：没有任何提示串是另一个的前缀（否则按键会有歧义）
  for (const hints of [many, fifteen, vimc.generateHintStrings(40, 'dsavewrqcxz')]) {
    for (const a of hints) {
      for (const b of hints) {
        if (a !== b) assert.ok(!b.startsWith(a), `「${a}」不应是「${b}」的前缀`);
      }
    }
  }

  assert.deepEqual(vimc.generateHintStrings(0, 'dsa'), []);
  assert.deepEqual(vimc.generateHintStrings(5, ''), []);
});

test('排除规则：字面前缀 / 正则 / glob', () => {
  assert.equal(vimc.matchesExclusion(':https://example.com/app', 'https://example.com/app/x'), true);
  assert.equal(vimc.matchesExclusion(':https://example.com/app', 'https://other.com/'), false);
  assert.equal(vimc.matchesExclusion('/^https:\\/\\/example\\.com\\//i', 'https://example.com/x'), true);
  assert.equal(vimc.matchesExclusion('*://*.example.com/*', 'https://a.example.com/x'), true);
  assert.equal(vimc.matchesExclusion('https://exact.example/', 'https://exact.example/'), true);
});

test('解析 map/run 文本：支持的映射、别名、修饰键与未支持命令', () => {
  const parse = vimc.parseKeyMappings([
    '#!no-check',
    'unmapAll',
    'map w scrollPageUp',
    'map a scrollLeft',
    'map W scrollToTop',
    'run i focusInput:(<c-m>:W+150wait)%cfocusInput \\',
    '  o.keep o.select="all-line" o.reachable \\',
    '  o.prefer="#js-issues-search,#searchEngines"',
    'map f LinkHints.activate',
    'map <c-up> scrollPxUp',
    'run q i',
    'map / enterFindMode postOnEsc',
    'map . performFind',
    'map , performBackwardsFind',
    'map <a-t> createTab',
    'map Xx removeRightTab',
    'map <backspace> goBack',
  ].join('\n'));

  assert.equal(parse.unmapAll, true, 'unmapAll 应当被识别');
  assert.deepEqual(commandsOf(parse), [
    ',=findPrevious',
    '.=findNext',
    '/=openFind',
    'Backspace=goBack',
    'Ctrl+↑=stepUp',
    'Shift+W=scrollToTop',
    'a=stepLeft',
    'f=linkHints',
    'i=focusInput',
    'q=focusInput',
    'w=scrollPageUp',
  ]);
  assert.deepEqual(parse.errors, []);
  const unsupported = parse.unsupported.map((item) => item.command);
  assert.ok(unsupported.includes('createTab'));
  assert.ok(unsupported.includes('removeRightTab'));
  assert.ok(parse.unsupported.every((item) => item.reason.length > 0), '每个未支持命令都要有理由');
  // 续行已合并：`focusInput:(…)` 与后续选项在一条里
  assert.ok(parse.bindings.every((binding) => !binding.source.endsWith('\\')));
});

test('匹配：修饰键必须完全一致；字符键位与物理 Shift 一致', () => {
  const parse = vimc.parseKeyMappings('map w scrollPageDown\nmap W scrollToTop\nmap <c-up> scrollPxUp\nmap A goBack');
  const bindings = parse.bindings;
  const match = (options) => vimc.matchBinding(options, bindings, false);
  assert.equal(match({ key: 'w', code: 'KeyW' })?.command, 'scrollPageDown');
  assert.equal(match({ key: 'W', code: 'KeyW', shiftKey: true })?.command, 'scrollToTop');
  assert.equal(match({ key: 'w', code: 'KeyW', ctrlKey: true }), undefined, '未声明修饰键的组合不匹配');
  assert.equal(match({ key: 'ArrowUp', code: 'ArrowUp', ctrlKey: true })?.command, 'stepUp');
  assert.equal(match({ key: 'ArrowUp', code: 'ArrowUp' }), undefined, '缺 Ctrl 不匹配');
  assert.equal(match({ key: 'A', code: 'KeyA', shiftKey: true })?.command, 'goBack');
  assert.equal(match({ key: 'a', code: 'KeyA' }), undefined, '无 Shift 不匹配大写键位');
  assert.equal(match({ key: 'w', code: 'KeyW', isComposing: true }), undefined, 'IME 组合期不匹配');
});

test('resolveBindings：用户键位覆盖同键位默认，unmapAll 清空默认', () => {
  const merged = vimc.resolveBindings('map w scrollToBottom');
  const w = merged.bindings.filter((binding) => binding.label === 'w');
  assert.equal(w.length, 1, '同键位只留一条');
  assert.equal(w[0].command, 'scrollToBottom', '用户键位优先');
  assert.ok(merged.bindings.some((binding) => binding.label === 's'), '其它默认键位保留');

  const cleared = vimc.resolveBindings('unmapAll\nmap j scrollPageDown');
  assert.deepEqual(cleared.bindings.map((binding) => binding.command), ['scrollPageDown']);
});

test('导入真实 Vimium-C 导出：选项与键位都能对上', { skip: !existsSync(REAL_CONFIG) }, () => {
  const raw = JSON.parse(readFileSync(REAL_CONFIG, 'utf8'));
  const { patch, report } = vimc.importVimiumConfig(raw, { prefer: ['[data-composer-input]'] });

  // ---- 选项映射 ----
  assert.equal(patch.linkHintCharacters, 'dsavewrqcxz');
  assert.equal(patch.scrollStepSize, 90);
  assert.equal(patch.ignoreKeyboardLayout, false, 'keyLayout=0 → 按产出字符匹配');
  assert.equal(patch.regexFindMode, true, 'regexFindMode=true → 页面内查找按正则解释');
  assert.deepEqual(patch.exclusions, [':https://www.typelit.io/typing-console/1984/0/23']);
  assert.deepEqual(patch.prefer, ['[data-composer-input]', '#js-issues-search', '#searchEngines']);
  assert.equal(typeof patch.keyMappings, 'string');
  assert.ok(!patch.keyMappings.includes('\\\n'), '续行应当已被合并');
  // 只带受支持的键位（其余命令在 unsupported 里）
  const imported = vimc.parseKeyMappings(patch.keyMappings);
  assert.equal(imported.unmapAll, true);
  const commandSet = new Set(imported.bindings.map((binding) => binding.command));
  for (const expected of [
    'scrollPageUp', 'scrollPageDown', 'stepLeft', 'stepRight', 'scrollToTop', 'scrollToBottom',
    'focusInput', 'linkHints', 'goBack', 'goForward',
    'openFind', 'findNext', 'findPrevious',
  ]) {
    assert.ok(commandSet.has(expected), `应当解析出 ${expected}`);
  }
  assert.ok(!commandSet.has('escapeToPage'), 'Esc 是本插件的隐式行为，不占键位');

  // ---- 报告 ----
  const adoptedKeys = report.adopted.map((item) => item.key);
  for (const key of ['keyMappings', 'linkHintCharacters', 'scrollStepSize', 'keyLayout', 'exclusionRules.pattern', 'regexFindMode']) {
    assert.ok(adoptedKeys.includes(key), `应当采纳 ${key}`);
  }
  const ignoredKeys = report.ignored.map((item) => item.key);
  for (const key of ['searchEngines', 'clipSub', 'grabBackFocus', 'vimSync', 'nextPatterns']) {
    assert.ok(ignoredKeys.includes(key), `应当说明为何不采纳 ${key}`);
  }
  assert.equal(report.source.name, 'Vimium C');
  assert.ok(report.ignored.every((item) => item.reason.length > 0));
  assert.ok(imported.unsupported.length > 10, '应有大量未支持命令被逐条列出');
  assert.ok(imported.unsupported.every((item) => item.reason.length > 0));
});

test('导入拒绝非对象输入', () => {
  assert.throws(() => vimc.importVimiumConfig([], { prefer: [] }), /不是 Vimium-C/);
  assert.throws(() => vimc.importVimiumConfig(null, { prefer: [] }), /不是 Vimium-C/);
});
