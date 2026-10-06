#!/usr/bin/env node
/**
 * @oblivion/brand 自检：不依赖 DSHX（本机 Creator Mode+ 链路因 claim 依赖
 * POSIX `ps -o lstart=` 而全废，见 WORKSPACE.md 已知限制 1/3）。
 *
 * 验证的是「本机能验证的全部」：
 *   1. 产物存在、可被真实 import（证明没有裸导入解析问题）
 *   2. 导出形状符合本包的约定
 *   3. apply 真的把重启路由挂上去（桩 webServer 必须收到 RESTART_PATH）
 *   4. 市场 registry 覆盖：未设 → 填 npmmirror
 *   5. 运营者优先：已经有人设过 → 一个字都不改
 *   6. 空白视同未设（必须与市场自己的 override() 语义一致）
 *   7. 幂等：连跑两次不抛、值不变
 *   8. 交叉验证：真的 import 市场的 lib/regions.js，确认解析结果被改向 npmmirror，
 *      且 GitHub 代理**不受影响**。市场没装则跳过，不算失败。
 *
 * 第 8 条是这组里唯一「跨包」的断言，也是本次改动的实质：它证明的不是
 * 「我们写了个环境变量」，而是「市场读了它、并按它换了镜像」。
 *
 * 输出带 PASS/FAIL/SKIP 前缀，退出码非 0 表示有失败项，便于挂进 CI。
 */

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
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

const mod = await import(pathToFileURL(join(ROOT, 'lib', 'index.js')).href);

await check('产物存在且可 import', () => {
  const lib = join(ROOT, 'lib', 'index.js');
  assert.ok(existsSync(lib), 'lib/index.js 不存在，先运行 build');
  return 'lib/index.js';
});

await check('导出形状符合本包约定', () => {
  assert.equal(mod.RESTART_PATH, '/obl-brand/restart');
  assert.equal(mod.MARKET_REGISTRY_ENV, ENV);
  assert.equal(mod.MARKET_REGISTRY_MIRROR, MIRROR);
  assert.equal(typeof mod.apply, 'function');
  return 'RESTART_PATH / MARKET_REGISTRY_ENV / MARKET_REGISTRY_MIRROR / apply 齐备';
});

await check('apply 挂载重启路由且注入 webServer', async () => {
  const { ctx, reg } = makeCtx();
  await withEnv(undefined, () => mod.apply(ctx));
  assert.deepEqual(reg.injected, ['webServer'], 'inject 依赖应为 [webServer]');
  assert.equal(reg.routes.length, 1, '应恰好注册一条路由');
  assert.equal(reg.routes[0].path, mod.RESTART_PATH);
  assert.equal(reg.routes[0].kind, 'exact');
  assert.equal(typeof reg.routes[0].handler, 'function');
  return reg.routes[0].kind + ' ' + reg.routes[0].path;
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
