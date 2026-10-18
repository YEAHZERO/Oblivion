#!/usr/bin/env node
/**
 * @oblivion/brand 自检：不依赖 DSHX（本机 Creator Mode+ 链路因 claim 依赖
 * POSIX `ps -o lstart=` 而全废，见 WORKSPACE.md 已知限制 1/3）。
 *
 * 验证的是「本机能验证的全部」：
 *   1. 产物存在、可被真实 import（证明没有裸导入解析问题）
 *   2. 导出形状符合本包的约定
 *   3. apply 真的把五条路由挂上去（桩 webServer 必须收到 RESTART_PATH / ORPHANS_PATH /
 *      PLUGINS_PATH / SESSION_MESSAGE_PATH / SESSION_TAIL_PATH），且期间**一条 warn 都没有**。作用域桩带
 *      Cordis 的服务访问守卫（读未声明的服务会抛），因此「在 webServer 作用域里读
 *      sessionController」这类写法会在这里直接失败 —— 它曾在真机上让整条路由消失。
 *      守卫本身还有一条**反向验证**（未声明会抛 / 未就绪不回调 / 声明后可读），
 *      否则「桩什么都不给」也能让上面那些断言假通过。
 *   4. 已装插件清单：临时 profile 上读出规格 / 启用态 / 版本 / 恢复命令
 *   5. 清单路由真跑：GET 200（返回体还得能被客户端校验器接受）、POST 405、外来 Origin 403
 *   6. profile 定位：DSH_PROFILE_DIR 优先，否则按 DSH_HOME 拼，都没有则 null
 *   7. 市场 registry 覆盖：未设 → 填 npmmirror
 *   8. 运营者优先：已经有人设过 → 一个字都不改
 *   9. 空白视同未设（必须与市场自己的 override() 语义一致）
 *   10. 幂等：连跑两次不抛、值不变
 *   11. 交叉验证：真的 import 市场的 lib/regions.js，确认解析结果被改向 npmmirror，
 *      且 GitHub 代理**不受影响**。市场没装则跳过，不算失败。
 *   12. 孤儿进程清扫的**判据面**（纯函数）：profile 目录推导、脚本正文（ASCII / 无 exit /
 *      字段齐全）、脚本输出解析（含各类坏输入）、装载开关真值表。
 *   13. 装载期清扫的两道门：开关关掉、传输目录不存在 —— 都不派生 PowerShell。
 *      这一条刻意只能这么验：真跑清扫会在开发机上**真的杀进程**，自检不许有这种副作用。
 *   14. 清扫路由真跑：POST 200（非 Windows 上 501），返回体带 `report` 形状。
 *   15. 会话消息的**判据面**（纯函数）：请求解析（含各类坏输入）/ 开关真值表 /
 *      错误码 → HTTP 状态。
 *   16. 会话注入路由真跑：405 / 403（外来 Origin、开关关闭）/ 400（坏 JSON、缺字段）/
 *      200（**真的**把消息交给了会话服务，形状与 `SessionPromptRequest` 对齐）/
 *      503（宿主里没有会话服务）/ 404（会话不存在，远端 code 透传）。
 *      桩服务只记录、不发送 —— 自检不许往用户真实会话里塞消息。
 *
 * 第 11 条是这组里唯一「跨包」的断言，也是 registry 改动的实质：它证明的不是
 * 「我们写了个环境变量」，而是「市场读了它、并按它换了镜像」。
 *
 * 输出带 PASS/FAIL/SKIP 前缀，退出码非 0 表示有失败项，便于挂进 CI。
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zstdCompressSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const results = [];
let failed = 0;
let skipped = 0;

/** 内部哨兵：check 回调返回它就记为 SKIP。 */
const SKIP = Symbol('skip');

async function check(name, fn) {
  try {
    const detail = await fn();
    if (detail === SKIP) {
      skipped += 1;
      results.push(['SKIP', name, '本机不适用']);
      return;
    }
    results.push(['PASS', name, detail ?? '']);
  } catch (error) {
    failed += 1;
    results.push(['FAIL', name, error?.message ?? String(error)]);
  }
}

const ENV = 'DSHM_NPM_MIRROR';
const MIRROR = 'https://registry.npmmirror.com';

/** 在指定的环境变量值下跑一段，跑完恢复原值（含「原本不存在」这一态）。 */
async function withEnv(value, fn, name = ENV) {
  const saved = process.env[name];
  const restore = () => {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  };
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return await fn();
  } finally {
    restore();
  }
}

/**
 * 忠实还原 Cordis 的**服务访问守卫**。
 *
 * 出处：`vendor/cordis/src/reflect.ts:144` —— 读一个**本作用域没 inject 过**的服务，
 * 拿到的是**异常**（`cannot get property "x" without inject`），不是 `undefined`。
 *
 * 这道守卫必须留在自检里：0.1.5 上线时就是桩太宽松（scope 里什么都给）漏掉了
 * 「在 webServer 作用域里读 sessionController」那一行，真机上整条路由在 register 之前
 * 炸掉，外部只看到 404。桩比真机宽松，等于把这类故障永久遮住。
 */
function guardedScope(available) {
  return new Proxy(available, {
    get(target, prop) {
      if (typeof prop === 'symbol' || Reflect.has(target, prop)) return Reflect.get(target, prop);
      throw new Error(`cannot get property "${String(prop)}" without inject`);
    },
  });
}

/**
 * 只记录、不做磁盘动作的桩 ctx。
 *
 * `inject` 与真实 Cordis 一致地守两条规矩：
 *   ① 收到几个依赖就只给那几个服务，且 scope 带**服务访问守卫**（读未声明的服务会抛）；
 *   ② 依赖没就绪（`options.sessionController: null`）时**根本不回调** —— Cordis 对
 *      不可用的依赖是让 fiber 挂着等，而不是拿 `undefined` 回调一次。
 * 于是「先挂路由、再单独 inject 会话服务」这条延迟绑定路径会被真正走到。
 *
 * `options.sessionController` 给 `null` 可造出「宿主里没有会话服务」的现场（验 503）。
 */
function makeCtx(options = {}) {
  const reg = { routes: [], effects: [], effectFns: [], logs: [], injected: [], prompts: [] };
  const controller =
    options.sessionController === null
      ? undefined
      : options.sessionController ?? {
          prompt: async (request) => {
            reg.prompts.push(request);
            return { accepted: true };
          },
        };
  const webServer = {
    register: (route) => {
      reg.routes.push(route);
      return () => {};
    },
  };
  return {
    reg,
    ctx: {
      logger: () => ({
        info: (message) => reg.logs.push(['info', message]),
        warn: (message) => reg.logs.push(['warn', message]),
      }),
      get: (name) => (name === 'sessionController' ? controller : undefined),
      inject: (deps, callback) => {
        for (const dep of deps) if (!reg.injected.includes(dep)) reg.injected.push(dep);
        const available = {};
        if (deps.includes('webServer')) available.webServer = webServer;
        if (deps.includes('sessionController')) {
          if (controller === undefined) return;
          available.sessionController = controller;
        }
        callback(guardedScope(available));
      },
      effect: (fn, label) => {
      reg.effects.push(label);
      reg.effectFns.push(fn);
    },
    },
  };
}

/** 假 response：把 writeHead/end 的结果记下来，供断言直接读。 */
function fakeResponse() {
  const captured = { status: 0, headers: {}, body: '' };
  const response = {
    writeHead(status, headers) {
      captured.status = status;
      captured.headers = headers ?? {};
    },
    end(chunk) {
      captured.body = typeof chunk === 'string' ? chunk : '';
    },
  };
  return { captured, response };
}

/**
 * 假 POST 请求：请求体由 `flush()` 推给已经注册的监听者。
 *
 * 用法必须是「先起 handler（它同步注册监听），再 flush，最后 await」：
 * ```
 * const pending = route.handler(request, response);
 * request.flush();
 * await pending;
 * ```
 * handler 在第一个 `await` 之前就把 `on('data'|'end')` 挂好了，所以 `flush()` 不会丢事件。
 */
function fakeRequest(body, headers = {}) {
  const listeners = { data: [], end: [], error: [] };
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    method: 'POST',
    headers,
    on(event, listener) {
      (listeners[event] ??= []).push(listener);
    },
    flush() {
      for (const listener of listeners.data) listener(Buffer.from(text, 'utf8'));
      for (const listener of listeners.end) listener();
    },
  };
}

function writeJson(file, value) {
  writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

/**
 * 造一个最小 profile：四条依赖分别覆盖 npm / 用户层补丁 / **组合层补丁** / 已装未启用。
 *
 * 「组合层补丁」这一路是 2026-10-06 修掉的漏判：`@oblivion/core` 与 `@oblivion/panel`
 * 不是被 profile 的用户层补丁挂上的，而是被 `@oblivion/bundle` 自己 `dsh.bundle.patch`
 * 里的 insert 行挂上的 —— 只看用户层就会把它们误标成「已装未启用」。
 */
function makeProfileFixture(root) {
  mkdirSync(join(root, 'node_modules', 'dsh-demo-panel'), { recursive: true });
  mkdirSync(join(root, 'node_modules', '@demo', 'linked'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'demo-stacked'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'dsh-demo-bundle'), { recursive: true });
  writeJson(join(root, 'package.json'), {
    dependencies: {
      'dsh-demo-panel': '^1.2.3',
      '@demo/linked': 'link:C:/Projects/demo',
      'demo-stacked': '^2.0.0',
      'demo-idle': '^0.0.5',
    },
    dsh: { profile: { bundles: ['dsh-demo-panel', 'dsh-demo-bundle'] } },
  });
  writeJson(join(root, 'node_modules', 'dsh-demo-panel', 'package.json'), {
    name: 'dsh-demo-panel',
    version: '1.2.9',
  });
  writeJson(join(root, 'node_modules', '@demo', 'linked', 'package.json'), {
    name: '@demo/linked',
    version: '9.9.9',
  });
  writeJson(join(root, 'node_modules', 'demo-stacked', 'package.json'), {
    name: 'demo-stacked',
    version: '2.0.1',
  });
  // 这个 bundle 自己声明补丁文件，补丁里插了 demo-stacked（组合层）。
  writeJson(join(root, 'node_modules', 'dsh-demo-bundle', 'package.json'), {
    name: 'dsh-demo-bundle',
    version: '3.0.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  });
  writeFileSync(
    join(root, 'node_modules', 'dsh-demo-bundle', 'cordis.patch.yml'),
    ['- insert:', '    - id: demo-stacked', "      name: 'demo-stacked'", ''].join('\n'),
    'utf8',
  );
  writeFileSync(
    join(root, 'cordis.patch.yml'),
    ['- id: demo-patch', '  insert:', "    - '@demo/linked'", ''].join('\n'),
    'utf8',
  );
  return root;
}

const mod = await import(pathToFileURL(join(ROOT, 'lib', 'index.js')).href);

/**
 * ⚠️ 装载时会真的去清扫孤儿进程（杀进程），自检不许有这种副作用 —— 先关掉。
 * 开关本身在第 13 条里单独验。
 */
process.env[mod.MOUNT_SWEEP_ENV] = 'off';

await check('产物存在且可 import', () => {
  const lib = join(ROOT, 'lib', 'index.js');
  assert.ok(existsSync(lib), 'lib/index.js 不存在，先运行 build');
  return 'lib/index.js';
});

await check('导出形状符合本包约定', () => {
  assert.equal(mod.RESTART_PATH, '/obl-brand/restart');
  assert.equal(mod.PLUGINS_PATH, '/obl-brand/plugins');
  assert.equal(mod.ORPHANS_PATH, '/obl-brand/orphans');
  assert.equal(mod.SESSION_MESSAGE_PATH, '/obl-brand/session/message');
  assert.equal(mod.SESSION_TAIL_PATH, '/obl-brand/session/tail');
  assert.equal(mod.MOUNT_SWEEP_ENV, 'OBLIVION_BRAND_ORPHAN_SWEEP');
  assert.equal(mod.SESSION_INJECT_ENV, 'OBLIVION_BRAND_SESSION_INJECT');
  assert.equal(mod.MARKET_REGISTRY_ENV, ENV);
  assert.equal(mod.MARKET_REGISTRY_MIRROR, MIRROR);
  assert.equal(typeof mod.apply, 'function');
  assert.equal(typeof mod.restoreCommand, 'function');
  assert.equal(typeof mod.normalizePluginList, 'function');
  assert.equal(typeof mod.readInstalledPlugins, 'function');
  assert.equal(typeof mod.resolveProfile, 'function');
  assert.equal(typeof mod.sweepTransportOrphans, 'function');
  assert.equal(typeof mod.sweepOnMount, 'function');
  assert.equal(typeof mod.parseSweepOutput, 'function');
  assert.equal(typeof mod.resolveTransportProfileDir, 'function');
  assert.equal(typeof mod.parseSessionMessageRequest, 'function');
  assert.equal(typeof mod.sessionInjectDisabled, 'function');
  assert.equal(typeof mod.describePromptFailure, 'function');
  assert.equal(typeof mod.httpStatusForPromptFailure, 'function');
  assert.equal(typeof mod.readRequestBody, 'function');
  // 会话读回面（只读）：解析查询 / 切帧解码 / 抽消息 / 找文件 / 读尾窗 / DSH_HOME 规则。
  assert.equal(typeof mod.parseTailQuery, 'function');
  assert.equal(typeof mod.readSessionTail, 'function');
  assert.equal(typeof mod.decodeFrames, 'function');
  assert.equal(typeof mod.extractTailMessages, 'function');
  assert.equal(typeof mod.findSessionFile, 'function');
  assert.equal(typeof mod.readTailBytes, 'function');
  assert.equal(typeof mod.resolveDshHome, 'function');
  assert.equal(typeof mod.textOfContent, 'function');
  return '五条路径 / 两个开关常量 / 恢复命令 / 清单校验 / 清扫面 / 会话注入面 / 会话读回面 / apply 齐备';
});

await check('apply 挂载八条路由；七条只要 webServer，会话注入额外绑 sessionController', async () => {
  const { ctx, reg } = makeCtx();
  await withEnv(undefined, () => mod.apply(ctx));
  assert.deepEqual(
    reg.injected,
    ['webServer', 'sessionController'],
    '会话服务要单独 inject（先挂路由、后绑服务），其余七条只依赖 webServer（读回/任务查询/更新也不需要宿主服务）',
  );
  assert.equal(reg.routes.length, 8, '应注册八条路由（重启 + 任务查询 + 孤儿清扫 + 已装插件 + 更新检查 + 更新应用 + 会话消息 + 会话读回）');
  const restart = reg.routes.find((route) => route.path === mod.RESTART_PATH);
  const tasks = reg.routes.find((route) => route.path === mod.TASKS_PATH);
  const orphans = reg.routes.find((route) => route.path === mod.ORPHANS_PATH);
  const plugins = reg.routes.find((route) => route.path === mod.PLUGINS_PATH);
  const updates = reg.routes.find((route) => route.path === mod.UPDATES_PATH);
  const updatesApply = reg.routes.find((route) => route.path === mod.UPDATES_APPLY_PATH);
  const session = reg.routes.find((route) => route.path === mod.SESSION_MESSAGE_PATH);
  const tail = reg.routes.find((route) => route.path === mod.SESSION_TAIL_PATH);
  assert.ok(restart, '缺少重启路由');
  assert.ok(tasks, '缺少任务查询路由');
  assert.ok(orphans, '缺少孤儿进程清扫路由');
  assert.ok(plugins, '缺少已装插件清单路由');
  assert.ok(updates, '缺少更新检查路由');
  assert.ok(updatesApply, '缺少更新应用路由');
  assert.ok(session, '缺少会话消息路由');
  assert.ok(tail, '缺少会话读回路由');
  for (const route of [restart, tasks, orphans, plugins, updates, updatesApply, session, tail]) {
    assert.equal(route.kind, 'exact');
    assert.equal(typeof route.handler, 'function');
  }
  // 挂载失败在桩里只表现为「少一条路由 + 一条 warn」；warn 一起断言，
  // 否则将来有人把危险读取加回来，只会在真机上表现为 404（0.1.5 的真实故障）。
  const warns = reg.logs.filter(([level]) => level === 'warn');
  assert.deepEqual(warns, [], 'apply 期间不得有 warn（挂载异常会在这里留痕）');
  return reg.routes.map((route) => route.path).join(' + ');
});

await check('fiber 语义：effect 回调必须返回 disposer（挂载时不自我注销）', async () => {
  const { ctx, reg } = makeCtx();
  await withEnv(undefined, () => mod.apply(ctx));
  const fns = reg.effectFns.filter((fn) => typeof fn === 'function');
  assert.ok(fns.length > 0, 'apply 必须注册至少一个 effect');
  for (const fn of fns) {
    const dispose = fn();
    assert.equal(
      typeof dispose,
      'function',
      'effect 回调必须返回 dispose 函数 —— 写成 () => { disposeA(); disposeB(); } 会在挂载瞬间把路由注销掉（2026-10-18 真机：/obl-brand/updates 404 但日志打了 mounted）',
    );
  }
  return String(fns.length) + ' 个 effect 回调均返回 disposer';
});

await check('桩的守卫本身可信：未声明的服务读取会抛、未就绪的依赖不回调', () => {
  const { ctx, reg } = makeCtx();
  let undeclared = null;
  ctx.inject(['webServer'], (scope) => {
    try {
      void scope.sessionController;
    } catch (error) {
      undeclared = error;
    }
  });
  assert.ok(undeclared, '在只声明 webServer 的作用域里读 sessionController 必须抛');
  assert.match(undeclared.message, /without inject/, '错误口径要与 Cordis 一致');

  const missing = makeCtx({ sessionController: null });
  let called = false;
  missing.ctx.inject(['sessionController'], () => {
    called = true;
  });
  assert.equal(called, false, '依赖没就绪时 Cordis 不回调，桩也不许回调');
  assert.deepEqual(missing.reg.injected, ['sessionController'], '未回调也要记账（调用方声明过它）');

  // 反过来：声明过就真的能读到（否则上面两条会因为「桩什么都不给」而假通过）
  let seen = null;
  ctx.inject(['sessionController'], (scope) => {
    seen = scope.sessionController;
  });
  assert.equal(typeof seen?.prompt, 'function', '声明过的依赖必须真的可读');
  assert.deepEqual(reg.injected, ['webServer', 'sessionController']);
  return '未声明会抛 / 未就绪不回调 / 声明后可读 —— 三条互为反例';
});

await check('已装插件清单：临时 profile 上读出规格 / 启用态 / 挂载层 / 版本', () => {
  const root = mkdtempSync(join(tmpdir(), 'obl-brand-profile-'));
  try {
    makeProfileFixture(root);
    const payload = mod.readInstalledPlugins({ profile: 'demo', dir: root }, 1234);
    assert.equal(payload.profile, 'demo');
    assert.equal(payload.profileDir, root);
    assert.equal(payload.generatedAt, 1234);
    assert.deepEqual(payload.problems, [], '最小夹具不该有读取问题');

    const names = payload.entries.map((entry) => entry.name);
    assert.equal(names.length, 4);
    assert.deepEqual(names, [...names].sort((left, right) => left.localeCompare(right)), '应按包名排序');

    const demo = payload.entries.find((entry) => entry.name === 'dsh-demo-panel');
    assert.equal(demo.kind, 'npm');
    assert.equal(demo.version, '1.2.9', '版本要读 node_modules 里实际装到的');
    assert.equal(demo.bundled, true);
    assert.equal(demo.patched, false);
    assert.equal(demo.layer, 'bundles');
    assert.equal(demo.active, true);
    assert.equal(demo.restore, 'dsh plugin --profile demo add ^1.2.3');

    const linked = payload.entries.find((entry) => entry.name === '@demo/linked');
    assert.equal(linked.kind, 'link');
    assert.equal(linked.patched, true, '补丁文件里出现即视为会被挂载');
    assert.equal(linked.bundled, false);
    assert.equal(linked.layer, 'user-patch', 'profile 自己的 cordis.patch.yml = 用户层');
    assert.equal(linked.active, true);
    assert.equal(linked.version, '9.9.9');
    assert.equal(linked.restore, "dsh plugin --profile demo add 'link:C:/Projects/demo'", '含冒号的规格必须加引号');

    const stacked = payload.entries.find((entry) => entry.name === 'demo-stacked');
    assert.equal(stacked.bundled, false, '它不在 dsh.profile.bundles 里');
    assert.equal(stacked.patched, true, '它被某个 bundle 自己的补丁文件插上了');
    assert.equal(stacked.layer, 'bundle-patch', '组合层补丁也是「已启用」——这正是 core/panel 那一类');
    assert.equal(stacked.active, true);
    assert.equal(stacked.version, '2.0.1');
    assert.equal(mod.statusLabel(stacked), '已启用');

    const idle = payload.entries.find((entry) => entry.name === 'demo-idle');
    assert.equal(idle.active, false, '既不在 bundles 也没有任何一层补丁 = 已装未启用');
    assert.equal(idle.layer, 'none');
    assert.equal(idle.version, null, '没装到磁盘的版本读不到就是 null');
    assert.equal(mod.statusLabel(idle), '已装未启用');

    assert.equal(mod.layerLabel('bundles'), '组合层');
    assert.equal(mod.layerLabel('bundle-patch'), '组合层补丁');
    assert.equal(mod.layerLabel('user-patch'), '用户层补丁');
    assert.equal(mod.layerLabel('none'), '');
    assert.equal(mod.layerLabel(undefined), '', '旧宿主没这个字段时不显示层，不猜');
    return `${payload.entries.length} 条：bundles / 用户层补丁 / 组合层补丁 / 已装未启用`;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await check('清单路由真跑：GET 200 / POST 405 / 外来 Origin 403', async () => {
  const root = mkdtempSync(join(tmpdir(), 'obl-brand-route-'));
  const savedDir = process.env.DSH_PROFILE_DIR;
  const savedProfile = process.env.DSH_PROFILE;
  try {
    makeProfileFixture(root);
    process.env.DSH_PROFILE_DIR = root;
    process.env.DSH_PROFILE = 'demo';

    const { ctx, reg } = makeCtx();
    await withEnv(undefined, () => mod.apply(ctx));
    const route = reg.routes.find((item) => item.path === mod.PLUGINS_PATH);
    assert.ok(route, '清单路由未注册');

    const ok = fakeResponse();
    await route.handler({ method: 'GET', headers: {} }, ok.response);
    assert.equal(ok.captured.status, 200);
    const payload = JSON.parse(ok.captured.body);
    assert.equal(payload.ok, true);
    assert.equal(payload.profile, 'demo');
    assert.equal(payload.entries.length, 4);
    const normalized = mod.normalizePluginList(payload);
    assert.ok(normalized !== null, '宿主返回体应能被客户端校验器接受');
    assert.equal(normalized.entries.length, 4);
    assert.equal(normalized.entries.find((entry) => entry.name === 'demo-idle').active, false);
    assert.equal(
      normalized.entries.find((entry) => entry.name === 'demo-stacked').layer,
      'bundle-patch',
      '挂载层要能穿过校验器到达浏览器半边（否则界面只会说「已启用」而说不出是哪一层）',
    );
    // 旧宿主没有 layer 字段时按 bundled/patched 退化推断，不编造新层。
    const legacy = mod.normalizePluginList({
      profile: 'demo',
      entries: [{ name: 'x', spec: '^1.0.0', restore: 'dsh plugin --profile demo add ^1.0.0', patched: true }],
    });
    assert.equal(legacy.entries[0].layer, 'user-patch');

    const wrongMethod = fakeResponse();
    await route.handler({ method: 'POST', headers: {} }, wrongMethod.response);
    assert.equal(wrongMethod.captured.status, 405);

    const foreign = fakeResponse();
    await route.handler({ method: 'GET', headers: { origin: 'https://evil.example' } }, foreign.response);
    assert.equal(foreign.captured.status, 403, '清单含本机绝对路径，外来页面不能读');

    return '200（含返回体形状）/ 405 / 403';
  } finally {
    if (savedDir === undefined) delete process.env.DSH_PROFILE_DIR;
    else process.env.DSH_PROFILE_DIR = savedDir;
    if (savedProfile === undefined) delete process.env.DSH_PROFILE;
    else process.env.DSH_PROFILE = savedProfile;
    rmSync(root, { recursive: true, force: true });
  }
});

/**
 * 会话读回路由（只读）：真跑一遍。
 *
 * 会话数据用**合成文件**（不碰用户真实会话）：多帧拼接、每帧一段 JSONL —— 与 DSH 的
 * `session.v4.jsonl.zstd` 同形，因此「切帧 → 解压 → 抽消息」这条链是被真的走通的，
 * 而不是只断言了一个函数存在。
 */
await check('会话读回路由真跑：回答 200 / 思维链不进回答 / 参数与穿越拦截 / 404 / 405 / 403 / 共用开关', async () => {
  const root = mkdtempSync(join(tmpdir(), 'obl-brand-tail-'));
  const savedHome = process.env.DSH_HOME;
  try {
    const sessionId = 'session-abc12345-1111-2222-3333-444455556666';
    const dir = join(root, 'sessions', '--C-Projects-Oblivion--', sessionId);
    mkdirSync(dir, { recursive: true });
    const records = [
      { type: 'user/message', seq: 10, time: 1792196000000, data: { role: 'user', content: [{ type: 'text', text: '第一问' }] } },
      {
        type: 'assistant/message',
        seq: 11,
        time: 1792196001000,
        data: {
          message: {
            role: 'assistant',
            content: [
              { type: 'reasoning', text: '这是思维链，不该出现在回答里' },
              { type: 'text', text: '第一答' },
            ],
          },
        },
      },
      { type: 'session/end-seed', seq: 12, time: 1792196002000, data: {} },
      { type: 'user/message', seq: 13, time: 1792196003000, data: { role: 'user', content: [{ type: 'text', text: '第二问' }] } },
      { type: 'assistant/message', seq: 14, time: 1792196004000, data: { message: { role: 'assistant', content: [{ type: 'text', text: '第二答' }] } } },
    ];
    const frames = records.map((record) => zstdCompressSync(Buffer.from(`${JSON.stringify(record)}\n`, 'utf8')));
    writeFileSync(join(dir, mod.SESSION_LOG_FILE), Buffer.concat(frames));
    process.env.DSH_HOME = root;

    const { ctx, reg } = makeCtx();
    await withEnv(undefined, () => mod.apply(ctx));
    const route = reg.routes.find((item) => item.path === mod.SESSION_TAIL_PATH);
    assert.ok(route, '读回路由未注册');

    const call = async (url, headers = {}) => {
      const captured = fakeResponse();
      await route.handler({ method: 'GET', url, headers }, captured.response);
      return captured;
    };

    const ok = await call(`${mod.SESSION_TAIL_PATH}?session=${sessionId}&limit=1`);
    assert.equal(ok.captured.status, 200, ok.captured.body);
    const payload = JSON.parse(ok.captured.body);
    assert.equal(payload.ok, true);
    assert.equal(payload.messages.length, 1, 'limit=1 只回最后一条');
    assert.equal(payload.messages[0].role, 'assistant');
    assert.equal(payload.messages[0].text, '第二答');
    assert.equal(payload.stats.frames, 5, '五帧都要解出来（含不关心的记录类型）');
    assert.equal(payload.stats.brokenFrames, 0);
    assert.equal(payload.stats.fileBytes, Buffer.concat(frames).length);

    const all = await call(`${mod.SESSION_TAIL_PATH}?session=${sessionId}&limit=50`);
    assert.deepEqual(
      JSON.parse(all.captured.body).messages.map((message) => [message.role, message.text]),
      [
        ['user', '第一问'],
        ['assistant', '第一答'],
        ['user', '第二问'],
        ['assistant', '第二答'],
      ],
      '思维链（reasoning 块）不得混进回答；非消息记录要跳过',
    );

    const defaultLimit = await call(`${mod.SESSION_TAIL_PATH}?session=${sessionId}`);
    assert.equal(JSON.parse(defaultLimit.captured.body).messages.length, 4, '缺省 limit 应给出全部');

    assert.equal((await call(`${mod.SESSION_TAIL_PATH}?session=${sessionId}&limit=99`)).captured.status, 400, 'limit 超上限要拒绝');
    assert.equal((await call(`${mod.SESSION_TAIL_PATH}?session=${sessionId}&limit=abc`)).captured.status, 400);
    assert.equal((await call(mod.SESSION_TAIL_PATH)).captured.status, 400, '缺 session 要拒绝');
    assert.equal(
      (await call(`${mod.SESSION_TAIL_PATH}?session=${encodeURIComponent('../../../../etc/passwd')}`)).captured.status,
      400,
      '会话 id 直接拼路径，必须挡住穿越',
    );
    assert.equal((await call(`${mod.SESSION_TAIL_PATH}?session=session-nope`)).captured.status, 404);

    const wrongMethod = fakeResponse();
    await route.handler({ method: 'POST', url: mod.SESSION_TAIL_PATH, headers: {} }, wrongMethod.response);
    assert.equal(wrongMethod.captured.status, 405);

    const foreign = await call(`${mod.SESSION_TAIL_PATH}?session=${sessionId}`, { origin: 'https://evil.example' });
    assert.equal(foreign.captured.status, 403, '会话正文是私人内容，外来页面不能读');

    const off = await withEnv('off', () => call(`${mod.SESSION_TAIL_PATH}?session=${sessionId}`), mod.SESSION_INJECT_ENV);
    assert.equal(off.captured.status, 403, '与注入路由共用同一个运营者开关');

    // `DSH_HOME` 规则：环境变量优先（去空白）、空串视同未设。
    assert.equal(mod.resolveDshHome({ DSH_HOME: ' D:\\x ' }, 'C:\\home'), 'D:\\x');
    assert.equal(mod.resolveDshHome({ DSH_HOME: '   ' }, 'C:\\home'), join('C:\\home', '.dsh'));
    assert.equal(mod.resolveDshHome({}, 'C:\\home'), join('C:\\home', '.dsh'));

    return '200 / reasoning 不进回答 / 400×4 / 404 / 405 / 403×2 / DSH_HOME 三态';
  } finally {
    if (savedHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = savedHome;
    rmSync(root, { recursive: true, force: true });
  }
});

await check('profile 定位：DSH_PROFILE_DIR 优先，否则按 DSH_HOME 拼', () => {
  const byDir = mod.resolveProfile({ DSH_PROFILE_DIR: 'C:\\p\\desktop', DSH_PROFILE: 'desktop' }, '');
  assert.equal(byDir.dir, 'C:\\p\\desktop');
  assert.equal(byDir.profile, 'desktop');

  const byHome = mod.resolveProfile({ DSH_HOME: 'C:\\h', DSH_PROFILE: 'other' }, '');
  assert.equal(byHome.dir, join('C:\\h', 'profiles', 'other'));
  assert.equal(byHome.profile, 'other');

  const byFallback = mod.resolveProfile({}, 'C:\\Users\\x');
  assert.equal(byFallback.dir, join('C:\\Users\\x', '.dsh', 'profiles', 'desktop'));

  assert.equal(mod.resolveProfile({}, ''), null, '没有 DSH_HOME 也没有 homeDir 时应报 null');
  return 'DSH_PROFILE_DIR / DSH_HOME / homedir 兜底 / null';
});

await check('市场 registry 覆盖：未设时填 npmmirror', async () => {
  const { ctx } = makeCtx();
  const applied = await withEnv(undefined, async () => {
    mod.apply(ctx);
    return process.env[ENV];
  });
  assert.equal(applied, MIRROR, '未设时应填上 npmmirror');
  return `${ENV}=${applied}`;
});

await check('运营者优先：已设时一个字都不改', async () => {
  const mine = 'https://registry.example.test/npm';
  const { ctx, reg } = makeCtx();
  const applied = await withEnv(mine, async () => {
    mod.apply(ctx);
    return process.env[ENV];
  });
  assert.equal(applied, mine, '已有时不得被覆盖');
  assert.ok(
    reg.logs.some(([, message]) => message.includes('不覆盖')),
    '应留下一行「不覆盖」的日志，便于现场排查',
  );
  return `保持 ${mine}`;
});

await check('空白视同未设（与市场 override() 语义一致）', async () => {
  const { ctx } = makeCtx();
  const applied = await withEnv('   ', async () => {
    mod.apply(ctx);
    return process.env[ENV];
  });
  assert.equal(applied, MIRROR, '纯空白应视同未设');
  return '空白 → ' + applied;
});

await check('幂等：连跑两次不抛且值不变', async () => {
  const { ctx } = makeCtx();
  const applied = await withEnv(undefined, async () => {
    mod.apply(ctx);
    const first = process.env[ENV];
    mod.apply(ctx);
    const second = process.env[ENV];
    assert.equal(first, second, '两次 apply 结果必须一致');
    return second;
  });
  assert.equal(applied, MIRROR);
  return '两次 apply → ' + applied;
});

await check('交叉验证：市场真的按这个变量换了镜像（含 GitHub 代理不变）', async () => {
  const regions = join(homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', 'dshmarket', 'lib', 'regions.js');
  if (!existsSync(regions)) return SKIP;
  const market = await import(pathToFileURL(regions).href);

  const before = market.routesFor('china', {}).npmRegistry;
  const after = await withEnv(undefined, async () => {
    const { ctx } = makeCtx();
    mod.apply(ctx);
    return market.routesFor('china', process.env);
  });

  assert.equal(after.npmRegistry, MIRROR, '市场应改用 npmmirror');
  assert.equal(
    after.githubProxy,
    market.routesFor('china', {}).githubProxy,
    'GitHub 代理不得被本次覆盖改动',
  );
  assert.equal(
    after.catalog[0].registry,
    MIRROR,
    '目录源 dsh-plugin-catalog 也应一起改向（否则列表仍从旧镜像拉）',
  );
  return `${before} → ${after.npmRegistry}；GitHub 保持 ${after.githubProxy}`;
});

await check('孤儿清扫判据：目录推导 / 脚本正文 / 输出解析', () => {
  // 目录推导必须与 web-login 同源（DSH_HOME 优先；空白视同未设）
  assert.equal(
    mod.resolveTransportProfileDir({ DSH_HOME: 'C:\\h' }, 'C:\\home'),
    join('C:\\h', 'web-login', 'transport-profile'),
  );
  assert.equal(
    mod.resolveTransportProfileDir({ DSH_HOME: '   ' }, 'C:\\home'),
    join('C:\\home', '.dsh', 'web-login', 'transport-profile'),
  );
  assert.equal(
    mod.resolveTransportProfileDir({}, 'C:\\home'),
    join('C:\\home', '.dsh', 'web-login', 'transport-profile'),
  );

  const script = mod.ORPHAN_SCRIPT;
  // 注释里出现英文 exit 是允许的；这里禁的是**语句** exit（见下）
  const code = script
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  // PS 5.1 对无 BOM 的 .ps1 按 ANSI 解码：正文里一旦有非 ASCII 就在解析期炸
  assert.ok(/^[\x00-\x7F]*$/.test(script), '清扫脚本正文必须全 ASCII');
  // exit 会把「用 & 调用它的」重启 helper 一起结束（同会话），现象是面板说已受理、应用不重启
  assert.ok(!/\bexit\b/.test(code), '脚本语句里不得出现 exit');
  // $PID 是 PS 只读自动变量，`foreach ($pid in ...)` 会直接抛错
  assert.ok(!/\$pid\b/.test(script), '$pid 只读，不能当循环变量');
  // -Property 是白名单：漏了 ExecutablePath，过滤器会把所有进程都跳过（实测 347/347 为空）
  assert.match(script, /Get-CimInstance Win32_Process -Property[^\n]*ExecutablePath/);
  assert.match(script, /ParentProcessId/);
  assert.match(script, /ValidateSet\('orphans', 'all'\)/, '两种模式都要能选');

  // 输出解析：外部进程的输出按不可信输入处理
  assert.deepEqual(
    mod.parseSweepOutput('noise\n{"ok":true,"mode":"orphans","scanned":347,"matched":8,"killed":[1,2],"failed":[]}'),
    { mode: 'orphans', scanned: 347, matched: 8, killed: [1, 2], failed: [] },
    '取最后一行、只看 JSON',
  );
  assert.equal(mod.parseSweepOutput(''), null);
  assert.equal(mod.parseSweepOutput('not json'), null);
  assert.equal(
    mod.parseSweepOutput('{"ok":false,"mode":"orphans","scanned":1,"matched":0,"killed":[],"failed":[]}'),
    null,
    'ok=false 不算可用报告',
  );
  assert.equal(
    mod.parseSweepOutput('{"ok":true,"mode":"all","scanned":1,"matched":0,"killed":["1"],"failed":[]}'),
    null,
    'PID 必须是整数',
  );
  assert.equal(
    mod.parseSweepOutput('{"ok":true,"mode":"nope","scanned":1,"matched":0,"killed":[],"failed":[]}'),
    null,
    '未知模式拒绝',
  );

  assert.match(
    mod.describeSweep({ mode: 'orphans', scanned: 10, matched: 0, killed: [], failed: [] }),
    /无孤儿进程/,
  );
  assert.match(
    mod.describeSweep({ mode: 'orphans', scanned: 10, matched: 3, killed: [1, 2], failed: [3] }),
    /清理 2 个孤儿进程（扫描 10 个进程，命中 3 个传输进程，1 个结束失败）/,
  );
  return '目录推导 3 / 正文 6 项 / 解析 6 例 / 摘要 2 例';
});

await check('装载期清扫的两道门都不派生 PowerShell', async () => {
  const gate = mkdtempSync(join(tmpdir(), 'obl-brand-sweep-gate-'));
  const empty = mkdtempSync(join(tmpdir(), 'obl-brand-sweep-empty-'));
  const scriptPath = mod.ORPHAN_SCRIPT_PATH;
  try {
    // ① 开关关掉：目录**存在**（最容易误伤的现场），但一个字都不动
    mkdirSync(join(gate, '.dsh', 'web-login', 'transport-profile'), { recursive: true });
    const offLogs = [];
    mod.sweepOnMount(
      { info: (message) => offLogs.push(String(message)), warn: (message) => offLogs.push('WARN ' + String(message)) },
      { [mod.MOUNT_SWEEP_ENV]: 'off', DSH_HOME: join(gate, '.dsh') },
      gate,
    );

    // ② 传输目录不存在（web-login 从没跑过）：静默返回
    const quietLogs = [];
    mod.sweepOnMount(
      { info: (message) => quietLogs.push(String(message)), warn: (message) => quietLogs.push('WARN ' + String(message)) },
      { DSH_HOME: join(empty, '.dsh') },
      empty,
    );

    // 真派生了的话，一秒出头就会写出脚本 / 记日志 —— 等它一轮再断言
    rmSync(scriptPath, { force: true });
    await new Promise((resolve) => setTimeout(resolve, 1500));

    assert.equal(offLogs.length, 1, '关闭时只应留一句说明');
    assert.match(offLogs[0], /关闭/);
    assert.deepEqual(quietLogs, [], '没有传输目录时不该记任何东西');
    assert.ok(!existsSync(scriptPath), '两道门都不该派生 PowerShell（否则会写出清扫脚本）');
    return '开关关闭 → 1 句说明；无目录 → 静默；均未派生';
  } finally {
    rmSync(gate, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  }
});

await check('清扫路由真跑：405 / 外来 Origin 403 / POST 200（只杀孤儿）', async () => {
  const { ctx, reg } = makeCtx();
  await withEnv(undefined, () => mod.apply(ctx));
  const route = reg.routes.find((item) => item.path === mod.ORPHANS_PATH);
  assert.ok(route, '清扫路由未注册');

  const wrongMethod = fakeResponse();
  await route.handler({ method: 'GET', headers: {} }, wrongMethod.response);
  assert.equal(wrongMethod.captured.status, 405);

  const foreign = fakeResponse();
  await route.handler({ method: 'POST', headers: { origin: 'https://evil.example' } }, foreign.response);
  assert.equal(foreign.captured.status, 403, '会杀进程的接口不能对外来页面开放');

  const ok = fakeResponse();
  await route.handler({ method: 'POST', headers: {} }, ok.response);
  if (process.platform !== 'win32') {
    assert.equal(ok.captured.status, 501, '非 Windows 应明确回 501');
    return '非 Windows → 501';
  }
  assert.equal(ok.captured.status, 200, ok.captured.body);
  const payload = JSON.parse(ok.captured.body);
  assert.equal(payload.ok, true);
  assert.equal(payload.report.mode, 'orphans');
  assert.ok(Array.isArray(payload.report.killed), '报告要带 killed 列表');
  assert.equal(typeof payload.summary, 'string');
  return payload.summary;
});

await check('会话消息：请求解析（纯函数）、开关真值表、失败归类', () => {
  assert.equal(mod.SESSION_MESSAGE_PATH, '/obl-brand/session/message');
  assert.equal(mod.SESSION_INJECT_ENV, 'OBLIVION_BRAND_SESSION_INJECT');
  assert.equal(mod.MAX_SESSION_MESSAGE_CHARS, 20000);

  assert.deepEqual(
    mod.parseSessionMessageRequest({ sessionId: ' s1 ', text: 'hello', mode: 'steer' }, 'uuid-fallback'),
    {
      ok: true,
      value: {
        requestId: 'uuid-fallback',
        sessionId: 's1',
        mode: 'steer',
        content: [{ type: 'text', text: 'hello' }],
      },
    },
    'sessionId 去空白 / 未给 requestId 用兜底值',
  );
  // 调用方自带幂等键必须优先（脚本重试才真的幂等）
  assert.equal(
    mod.parseSessionMessageRequest({ sessionId: 's1', text: 'hi', requestId: ' mine ' }, 'fallback').value
      .requestId,
    'mine',
  );
  // mode 缺省 = queue
  assert.equal(mod.parseSessionMessageRequest({ sessionId: 's1', text: 'hi' }, 'f').value.mode, 'queue');

  for (const bad of [null, undefined, [], 'x', 42, true]) {
    assert.equal(mod.parseSessionMessageRequest(bad, 'f').ok, false, '非对象必须拒绝');
  }
  assert.match(mod.parseSessionMessageRequest({ text: 'hi' }, 'f').error, /sessionId/);
  assert.match(mod.parseSessionMessageRequest({ sessionId: 's1' }, 'f').error, /text/);
  assert.match(mod.parseSessionMessageRequest({ sessionId: 's1', text: '   ' }, 'f').error, /text/);
  assert.match(mod.parseSessionMessageRequest({ sessionId: 's1', text: 'hi', mode: 'now' }, 'f').error, /mode/);
  assert.equal(
    mod.parseSessionMessageRequest({ sessionId: 's1', text: 'a'.repeat(20001) }, 'f').ok,
    false,
    '超长文本必须拒绝',
  );

  // 开关真值表：与孤儿清扫同一套口径
  for (const off of ['off', '0', 'false', 'no', ' OFF ']) {
    assert.equal(mod.sessionInjectDisabled({ [mod.SESSION_INJECT_ENV]: off }), true, off);
  }
  for (const on of [undefined, '', 'on', '1', 'yes']) {
    assert.equal(mod.sessionInjectDisabled({ [mod.SESSION_INJECT_ENV]: on }), false, String(on));
  }

  assert.equal(mod.httpStatusForPromptFailure('session/not-found'), 404);
  assert.equal(mod.httpStatusForPromptFailure('gateway/bad-request'), 400);
  assert.equal(mod.httpStatusForPromptFailure('session/invalid-time-zone'), 400);
  assert.equal(mod.httpStatusForPromptFailure('session/busy'), 502);
  assert.equal(mod.httpStatusForPromptFailure(undefined), 502);
  assert.deepEqual(
    mod.describePromptFailure(Object.assign(new Error('boom'), { code: 'session/not-found' })),
    { error: 'boom', code: 'session/not-found' },
  );
  assert.deepEqual(mod.describePromptFailure('plain'), { error: 'plain' });
  return '解析 12 例 / 开关真值表 10 值 / 状态映射 5 例 / 失败摊平 2 例';
});

await check('会话注入路由真跑：405 / 403×2 / 400×2 / 200 / 503 / 404', async () => {
  // 起一次 handler：它会在第一个 await 之前同步挂好 data/end 监听，所以 flush 不会丢
  const call = async (route, request, response) => {
    const pending = route.handler(request, response);
    request.flush();
    await pending;
  };

  const { ctx, reg } = makeCtx();
  await withEnv(undefined, () => mod.apply(ctx));
  const route = reg.routes.find((item) => item.path === mod.SESSION_MESSAGE_PATH);
  assert.ok(route, '会话消息路由未注册');

  const wrongMethod = fakeResponse();
  await route.handler({ method: 'GET', headers: {} }, wrongMethod.response);
  assert.equal(wrongMethod.captured.status, 405);

  const foreign = fakeResponse();
  await call(route, fakeRequest({ sessionId: 's1', text: 'hi' }, { origin: 'https://evil.example' }), foreign.response);
  assert.equal(foreign.captured.status, 403, '能驱动 agent 的接口不能对外来页面开放');

  const badJson = fakeResponse();
  await call(route, fakeRequest('{not json'), badJson.response);
  assert.equal(badJson.captured.status, 400);

  const noSession = fakeResponse();
  await call(route, fakeRequest({ text: 'hi' }), noSession.response);
  assert.equal(noSession.captured.status, 400);

  const ok = fakeResponse();
  await call(route, fakeRequest({ sessionId: 'session-x', text: '继续', mode: 'steer' }), ok.response);
  assert.equal(ok.captured.status, 200, ok.captured.body);
  const body = JSON.parse(ok.captured.body);
  assert.equal(body.ok, true);
  assert.equal(body.accepted, true);
  assert.equal(body.sessionId, 'session-x');
  assert.equal(body.mode, 'steer');
  assert.match(
    body.requestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    '未给 requestId 时应由服务端铸造 UUID',
  );
  // 真的把这条消息交给了会话服务，且形状与 SessionPromptRequest 对齐
  assert.equal(reg.prompts.length, 1);
  assert.deepEqual(reg.prompts[0], {
    requestId: body.requestId,
    sessionId: 'session-x',
    mode: 'steer',
    content: [{ type: 'text', text: '继续' }],
  });

  // 运营者开关关掉 → 403，且一个字都不发给会话
  const off = fakeResponse();
  const offRequest = fakeRequest({ sessionId: 'session-x', text: '继续' });
  await withEnv('off', () => call(route, offRequest, off.response), mod.SESSION_INJECT_ENV);
  assert.equal(off.captured.status, 403);
  assert.equal(reg.prompts.length, 1, '开关关闭时不该再发消息');

  // 宿主里没有会话服务 → 503（路由仍然挂着，能说清原因，而不是 404）
  const bare = makeCtx({ sessionController: null });
  await withEnv(undefined, () => mod.apply(bare.ctx));
  const bareRoute = bare.reg.routes.find((item) => item.path === mod.SESSION_MESSAGE_PATH);
  assert.ok(bareRoute, '拿不到会话服务时路由也必须挂上');
  const noService = fakeResponse();
  await call(bareRoute, fakeRequest({ sessionId: 'session-x', text: '继续' }), noService.response);
  assert.equal(noService.captured.status, 503);

  // 会话不存在 → 404，且远端 code 透传给调用方
  const notFound = makeCtx({
    sessionController: {
      prompt: async () => {
        throw Object.assign(new Error('unknown session'), { code: 'session/not-found' });
      },
    },
  });
  await withEnv(undefined, () => mod.apply(notFound.ctx));
  const notFoundRoute = notFound.reg.routes.find((item) => item.path === mod.SESSION_MESSAGE_PATH);
  const missing = fakeResponse();
  await call(notFoundRoute, fakeRequest({ sessionId: 'nope', text: '继续' }), missing.response);
  assert.equal(missing.captured.status, 404);
  assert.equal(JSON.parse(missing.captured.body).code, 'session/not-found');

  return '405 / 403(外来/开关) / 400(坏 JSON/缺字段) / 200 / 503 / 404 全部符合预期';
});

await check('重启 helper 正文：ASCII / 参数齐全 / 清扫排在 dry-run 之后 / 5.1 真解析', async () => {
  const script = mod.RESTART_SCRIPT;
  const helperCode = script
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');
  // 与孤儿脚本同一条铁律：5.1 对无 BOM 的 .ps1 按 ANSI 解码，正文有中文就解析失败
  assert.ok(/^[\x00-\x7F]*$/.test(script), 'helper 正文必须全 ASCII');
  assert.ok(!/\$pid\b/.test(helperCode), '$pid 是只读自动变量，赋值会中断 helper');
  for (const param of ['$HostPid', '$LogPath', '$Version', '$SweepScript', '$ProfileDir', '$DryRun']) {
    assert.ok(script.includes(param), '参数块缺 ' + param);
  }
  assert.match(script, /& \$SweepScript -Mode all/, 'helper 必须用 all 模式（当前宿主的传输进程马上也会变成孤儿）');

  const dryRunAt = script.indexOf('if ($DryRun)');
  const exitAt = script.indexOf('exit 0', dryRunAt);
  const sweepAt = script.indexOf('& $SweepScript');
  const stopAt = script.indexOf('Stop-Process -Id $target');
  assert.ok(dryRunAt !== -1 && sweepAt !== -1 && stopAt !== -1, '关键分支必须都在');
  assert.ok(exitAt > dryRunAt && exitAt < sweepAt, 'dry-run 必须能提前退出，且早于清扫');
  assert.ok(sweepAt < stopAt, '顺序必须是 dry-run → 清扫 → 杀进程');

  if (process.platform !== 'win32') return '非 Windows 跳过真解析（正文断言 6 项）';

  // 真解析：写出来交给 5.1 跑一次。刻意用**不可能通过身份判据**的 HostPid（系统进程 4），
  // 于是它必然走 refuse 分支 —— 这证明整份脚本能被 5.1 解析并执行到身份判据那一步，
  // 且不会碰任何进程。真实 dry-run（拿真宿主 pid、只写日志不停进程）留给人工一次。
  const dir = mkdtempSync(join(tmpdir(), 'obl-brand-helper-parse-'));
  const file = join(dir, 'obl-brand-restart.ps1');
  const log = join(dir, 'restart.log');
  try {
    writeFileSync(file, '\uFEFF' + script, 'utf8');
    const shell = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const run = spawnSync(
      shell,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file, '-HostPid', '4', '-LogPath', log, '-SweepScript', '', '-ProfileDir', '', '-DryRun'],
      { encoding: 'utf8', timeout: 60_000 },
    );
    const stderr = String(run.stderr ?? '');
    assert.ok(!/ParserError|无法识别|Unexpected token/i.test(stderr), '不得有解析错误：' + stderr.slice(0, 300));
    const text = existsSync(log) ? readFileSync(log, 'utf8') : '';
    assert.match(text, /refused|target confirmed/, 'helper 应至少走到身份判据（日志：' + text.slice(0, 200) + '）');
    return '正文断言 8 项 + 5.1 真解析（exit ' + String(run.status) + '，按预期拒绝）';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await check('守夜人正文：pidfile / usebackq / ASCII 时间戳 / 无 for-f 命令形式', async () => {
  const cmd = mod.WATCH_CMD;
  assert.equal(typeof cmd, 'string', 'lib 必须导出 WATCH_CMD');
  assert.ok(/^[\x00-\x7F]*$/.test(cmd), '守夜人正文必须全 ASCII');

  // v2.1 修法：WMI 拉起的游离 cmd 里，for /f 的"命令形式"整体空产出（实测连
  // `for /f "tokens=1" %%p in ('echo hello')` 都是空的）；必须先把 netstat 写文件，
  // 再用 usebackq 读文件。这两条同时钉住，防止回潮成"host pid= 永远为空"。
  assert.ok(cmd.includes('set "PIDFILE=%TEMP%\\obl-brand-host.pid.tmp"'), '缺少 PIDFILE 定义');
  assert.match(
    cmd,
    /netstat -ano \| findstr ":42081" \| findstr LISTENING > "%PIDFILE%"/,
    '必须先把 netstat 落到 PIDFILE',
  );
  assert.match(
    cmd,
    /for \/f "usebackq tokens=5" %%p in \("%PIDFILE%"\) do set "HOSTPID=%%p"/,
    '必须用 usebackq 读文件取 PID',
  );
  assert.ok(
    !/for \/f "tokens=5" %%p in \('netstat/.test(cmd),
    '禁止回潮：for /f 命令形式取 PID 在 WMI 游离 cmd 里会空产出',
  );

  // ASCII 时间戳：%DATE% 里的中文星期是 GBK 字节，按 UTF-8 读就是乱码。
  assert.ok(cmd.includes('%DATE:~0,10% %TIME%'), '日志时间戳必须切片成 %DATE:~0,10%');
  assert.ok(!cmd.includes('%DATE% %TIME%'), '禁止回潮：裸 %DATE% %TIME% 会写 GBK 乱码');

  // v2 的关键性质必须保留：锁、20s TTL、ready 行带 host pid、42081 探活。
  assert.ok(cmd.includes('if exist "%LOCK%" exit /b 0'), '必须有锁文件判断');
  assert.ok(cmd.includes('if %N% GEQ 200 goto expired'), '必须有 20s TTL');
  assert.ok(cmd.includes('watcher expired: app still running, no relaunch'), '必须有过期分支');
  assert.ok(cmd.includes('watcher ready: bridge 42081 up (host pid=%HOSTPID%)'), 'ready 行必须带 host pid');
  assert.ok(cmd.includes('curl -s -o NUL -m 2 http://127.0.0.1:42081/'), '必须用 42081 探活');
  // 2026-10-18 增强：ready 之后再从宿主监听口里挑出能 HTTP 应答的口（web 口），
  // 把"重启完成"的判定从"宿主起了"提升到"UI 可连"。
  assert.ok(cmd.includes(':webprobe'), '必须有 webprobe 子过程');
  assert.ok(cmd.includes('watcher web ready: http://127.0.0.1:%WEBPORT%/'), '必须有 web ready 日志行');

  return 'pidfile/usebackq/ASCII 时间戳/锁/TTL/ready 行/web 探活 全部到位';
});

process.stdout.write('\n@oblivion/brand selfcheck\n\n');
for (const [status, name, detail] of results) {
  process.stdout.write(status.padEnd(5) + ' ' + name + (detail ? '\n        ' + detail : '') + '\n');
}
process.stdout.write(
  '\n' + results.length + ' 项，失败 ' + failed + (skipped > 0 ? '，跳过 ' + skipped : '') + '\n',
);
process.exitCode = failed === 0 ? 0 : 1;
