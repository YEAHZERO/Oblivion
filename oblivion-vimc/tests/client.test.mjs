/**
 * @oblivion/vimc — 浏览器半边行为测试。
 *
 * 测的是**构建产物** `lib/client.js`（不是源码）：用 happy-dom 造一个真实 DOM，
 * 按 DSH 客户端模块表的约定把 bundle 装进去，然后派发真实 KeyboardEvent 看行为。
 * 布局相关的少数原语（`elementFromPoint` / 滚动度量 / 滚动方法）由测试**显式给定**，
 * 因为 happy-dom 不做布局计算。
 *
 * 覆盖：默认键位（翻页 / 像素步进 / 到顶到底）、输入框守卫、修饰键与 IME 放行、
 * 物理位置匹配、`i` 聚焦 + `Esc` 退出、链接提示（1 字母 / 2 字母 / 取消 / 触发）、
 * 排除规则、控制面状态、卸载清理。
 *
 * 运行：`npm test`
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Window } from 'happy-dom';

const BUNDLE = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
/** 版本断言跟随 package.json，避免每次 bump 都要改测试。 */
const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
/** 宿主客户端模块表提供的基线模块；bundle 只允许 require 这些。 */
const BASELINE = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'];
const requireFromBundle = createRequire(new URL('../lib/client.js', import.meta.url));

/**
 * 造一个装了插件的窗口。
 *
 * @param setup 可选：在 `apply()` **之前**跑，用来先摆好 DOM。
 *   真实页面里插件是在外壳渲染过程中挂载的，需要「挂载时就已有 DOM」的用例
 *   （例如挂载自检）走这条；其余用例在 apply 之后再 `scene()`。
 */
function boot({ setup } = {}) {
  const win = new Window({ url: 'http://127.0.0.1:19387/' });
  win.innerWidth = 1000;
  win.innerHeight = 600;

  const beats = [];
  win.fetch = (url, init) => {
    beats.push({ url, payload: JSON.parse(init.body) });
    return Promise.resolve({ ok: true });
  };
  // 心跳是定时合并的；测试里改成同步冲刷，断言才确定。
  win.setTimeout = (handler) => {
    handler();
    return 0;
  };
  win.clearTimeout = () => undefined;

  globalThis.window = win;
  globalThis.document = win.document;

  if (typeof setup === 'function') setup({ win, doc: win.document });

  let captured = null;
  win.__ModuleLoader__ = {
    load: (entry) => {
      captured = entry;
    },
  };
  // bundle 顶层就是 `window.__ModuleLoader__.load({ id, factory })`。
  new Function(BUNDLE)();

  assert.ok(captured !== null, 'bundle 应当注册一个模块');
  const requested = new Set();
  const disposers = [];
  const logs = [];
  const mod = captured.factory((id) => {
    requested.add(id);
    assert.ok(BASELINE.includes(id), `bundle 只允许 require 宿主基线模块，实际请求了 ${id}`);
    return requireFromBundle(id);
  });
  const ctx = {
    logger: () => ({ info: (message) => logs.push(message), warn: (message) => logs.push(`WARN ${message}`) }),
    effect: (callback) => {
      const dispose = callback();
      if (typeof dispose === 'function') disposers.push(dispose);
    },
    inject: (_deps, callback) => {
      callback({ slots: slotRegistrar });
    },
  };
  const slots = [];
  const slotRegistrar = {
    inject: (_name, callback) => callback(),
    register: (options, component) => {
      slots.push({ options, component });
      return () => undefined;
    },
  };
  mod.apply(ctx);

  return { win, doc: win.document, entry: captured, mod, disposers, logs, beats, slots, requested };
}

/** 给元素装上「像浏览器那样」的滚动度量与方法。 */
function makeScrollable(element, box, { overflowX = 'auto', overflowY = 'auto' } = {}) {
  element.setAttribute('data-overflow-x', overflowX);
  element.setAttribute('data-overflow-y', overflowY);
  const maxTop = Math.max(0, box.scrollHeight - box.clientHeight);
  const maxLeft = Math.max(0, box.scrollWidth - box.clientWidth);
  const store = { top: 0, left: 0 };
  const clamp = (value, max) => Math.max(0, Math.min(value, max));
  for (const [name, value] of Object.entries({
    clientWidth: box.clientWidth,
    clientHeight: box.clientHeight,
    scrollWidth: box.scrollWidth,
    scrollHeight: box.scrollHeight,
  })) {
    Object.defineProperty(element, name, { value, configurable: true });
  }
  Object.defineProperty(element, 'scrollTop', {
    get: () => store.top,
    set: (value) => {
      store.top = clamp(Number(value) || 0, maxTop);
    },
    configurable: true,
  });
  Object.defineProperty(element, 'scrollLeft', {
    get: () => store.left,
    set: (value) => {
      store.left = clamp(Number(value) || 0, maxLeft);
    },
    configurable: true,
  });
  element.scrollTo = (options = {}) => {
    if (typeof options.top === 'number') store.top = clamp(options.top, maxTop);
    if (typeof options.left === 'number') store.left = clamp(options.left, maxLeft);
  };
  element.scrollBy = (options = {}) => {
    element.scrollTo({
      top: store.top + (typeof options.top === 'number' ? options.top : 0),
      left: store.left + (typeof options.left === 'number' ? options.left : 0),
    });
  };
  stubRect(element, { top: 0, left: 0, width: box.clientWidth, height: box.clientHeight });
  return element;
}

/** 给元素装上固定的矩形（可见性判定与链接提示都要用）。 */
function stubRect(element, { top, left, width, height }) {
  const rect = { x: left, y: top, top, left, right: left + width, bottom: top + height, width, height };
  Object.defineProperty(element, 'getClientRects', { value: () => [rect], configurable: true });
  Object.defineProperty(element, 'getBoundingClientRect', { value: () => rect, configurable: true });
  return element;
}

/** 取构建产物里的测试缝隙（纯函数）；顺手复用同一个 boot() 装配。 */
function bootedSeam() {
  return boot().mod.__test;
}

/** 造一个「主面板可滚 + 输入框」的场景。 */
function scene(booted, { overflowY = 'auto' } = {}) {
  const { win, doc } = booted;
  doc.body.innerHTML = `
    <main id="main">
      <div id="viewport"><div id="content"></div></div>
    </main>
    <div id="composer" data-composer-input contenteditable="true">草稿内容</div>
    <input id="search" type="text" />
  `;
  const viewport = makeScrollable(doc.getElementById('viewport'), {
    clientWidth: 800,
    clientHeight: 400,
    scrollWidth: 800,
    scrollHeight: 4000,
  }, { overflowY });
  const content = doc.getElementById('content');
  stubRect(content, { top: 0, left: 0, width: 800, height: 4000 });
  const composer = doc.getElementById('composer');
  stubRect(composer, { top: 480, left: 100, width: 800, height: 60 });
  const search = doc.getElementById('search');
  stubRect(search, { top: 0, left: 0, width: 200, height: 28 });

  // 只描述本插件真正读到的样式面（溢出值来自 makeScrollable 挂的属性）。
  const readOverflow = (element, axis) => {
    const value = typeof element.getAttribute === 'function' ? element.getAttribute(`data-overflow-${axis}`) : null;
    return value ?? 'visible';
  };
  win.getComputedStyle = (element) => ({
    overflowY: readOverflow(element, 'y'),
    overflowX: readOverflow(element, 'x'),
    display: 'block',
    visibility: 'visible',
    opacity: '',
    pointerEvents: 'auto',
  });

  // happy-dom 不做命中测试：显式指定视口中心命中的元素。
  win.document.elementFromPoint = () => content;
  return { win, doc, viewport, content, composer, search };
}

/** 派发一次真实 keydown，返回事件本身（用 defaultPrevented 判断是否被接管）。 */
function press(target, key, options = {}) {
  const win = target.ownerDocument?.defaultView ?? target;
  const event = new win.KeyboardEvent('keydown', {
    key,
    code: options.code ?? `Key${key.toUpperCase()}`,
    bubbles: true,
    cancelable: true,
    shiftKey: options.shiftKey ?? false,
    ctrlKey: options.ctrlKey ?? false,
    altKey: options.altKey ?? false,
    metaKey: options.metaKey ?? false,
  });
  target.dispatchEvent(event);
  return event;
}

/** 把 document.activeElement 钉在某个元素上（happy-dom 的 contenteditable 不可聚焦）。 */
function pinActive(doc, element) {
  Object.defineProperty(doc, 'activeElement', { value: element, configurable: true });
}

test('bundle 以包名注册，只 require 宿主基线模块，并挂上设置页', () => {
  const booted = boot();
  assert.equal(booted.entry.id, '@oblivion/vimc');
  assert.equal(typeof booted.mod.apply, 'function');
  assert.deepEqual([...booted.mod.inject], []);
  assert.equal(booted.win.oblivionVimc.version, PACKAGE_VERSION);
  assert.ok(booted.logs.some((line) => line.includes('已安装')));
  assert.equal(booted.slots.length, 1, '应当注册一个 settings.section');
  assert.equal(booted.slots[0].options.name, 'settings.section');
  assert.equal(booted.slots[0].options.id, 'oblivion-vimc');
  assert.equal(booted.slots[0].options.order, 46);
  assert.equal(typeof booted.slots[0].component, 'function');
  for (const id of booted.requested) assert.ok(BASELINE.includes(id), id);
});

test('w/s 按容器可视高度翻页，W/S 到顶到底', () => {
  const booted = boot();
  const { viewport } = scene(booted);

  const down = press(booted.win, 's');
  assert.equal(down.defaultPrevented, true);
  assert.equal(viewport.scrollTop, 240, '0.6 × 400 = 240');
  press(booted.win, 's');
  assert.equal(viewport.scrollTop, 480);
  press(booted.win, 'w');
  assert.equal(viewport.scrollTop, 240);
  press(booted.win, 'S', { shiftKey: true });
  assert.equal(viewport.scrollTop, 3600, 'scrollHeight 3600 后到底');
  press(booted.win, 'W', { shiftKey: true });
  assert.equal(viewport.scrollTop, 0);
});

test('a/d 与 Ctrl+方向键走 scrollStepSize 像素步进（Vimium 语义）', () => {
  const booted = boot();
  const { doc, win } = scene(booted);
  doc.body.insertAdjacentHTML('beforeend', '<pre id="code"></pre>');
  const code = makeScrollable(doc.getElementById('code'), {
    clientWidth: 600,
    clientHeight: 200,
    scrollWidth: 2400,
    scrollHeight: 200,
  });
  win.document.elementFromPoint = () => code; // 视口中心压在代码块上

  press(win, 'd');
  assert.equal(code.scrollLeft, 90, '默认 scrollStepSize = 90px');
  press(win, 'd');
  assert.equal(code.scrollLeft, 180);
  press(win, 'a');
  assert.equal(code.scrollLeft, 90);

  // 换步长立刻生效
  booted.win.oblivionVimc.set({ scrollStepSize: 300 });
  press(win, 'd');
  assert.equal(code.scrollLeft, 390);

  // Ctrl+↓ 是竖向像素步进（默认键位里有）；先把「视口中心」指回主面板
  win.oblivionVimc.set({ scrollStepSize: 90 });
  const vertical = doc.getElementById('viewport');
  win.document.elementFromPoint = () => doc.getElementById('content');
  press(win, 'ArrowDown', { code: 'ArrowDown', ctrlKey: true });
  assert.equal(vertical.scrollTop, 90);
});

test('焦点在输入框里时完全不接管（核心约束）', () => {
  const booted = boot();
  const { doc, win, viewport, composer } = scene(booted);

  const positive = press(doc.body, 's');
  assert.equal(positive.defaultPrevented, true, 'body 上的按键应当被接管');
  assert.equal(viewport.scrollTop, 240);
  viewport.scrollTo({ top: 0 });

  // ① 事件目标本身是可编辑元素（DSH 输入框就是 contenteditable 的 Lexical 宿主）
  const onComposer = press(composer, 's');
  assert.equal(viewport.scrollTop, 0);
  assert.equal(onComposer.defaultPrevented, false);

  // ② 事件目标是 body，但焦点还在输入框里
  pinActive(doc, composer);
  const whileEditing = press(doc.body, 's');
  assert.equal(viewport.scrollTop, 0);
  assert.equal(whileEditing.defaultPrevented, false);

  // ③ 输入框里的字母键也不会被吃掉
  for (const letter of ['i', 'f', 'w']) {
    const event = press(composer, letter);
    assert.equal(event.defaultPrevented, false, `${letter} 应当原样输入`);
  }
});

test('修饰键与 IME 组合期一律放行（未声明的修饰键组合）', () => {
  const booted = boot();
  const { viewport } = scene(booted);
  for (const [name, modifier] of Object.entries({ ctrlKey: true, metaKey: true, altKey: true })) {
    const event = press(booted.win, 's', { [name]: true });
    assert.equal(event.defaultPrevented, false, `${name}+s 不应被接管`);
  }
  assert.equal(viewport.scrollTop, 0);

  const composing = new booted.win.KeyboardEvent('keydown', { key: 's', code: 'KeyS', bubbles: true, cancelable: true, isComposing: true });
  booted.win.dispatchEvent(composing);
  assert.equal(viewport.scrollTop, 0);
});

test('大写锁定不会把 w 变成「回到顶部」', () => {
  const booted = boot();
  const { viewport } = scene(booted);
  viewport.scrollTo({ top: 1000 });
  // 锁大写时浏览器给出 key='W' 但 shiftKey=false
  press(booted.win, 'W');
  assert.equal(viewport.scrollTop, 760, '1000 - 240：仍然是上翻一页');
});

test('ignoreKeyboardLayout 时按物理位置 event.code 匹配', () => {
  const booted = boot();
  const { viewport } = scene(booted);
  booted.win.oblivionVimc.set({ ignoreKeyboardLayout: true });
  // 非拉丁布局：产出的字符不是 s，但物理键位是 KeyS
  press(booted.win, 'ы', { code: 'KeyS' });
  assert.equal(viewport.scrollTop, 240, 'scrollPageDown 翻一页');
});

test('i 聚焦输入框；Esc 退出输入框（默认开，菜单打开时让位）', () => {
  const booted = boot();
  const { doc, win, composer } = scene(booted);
  const focused = [];
  const blurred = [];
  composer.focus = (options) => {
    focused.push(options);
    pinActive(doc, composer);
  };
  composer.blur = () => {
    blurred.push(true);
    pinActive(doc, doc.body);
  };

  const event = press(win, 'i');
  assert.equal(focused.length, 1);
  assert.equal(doc.activeElement, composer);
  assert.equal(event.defaultPrevented, true);

  // Esc 让焦点回到页面
  const escaped = press(win, 'Escape');
  assert.equal(blurred.length, 1);
  assert.equal(escaped.defaultPrevented, true);
  assert.equal(doc.activeElement, doc.body);

  // 有菜单/弹窗打开时让位
  doc.body.insertAdjacentHTML('beforeend', '<div role="menu"></div>');
  pinActive(doc, composer);
  const withMenu = press(win, 'Escape');
  assert.equal(blurred.length, 1, '菜单打开时不抢 Esc');
  assert.equal(withMenu.defaultPrevented, false);
  doc.querySelector('[role="menu"]').remove();

  // 关掉选项后不再接管
  win.oblivionVimc.set({ escapeToPage: false });
  pinActive(doc, composer);
  const disabled = press(win, 'Escape');
  assert.equal(blurred.length, 1);
  assert.equal(disabled.defaultPrevented, false);
});

test('f 链接提示：1 个字母、输入即触发、Esc 取消', () => {
  const booted = boot();
  const { doc, win } = scene(booted);
  doc.body.insertAdjacentHTML('beforeend', `
    <div id="links">
      <a id="link-a" href="https://example.com/a">A</a>
      <button id="btn-b">B</button>
      <a id="link-c" href="https://example.com/c">C</a>
    </div>
  `);
  const [linkA, btnB, linkC] = ['link-a', 'btn-b', 'link-c'].map((id) => doc.getElementById(id));
  stubRect(linkA, { top: 100, left: 10, width: 60, height: 20 });
  stubRect(btnB, { top: 100, left: 90, width: 60, height: 20 });
  stubRect(linkC, { top: 140, left: 10, width: 60, height: 20 });
  const clicked = [];
  for (const [index, element] of [linkA, btnB, linkC].entries()) {
    element.addEventListener('click', () => clicked.push(element.id));
    assert.equal(index, [linkA, btnB, linkC].indexOf(element));
  }

  const started = press(win, 'f');
  assert.equal(started.defaultPrevented, true);
  const overlay = doc.querySelector('[data-vimc-hints]');
  assert.ok(overlay !== null, '应当出现提示浮层');
  const labels = [...overlay.querySelectorAll('[data-vimc-hint]')];
  assert.equal(labels.length, 3);
  // 字母表顺序 = dsavewrqcxz，按「行 → 左」排序后依次取字母
  assert.deepEqual(labels.map((label) => label.getAttribute('data-vimc-hint')), ['d', 's', 'a']);

  // 输入不属于任何提示的字母 → 退出提示模式且不触发
  const miss = press(win, 'z');
  assert.equal(miss.defaultPrevented, true);
  assert.equal(doc.querySelector('[data-vimc-hints]'), null, '未命中提示应退出提示模式');
  assert.deepEqual(clicked, []);

  // 重新进入并命中第一个提示
  press(win, 'f');
  const hit = press(win, 'd');
  assert.equal(hit.defaultPrevented, true);
  assert.deepEqual(clicked, ['link-a']);
  assert.equal(doc.querySelector('[data-vimc-hints]'), null, '触发后浮层应清理');

  // Esc 取消
  press(win, 'f');
  assert.ok(doc.querySelector('[data-vimc-hints]') !== null);
  const cancel = press(win, 'Escape');
  assert.equal(cancel.defaultPrevented, true);
  assert.equal(doc.querySelector('[data-vimc-hints]'), null);
  assert.deepEqual(clicked, ['link-a'], '取消不应触发任何目标');

  // 输入框里的 f 不进入提示模式
  pinActive(doc, doc.getElementById('composer'));
  press(doc.getElementById('composer'), 'f');
  assert.equal(doc.querySelector('[data-vimc-hints]'), null);
});

test('f 链接提示：候选多于字母表时前面的拿单字母，且前缀无歧义', () => {
  const booted = boot();
  const { doc, win } = scene(booted);
  const alphabet = 'dsavewrqcxz'; // 11 个字符
  doc.body.insertAdjacentHTML('beforeend', '<div id="many"></div>');
  const container = doc.getElementById('many');
  const ids = [];
  for (let index = 0; index < 15; index += 1) {
    const element = doc.createElement('button');
    element.id = `b-${String(index)}`;
    container.append(element);
    stubRect(element, { top: 20 * index, left: 10, width: 80, height: 18 });
    ids.push(element.id);
  }

  press(win, 'f');
  const labels = [...doc.querySelectorAll('[data-vimc-hint]')];
  assert.equal(labels.length, 15);
  const hints = labels.map((label) => label.getAttribute('data-vimc-hint'));
  // 15 个候选 / 11 字母表 → 前 10 个单字母，其余用被保留的 z 开头
  assert.equal(hints.filter((hint) => hint.length === 1).length, 10, '前 10 个应当拿单字母');
  assert.deepEqual(hints.slice(10), ['zd', 'zs', 'za', 'zv', 'ze']);
  for (const hint of hints) {
    assert.ok([...hint].every((char) => alphabet.includes(char)));
  }

  // 单字母提示按一下就触发（没有歧义）；两字母提示要先按保留首字母
  const clicked = [];
  container.addEventListener('click', (event) => clicked.push(event.target.id));
  const single = hints[0];
  const immediate = press(win, single);
  assert.equal(immediate.defaultPrevented, true);
  assert.deepEqual(clicked, [ids[0]], `按单字母 ${single} 应当立即触发`);
  assert.equal(doc.querySelector('[data-vimc-hints]'), null, '单字母触发后浮层收起');

  // 两字母那条：首字母只出现在两字母串里 → 浮层保留，补第二个字母才触发
  press(win, 'f');
  const twoChar = [...doc.querySelectorAll('[data-vimc-hint]')]
    .find((label) => label.getAttribute('data-vimc-hint').length === 2);
  const hint2 = twoChar.getAttribute('data-vimc-hint');
  const partial = press(win, hint2[0]);
  assert.equal(partial.defaultPrevented, true);
  assert.ok(doc.querySelector('[data-vimc-hints]') !== null, '前缀仍有多个候选时应保留浮层');
  press(win, hint2[1]);
  assert.deepEqual(clicked, [ids[0], ids[10]], '按 z… 的第二段触发第 11 个候选');
  assert.equal(doc.querySelector('[data-vimc-hints]'), null);
});

test('f 链接提示：正文里的内联引用优先拿单字母，外部按钮排在后面', () => {
  const booted = boot();
  const { doc, win, content } = scene(booted);
  // 正文（#content 在滚动容器里）：一个内联引用（title 是文件路径，正是悬停看到的那种）+ 一个普通按钮
  content.innerHTML = '<button id="mention" title="oblivion-vimc/README.md">@oblivion/brand</button>'
    + '<button id="content-button" aria-label="复制">正文按钮</button>';
  stubRect(doc.getElementById('mention'), { top: 40, left: 10, width: 110, height: 18 });
  stubRect(doc.getElementById('content-button'), { top: 70, left: 10, width: 90, height: 18 });
  // 正文之外：一个「更靠上、更靠左」的外部按钮（几何顺序上会更早，但优先级更低）
  doc.body.insertAdjacentHTML('beforeend', '<button id="outer-button">外部按钮</button>');
  stubRect(doc.getElementById('outer-button'), { top: 1, left: 1, width: 60, height: 16 });

  press(win, 'f');
  const hints = [...doc.querySelectorAll('[data-vimc-hint]')];
  assert.equal(hints.length, 3);
  // 依次应是：内联引用 → 正文按钮 → 外部按钮
  assert.equal(hints[0].getAttribute('data-vimc-hint'), 'd');
  assert.equal(hints[0].style.top, '40px', '第一个提示落在内联引用上');
  assert.equal(hints[1].getAttribute('data-vimc-hint'), 's');
  assert.equal(hints[1].style.top, '70px');
  assert.equal(hints[2].getAttribute('data-vimc-hint'), 'a');
  assert.equal(hints[2].style.top, '1px', '外部按钮虽然更靠上，仍排在最后');

  // 自检里给出三档数量，便于核对优先级
  const probe = win.oblivionVimc.probe();
  assert.deepEqual(probe.hints.tiers, { references: 1, content: 1, outer: 1 });
  press(win, 'Escape');
});

test('f 链接提示：判定内联引用的判据（版本号不算，扩展名明确才算）', () => {
  const booted = boot();
  const { doc, win, content } = scene(booted);
  content.innerHTML = '<button id="copy" aria-label="复制" title="复制">复制</button>'
    + '<button id="model" aria-label="切换模型 deepseek-v4.1">模型</button>'
    + '<button id="file" title="README.md">文件</button>'
    + '<button id="mention2" aria-label="@oblivion/brand">提及</button>';
  stubRect(doc.getElementById('copy'), { top: 20, left: 10, width: 40, height: 16 });
  stubRect(doc.getElementById('model'), { top: 40, left: 10, width: 60, height: 16 });
  stubRect(doc.getElementById('file'), { top: 60, left: 10, width: 50, height: 16 });
  stubRect(doc.getElementById('mention2'), { top: 80, left: 10, width: 80, height: 16 });
  press(win, 'f');
  const probe = win.oblivionVimc.probe();
  // 操作按钮（复制）与带版本号的按钮都不算引用；README.md 与 @提及 才算
  assert.deepEqual(probe.hints.tiers, { references: 2, content: 2, outer: 0 });
  assert.deepEqual(probe.hints.referenceSignals, ['ext', 'at']);
  const hints = [...doc.querySelectorAll('[data-vimc-hint]')];
  assert.equal(hints[0].style.top, '60px', '扩展名引用排最前');
  assert.equal(hints[1].style.top, '80px', '其次是 @ 提及');
  assert.equal(hints[2].style.top, '20px', '正文普通按钮排在引用之后');
  press(win, 'Escape');
});

test('页面内查找：滚动期间落点标记跟随重摆（不会错位）', () => {
  const booted = boot();
  const { doc, win, content } = scene(booted);
  content.textContent = 'alpha beta alpha';
  // 让标记活到测试结束：短延时（输入防抖 120ms）照常执行，长延时（标记淡出/清理）只记录不执行
  const pending = [];
  win.setTimeout = (fn, delay) => {
    if (typeof delay === 'number' && delay <= 200) {
      fn();
      return 1;
    }
    pending.push(fn);
    return pending.length;
  };
  win.clearTimeout = () => {};
  // rAF 也改成同步执行，好断言「滚动后立刻重摆」
  win.requestAnimationFrame = (fn) => { fn(); return 1; };
  win.cancelAnimationFrame = () => {};
  // 模拟滚动位移：内容越往上滚，矩形 top 越小
  let scrollOffset = 0;
  const rectAt = () => ({
    x: 40, y: 100 + scrollOffset, top: 100 + scrollOffset, left: 40,
    right: 88, bottom: 116 + scrollOffset, width: 48, height: 16,
  });
  win.Range.prototype.getClientRects = () => [rectAt()];
  win.Range.prototype.getBoundingClientRect = () => rectAt();

  press(win, '/');
  const field = doc.querySelector('[data-vimc-find-input]');
  field.value = 'alpha';
  field.dispatchEvent(new win.Event('input'));
  const box = doc.querySelector('[data-vimc-find-ping]');
  assert.ok(box !== null, '应当画出落点标记');
  assert.equal(box.style.top, '98px', '初始位置 = 命中矩形 top - 2');
  const before = win.oblivionVimc.probe().find.repositions;
  assert.ok(before >= 1);

  scrollOffset = -40; // 内容往上滚了 40px
  win.dispatchEvent(new win.Event('scroll'));
  assert.equal(box.style.top, '58px', '滚动后标记必须跟着重摆（这就是之前错位的原因）');
  assert.ok(win.oblivionVimc.probe().find.repositions > before, '重摆次数应当增加');

  press(win, 'Escape');
  assert.equal(doc.querySelectorAll('[data-vimc-find-ping]').length, 0, '关闭后标记清理');
});

test('排除规则命中时整体停用', () => {
  const booted = boot();
  const { viewport } = scene(booted);
  booted.win.oblivionVimc.set({ exclusions: [':http://127.0.0.1:19387/'] });
  const blocked = press(booted.win, 's');
  assert.equal(blocked.defaultPrevented, false);
  assert.equal(viewport.scrollTop, 0);
  assert.equal(booted.win.oblivionVimc.probe().excluded, true);

  booted.win.oblivionVimc.set({ exclusions: [':http://elsewhere.example/'] });
  press(booted.win, 's');
  assert.equal(viewport.scrollTop, 240);
});

test('allowWhileEditing 打开后输入框里也能翻页（仅限翻页类命令）', () => {
  const booted = boot();
  const { doc, composer, viewport } = scene(booted);
  booted.win.oblivionVimc.set({ allowWhileEditing: true });
  pinActive(doc, composer);

  press(doc.body, 's');
  assert.equal(viewport.scrollTop, 240);

  // i / f 在输入框里仍然不该被接管
  for (const letter of ['i', 'f']) {
    const event = press(composer, letter);
    assert.equal(event.defaultPrevented, false);
  }
});

test('关闭开关后不再接管；控制面可读状态', () => {
  const booted = boot();
  const { viewport } = scene(booted);
  booted.win.oblivionVimc.disable();
  const event = press(booted.win, 's');
  assert.equal(viewport.scrollTop, 0);
  assert.equal(event.defaultPrevented, false);

  const status = booted.win.oblivionVimc.status();
  assert.equal(status.enabled, false);
  assert.equal(status.keys.length, 17, '内置默认共 17 个键位（含 [ ] 轮次跳转与 / . , 查找）');
  assert.deepEqual(
    [...new Set(status.keys.map((key) => key.command))].sort(),
    ['findNext', 'findPrevious', 'focusInput', 'linkHints', 'nextTurn', 'openFind', 'previousTurn', 'scrollPageDown', 'scrollPageUp', 'scrollToBottom', 'scrollToTop', 'stepDown', 'stepLeft', 'stepRight', 'stepUp'],
  );
  assert.ok(booted.win.oblivionVimc.help().includes('w / s'));

  booted.win.oblivionVimc.enable();
  press(booted.win, 's');
  assert.equal(viewport.scrollTop, 240);
});

test('键位文本可改：map/run 覆盖内置默认，unmapAll 清空默认', () => {
  const booted = boot();
  const { viewport } = scene(booted);

  booted.win.oblivionVimc.set({ keyMappings: 'unmapAll\nmap j scrollPageDown\nmap k scrollPageUp' });
  assert.equal(press(booted.win, 's').defaultPrevented, false, 'unmapAll 后 s 不再绑定');
  assert.equal(viewport.scrollTop, 0);
  press(booted.win, 'j');
  assert.equal(viewport.scrollTop, 240);
  press(booted.win, 'k');
  assert.equal(viewport.scrollTop, 0);

  // 空串 = 回到内置默认
  booted.win.oblivionVimc.set({ keyMappings: '' });
  press(booted.win, 's');
  assert.equal(viewport.scrollTop, 240);
});

test('只读自检 probe() 报告锚点、键位、轮次与自身开销（不滚动、不聚焦）', () => {
  let handles = null;
  const booted = boot({ setup: (ctx) => { handles = scene(ctx); } });
  const { doc, composer, viewport } = handles;
  const focused = [];
  composer.focus = (options) => focused.push(options);
  doc.body.insertAdjacentHTML('beforeend', '<button id="probe-btn">x</button>');
  stubRect(doc.getElementById('probe-btn'), { top: 200, left: 20, width: 80, height: 24 });
  doc.body.insertAdjacentHTML('beforeend', '<div id="turn-a" data-chat-turn="1"></div>');
  stubRect(doc.getElementById('turn-a'), { top: 100, left: 0, width: 800, height: 200 });

  const probe = booted.win.oblivionVimc.probe();
  assert.equal(probe.vertical.target, 'div#viewport');
  assert.equal(probe.vertical.range, 3600);
  assert.equal(probe.input.via, '[data-composer-input]');
  assert.equal(probe.input.target, 'div#composer[data-composer-input]');
  assert.equal(probe.keys.active, 17);
  assert.equal(probe.keys.unsupported, 0);
  assert.equal(probe.keys.errors, 0);
  assert.equal(probe.hints.characters, 'dsavewrqcxz');
  assert.equal(probe.hints.candidates, 1);
  assert.deepEqual(probe.hints.sample, ['button#probe-btn']);
  assert.equal(probe.turns.count, 1);
  assert.equal(probe.excluded, false);
  assert.equal(viewport.scrollTop, 0, 'probe 不得滚动');
  assert.equal(focused.length, 0, 'probe 不得聚焦');

  // 不扫描的那一份（挂载自检用）：候选数报 null
  const light = booted.win.oblivionVimc.probe({ scan: false });
  assert.equal(light.hints.candidates, null);
  assert.equal(light.keys.active, 17);

  // 挂载心跳带「不扫描」的自检；渲染后自检（挂载 +1.5s）带完整自检。
  assert.deepEqual(booted.beats.map((beat) => beat.payload.command), ['mounted', 'probe']);
  assert.equal(booted.beats[0].payload.probe.hints.candidates, null, '挂载自检不扫描（不给启动添开销）');
  for (const beat of booted.beats) {
    assert.equal(beat.payload.probe.vertical.target, 'div#viewport');
    assert.equal(beat.payload.probe.keys.active, 17);
  }
  // 渲染后自检**确实扫了**（测试把 setTimeout 换成同步执行，所以它在 apply 期间就跑完，
  // 那时只有 scene 的 DOM；具体候选数由上面直接调用 probe() 的断言覆盖）
  assert.equal(typeof booted.beats[1].payload.probe.hints.candidates, 'number');
  assert.equal(doc.querySelectorAll('[data-vimc]').length, 0, '插件不往页面注入常驻节点');
});

test('只读自检带按键与扫描耗时（回答「会不会拖慢客户端」）', () => {
  const booted = boot();
  const { viewport } = scene(booted);
  press(booted.win, 's');
  press(booted.win, 's');
  assert.equal(viewport.scrollTop, 480);

  const probe = booted.win.oblivionVimc.probe();
  assert.ok(probe.perf.keySamples >= 2, '应当采到至少两次按键');
  assert.ok(probe.perf.keyAvgMs >= 0 && probe.perf.keyMaxMs >= 0);
  assert.ok(probe.perf.keyMaxMs < 50, `单次按键处理应当远小于一帧（实测 ${String(probe.perf.keyMaxMs)}ms）`);
  assert.ok(probe.hints.scanMs >= 0 && probe.hints.scanMs < 200, '自检扫描不应阻塞（本地小 DOM）');
});

test('[/] 轮次跳转：读到回答中间回本轮提问，已在提问顶部则继续上一条', () => {
  const booted = boot();
  const { doc, win, viewport } = scene(booted);
  doc.body.insertAdjacentHTML('beforeend', `
    <div id="turn-1" data-chat-turn="1"></div>
    <div id="turn-2" data-chat-turn="2"></div>
    <div id="turn-3" data-chat-turn="3"></div>
  `);
  // 内容坐标：轮 1 = 100、轮 2 = 900、轮 3 = 1800；矩形随 scrollTop 变化（模拟真实布局）
  const offsets = { 'turn-1': 100, 'turn-2': 900, 'turn-3': 1800 };
  for (const [id, offset] of Object.entries(offsets)) {
    const element = doc.getElementById(id);
    Object.defineProperty(element, 'getBoundingClientRect', {
      value: () => {
        const top = offset - viewport.scrollTop;
        return { x: 0, y: top, top, bottom: top + 400, left: 0, right: 800, width: 800, height: 400 };
      },
      configurable: true,
    });
  }

  // ① 读到轮 2 的回答中间 → 回到**本轮**提问
  viewport.scrollTo({ top: 1200 });
  const first = press(win, '[');
  assert.equal(first.defaultPrevented, true);
  assert.equal(viewport.scrollTop, 898, '轮 2 顶部 900 - 2px 上边距');

  // ② 已在提问顶部 → 再往上一条
  const second = press(win, '[');
  assert.equal(second.defaultPrevented, true);
  assert.equal(viewport.scrollTop, 98, '轮 1 顶部 100 - 2');

  // ③ 已经是最上面那一条 → 不吞键、不滚动
  const blocked = press(win, '[');
  assert.equal(blocked.defaultPrevented, false);
  assert.equal(viewport.scrollTop, 98);

  // ④ 下一条
  press(win, ']');
  assert.equal(viewport.scrollTop, 898);

  // 目标高亮用完即还原（不残留行内样式）
  assert.equal(doc.getElementById('turn-1').style.getPropertyValue('outline'), '');
  assert.equal(doc.getElementById('turn-2').style.getPropertyValue('outline'), '');
});

test('设置页可静态渲染（React 渲染期不抛错，且主要区块都在）', async () => {
  const booted = boot();
  scene(booted);
  const Panel = booted.slots[0].component;
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const html = renderToStaticMarkup(React.createElement(Panel, {}));

  for (const marker of [
    'Oblivion 键盘导航',
    `v${PACKAGE_VERSION}`,
    '键位（Vimium-C map / run 语法）',
    '滚动',
    '输入框（i / Esc）',
    '链接提示（f）',
    '兼容：导入 Vimium-C 选项导出',
    '排除规则与诊断',
    'map w scrollPageUp',
    'dsavewrqcxz',
  ]) {
    assert.ok(html.includes(marker), `设置页应当包含 ${marker}`);
  }
  // 未接管的命令清单与「生效键位」都要显示出来
  assert.ok(html.includes('生效键位'));
});

test('页面内查找：/ 打开、边打边找、Enter 提交并失焦、. 与 , 前后跳、Esc 关闭', () => {
  const booted = boot();
  const { doc, win, viewport, content } = scene(booted);
  // 搜索范围是会话正文（滚动容器内部）
  content.textContent = 'alpha beta alpha gamma ALPHA';

  const opened = press(win, '/');
  assert.equal(opened.defaultPrevented, true);
  const box = doc.querySelector('[data-vimc-find]');
  assert.ok(box !== null, '应当出现查找条');
  const field = doc.querySelector('[data-vimc-find-input]');
  const counter = doc.querySelector('[data-vimc-find-count]');
  const text = doc.querySelector('[data-vimc-find-text]');
  assert.ok(field !== null && counter !== null && text !== null);
  assert.equal(doc.activeElement, field, '焦点应当落在查找框（这样插件其余快捷键自动让位）');

  // 边打边找（setTimeout 被替成同步执行，所以 input 事件即触发搜索）
  field.value = 'alpha';
  field.dispatchEvent(new win.Event('input'));
  let stats = win.oblivionVimc.probe().find;
  assert.equal(stats.matches, 3, '小写查询按智能大小写 → 不区分大小写，命中 3 处（含 ALPHA）');
  assert.equal(stats.current, 1);
  assert.equal(stats.active, true);
  assert.equal(stats.committed, false);
  assert.equal(counter.textContent, '(3 处)', '计数按 Vimium/浏览器查找条的写法');

  // Enter → 下一个，并**提交**：输入框收起、焦点还给页面（这样 . 与 , 才不会被输入框吃掉）
  field.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  stats = win.oblivionVimc.probe().find;
  assert.equal(stats.current, 2);
  assert.equal(stats.committed, true);
  assert.equal(stats.active, true, '查找条仍在（变成只读 HUD）');
  assert.notEqual(doc.activeElement, field, '回车后查找框不聚焦');
  assert.equal(field.style.display, 'none', '输入框收起');
  assert.equal(text.style.display, 'inline');
  assert.equal(text.textContent, 'alpha', 'HUD 显示查询');
  assert.equal(counter.textContent, '(3 处)');

  // 失焦之后 . 与 , 直接前后跳
  const next = press(win, '.');
  assert.equal(next.defaultPrevented, true);
  assert.equal(win.oblivionVimc.probe().find.current, 3);
  press(win, '.');
  assert.equal(win.oblivionVimc.probe().find.current, 1, '到末尾回绕到 1');
  press(win, ',');
  assert.equal(win.oblivionVimc.probe().find.current, 3, '反向回绕');

  // 再按 / → 回到编辑态并全选查询
  press(win, '/');
  assert.equal(doc.activeElement, field, '再按 / 回到编辑态');
  assert.notEqual(field.style.display, 'none');
  assert.equal(field.selectionStart, 0);
  assert.equal(field.selectionEnd, 'alpha'.length, '全选查询，方便直接改');

  // Shift+Enter → 上一个
  field.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(win.oblivionVimc.probe().find.current, 2);

  // Esc → 关闭查找条（保留查询与命中，便于继续用 . 与 ,）
  field.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(doc.querySelector('[data-vimc-find]'), null);
  stats = win.oblivionVimc.probe().find;
  assert.equal(stats.active, false);
  assert.equal(stats.matches, 3);

  // 关掉之后 . / , 继续用上次查询
  press(win, '.');
  assert.equal(win.oblivionVimc.probe().find.current, 3);

  // HUD 形态下按 Esc（焦点在页面上）也要能关掉
  press(win, '/');
  const openField = doc.querySelector('[data-vimc-find-input]');
  openField.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(win.oblivionVimc.probe().find.active, true);
  const escOnPage = press(win, 'Escape');
  assert.equal(escOnPage.defaultPrevented, true);
  assert.equal(doc.querySelector('[data-vimc-find]'), null, 'HUD 形态下 Esc 关闭');

  // 查找框内的字母键不会被插件当成命令（输入框守卫）
  press(win, '/');
  const insideField = doc.querySelector('[data-vimc-find-input]');
  pinActive(doc, insideField);
  const letter = press(insideField, 'w');
  assert.equal(letter.defaultPrevented, false, '在查找框里打 w 应当是字母 w');
  assert.equal(viewport.scrollTop, 0, '不应触发翻页');
});

test('页面内查找：每次跳转都画出落点标记（不依赖 Custom Highlight）', () => {
  const booted = boot();
  const { doc, win, content } = scene(booted);
  content.textContent = 'alpha beta alpha';
  // happy-dom 没有布局：给 Range 打上矩形，好让落点标记与「已渲染」判定走真实分支
  const rect = { x: 40, y: 100, top: 100, left: 40, right: 88, bottom: 116, width: 48, height: 16 };
  win.Range.prototype.getClientRects = () => [rect];
  win.Range.prototype.getBoundingClientRect = () => rect;

  press(win, '/');
  const field = doc.querySelector('[data-vimc-find-input]');
  field.value = 'alpha';
  field.dispatchEvent(new win.Event('input'));
  let stats = win.oblivionVimc.probe().find;
  assert.equal(stats.matches, 2);
  const pingsAfterSearch = stats.pings;
  assert.ok(pingsAfterSearch >= 1, '搜索到命中就该有落点标记');
  assert.equal(stats.highlight, 'none', 'happy-dom 没有 CSS.highlights → 明确报 none（真实浏览器是 custom）');

  // 回车提交（失焦）→ 再按 . 前进：每个跳转都要有标记
  field.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  stats = win.oblivionVimc.probe().find;
  assert.equal(stats.current, 2);
  const pingsAfterEnter = stats.pings;
  assert.ok(pingsAfterEnter > pingsAfterSearch, '回车跳转也要画标记');

  const next = press(win, '.');
  assert.equal(next.defaultPrevented, true, '提交后 . 直接可用');
  stats = win.oblivionVimc.probe().find;
  assert.equal(stats.current, 1, '两个命中之间来回');
  assert.ok(stats.pings > pingsAfterEnter, '每次跳转都重新画标记');

  // 关闭查找条：标记与查找条一起清掉
  const esc = press(win, 'Escape');
  assert.equal(esc.defaultPrevented, true);
  assert.equal(doc.querySelectorAll('[data-vimc-find-ping]').length, 0);
  assert.equal(doc.querySelector('[data-vimc-find]'), null);
});

test('页面内查找：命中在折叠的 details 里时，跳转会先展开它', () => {
  const booted = boot();
  const { doc, win } = scene(booted);
  // 会话正文里放一个折叠分组，命中只在里面
  const viewport = doc.getElementById('viewport');
  viewport.insertAdjacentHTML('beforeend',
    '<details><summary>工具调用</summary><div id="folded">alpha hidden</div></details>');
  const details = doc.querySelector('details');
  assert.equal(details.open, false);

  // 折叠里的命中「没有矩形」→ 走「先展开再跳」那条分支
  const rect = { x: 10, y: 200, top: 200, left: 10, right: 60, bottom: 216, width: 50, height: 16 };
  win.Range.prototype.getClientRects = function getClientRects() {
    const element = this.startContainer.parentElement;
    return element !== null && element.closest('details') !== null ? [] : [rect];
  };
  win.Range.prototype.getBoundingClientRect = () => rect;

  press(win, '/');
  const field = doc.querySelector('[data-vimc-find-input]');
  field.value = 'alpha';
  field.dispatchEvent(new win.Event('input'));
  assert.equal(win.oblivionVimc.probe().find.matches, 1);

  // 回车提交：此时唯一命中在折叠区里 → 必须先展开才能看得见
  const enter = new win.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  field.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, true);
  assert.equal(details.open, true, '应当用官方开关把分组展开');
  assert.equal(win.oblivionVimc.probe().find.current, 1);
  assert.ok(win.oblivionVimc.probe().find.pings >= 1, '展开后要能看到落点标记');
});

test('页面内查找：regexFindMode 打开时按正则解释', () => {
  const booted = boot();
  const { doc, win, content } = scene(booted);
  content.textContent = 'item-1 item-22 item-333';
  booted.win.oblivionVimc.set({ regexFindMode: true });

  press(win, '/');
  const field = doc.querySelector('[data-vimc-find-input]');
  field.value = 'item-\\d{2}';
  field.dispatchEvent(new win.Event('input'));
  // 正则语义：`\\d{2}` 命中 item-22，也命中 item-333 的前两位（item-33）
  assert.equal(win.oblivionVimc.probe().find.matches, 2);
  assert.equal(win.oblivionVimc.probe().find.regex, true);

  field.value = 'item-\\d{3}';
  field.dispatchEvent(new win.Event('input'));
  assert.equal(win.oblivionVimc.probe().find.matches, 1, '\\d{3} 只匹配 item-333');

  field.value = 'item-('; // 非法正则
  field.dispatchEvent(new win.Event('input'));
  assert.equal(win.oblivionVimc.probe().find.matches, 0, '非法正则按无命中处理，不抛错');
});

test('翻页比例默认 0.6（输入框占位），历史默认 0.9/0.7 会被迁移', async () => {
  const seam = bootedSeam();
  assert.equal(seam.DEFAULT_CONFIG.pageRatioVertical, 0.6);
  assert.equal(seam.DEFAULT_PAGE_RATIO, 0.6);
  // 旧配置（没有 v0.2.2 才有的 regexFindMode 字段）里的历史默认值 → 迁到当前默认
  assert.equal(seam.normalizeConfig({ pageRatioVertical: 0.9, pageRatioHorizontal: 0.9 }).pageRatioVertical, 0.6);
  assert.equal(seam.normalizeConfig({ pageRatioVertical: 0.7, pageRatioHorizontal: 0.7 }).pageRatioVertical, 0.6);
  // 用户真正改过的值原样保留
  assert.equal(seam.normalizeConfig({ pageRatioVertical: 0.5 }).pageRatioVertical, 0.5);
  // v0.2.2 之后的存储带 regexFindMode：里面的 0.7 是用户自己的选择，不动
  assert.equal(seam.normalizeConfig({ regexFindMode: false, pageRatioVertical: 0.7 }).pageRatioVertical, 0.7);

  // 生效配置里也是 0.6
  const booted = boot();
  scene(booted);
  assert.equal(booted.win.oblivionVimc.status().config.pageRatioVertical, 0.6);
});

test('处理过的命令会写进诊断心跳（mounted / probe + 命令名）', () => {
  const booted = boot();
  const { viewport } = scene(booted);
  press(booted.win, 's');
  assert.deepEqual(booted.beats.map((beat) => beat.payload.command), ['mounted', 'probe', 'scrollPageDown']);
  assert.equal(booted.beats[0].url, '/oblivion-vimc/beat');
  assert.equal(booted.beats[0].payload.version, PACKAGE_VERSION);
  assert.equal(viewport.scrollTop, 240);
});

test('卸载（effect disposer）后按键不再被接管、提示浮层清理', () => {
  const booted = boot();
  const { doc, viewport } = scene(booted);
  doc.body.insertAdjacentHTML('beforeend', '<button id="unload-btn">x</button>');
  stubRect(doc.getElementById('unload-btn'), { top: 10, left: 10, width: 50, height: 20 });
  press(booted.win, 'f');
  assert.ok(doc.querySelector('[data-vimc-hints]') !== null);

  for (const dispose of booted.disposers) dispose();
  assert.equal(doc.querySelector('[data-vimc-hints]'), null, '卸载应清理浮层');
  press(booted.win, 's');
  assert.equal(viewport.scrollTop, 0);
  assert.equal(booted.win.oblivionVimc, undefined);
});

test('没有可滚容器时不吞键（让按键继续走宿主处理链）', () => {
  const booted = boot();
  scene(booted, { overflowY: 'hidden' });
  const event = press(booted.win, 's');
  assert.equal(event.defaultPrevented, false);
});

test('视口中心探测不到容器时，退回 DSH 正文滚动区 [data-conversation-scroll]', () => {
  const booted = boot();
  const { doc, win, viewport, content } = scene(booted, { overflowY: 'hidden' });
  doc.body.insertAdjacentHTML('beforeend', '<div id="thread" data-conversation-scroll></div>');
  const thread = makeScrollable(doc.getElementById('thread'), {
    clientWidth: 800,
    clientHeight: 500,
    scrollWidth: 800,
    scrollHeight: 5000,
  });
  win.document.elementFromPoint = () => content;

  const event = press(win, 's');
  assert.equal(thread.scrollTop, 300, '0.6 × 500 = 300');
  assert.equal(event.defaultPrevented, true);
  assert.equal(viewport.scrollTop, 0);
});
