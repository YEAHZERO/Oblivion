#!/usr/bin/env node
/**
 * @oblivion/brand 自检：不依赖 DSHX（本机 Creator Mode+ 链路因 claim 依赖
 * POSIX `ps -o lstart=` 而全废，见 WORKSPACE.md 已知限制 1/3）。
 *
 * 验证的是「本机能验证的全部」：
 *   1. 产物存在、可被真实 import（证明没有裸导入解析问题）
 *   2. 导出形状符合本包的约定
 *   3. apply 真的把两条路由挂上去（桩 webServer 必须收到 RESTART_PATH 与 PLUGINS_PATH）
 *   4. 已装插件清单：临时 profile 上读出规格 / 启用态 / 版本 / 恢复命令
 *   5. 清单路由真跑：GET 200（返回体还得能被客户端校验器接受）、POST 405、外来 Origin 403
 *   6. profile 定位：DSH_PROFILE_DIR 优先，否则按 DSH_HOME 拼，都没有则 null
 *   7. 市场 registry 覆盖：未设 → 填 npmmirror
 *   8. 运营者优先：已经有人设过 → 一个字都不改
 *   9. 空白视同未设（必须与市场自己的 override() 语义一致）
 *   10. 幂等：连跑两次不抛、值不变
 *   11. 交叉验证：真的 import 市场的 lib/regions.js，确认解析结果被改向 npmmirror，
 *      且 GitHub 代理**不受影响**。市场没装则跳过，不算失败。
 *
 * 第 11 条是这组里唯一「跨包」的断言，也是 registry 改动的实质：它证明的不是
 * 「我们写了个环境变量」，而是「市场读了它、并按它换了镜像」。
 *
 * 输出带 PASS/FAIL/SKIP 前缀，退出码非 0 表示有失败项，便于挂进 CI。
 */

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
async function withEnv(value, fn) {
  const saved = process.env[ENV];
  const restore = () => {
    if (saved === undefined) delete process.env[ENV];
    else process.env[ENV] = saved;
  };
  if (value === undefined) delete process.env[ENV];
  else process.env[ENV] = value;
  try {
    return await fn();
  } finally {
    restore();
  }
}

/** 只记录、不做磁盘动作的桩 ctx。 */
function makeCtx() {
  const reg = { routes: [], effects: [], logs: [] };
  return {
    reg,
    ctx: {
      logger: () => ({
        info: (message) => reg.logs.push(['info', message]),
        warn: (message) => reg.logs.push(['warn', message]),
      }),
      inject: (deps, callback) => {
        reg.injected = deps;
        callback({
          webServer: {
            register: (route) => {
              reg.routes.push(route);
              return () => {};
            },
          },
        });
      },
      effect: (fn, label) => reg.effects.push(label),
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

await check('产物存在且可 import', () => {
  const lib = join(ROOT, 'lib', 'index.js');
  assert.ok(existsSync(lib), 'lib/index.js 不存在，先运行 build');
  return 'lib/index.js';
});

await check('导出形状符合本包约定', () => {
  assert.equal(mod.RESTART_PATH, '/obl-brand/restart');
  assert.equal(mod.PLUGINS_PATH, '/obl-brand/plugins');
  assert.equal(mod.MARKET_REGISTRY_ENV, ENV);
  assert.equal(mod.MARKET_REGISTRY_MIRROR, MIRROR);
  assert.equal(typeof mod.apply, 'function');
  assert.equal(typeof mod.restoreCommand, 'function');
  assert.equal(typeof mod.normalizePluginList, 'function');
  assert.equal(typeof mod.readInstalledPlugins, 'function');
  assert.equal(typeof mod.resolveProfile, 'function');
  return 'RESTART_PATH / PLUGINS_PATH / MARKET_* / 恢复命令 / 清单校验 / apply 齐备';
});

await check('apply 挂载两条路由且都注入 webServer', async () => {
  const { ctx, reg } = makeCtx();
  await withEnv(undefined, () => mod.apply(ctx));
  assert.deepEqual(reg.injected, ['webServer'], 'inject 依赖应为 [webServer]');
  assert.equal(reg.routes.length, 2, '应注册两条路由（重启 + 已装插件清单）');
  const restart = reg.routes.find((route) => route.path === mod.RESTART_PATH);
  const plugins = reg.routes.find((route) => route.path === mod.PLUGINS_PATH);
  assert.ok(restart, '缺少重启路由');
  assert.ok(plugins, '缺少已装插件清单路由');
  for (const route of [restart, plugins]) {
    assert.equal(route.kind, 'exact');
    assert.equal(typeof route.handler, 'function');
  }
  return reg.routes.map((route) => route.path).join(' + ');
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

process.stdout.write('\n@oblivion/brand selfcheck\n\n');
for (const [status, name, detail] of results) {
  process.stdout.write(status.padEnd(5) + ' ' + name + (detail ? '\n        ' + detail : '') + '\n');
}
process.stdout.write(
  '\n' + results.length + ' 项，失败 ' + failed + (skipped > 0 ? '，跳过 ' + skipped : '') + '\n',
);
process.exitCode = failed === 0 ? 0 : 1;
