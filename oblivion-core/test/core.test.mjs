/**
 * @oblivion/core 单元测试。
 *
 * 刻意测 **lib/ 产物**（不是 src/）：和 @oblivion/vimc 同一策略 ——
 * 这样测试顺带证明了构建产物真的可加载、导出形状正确，
 * 而不只是源码在类型层面说得通。
 *
 * 运行：node --test（package.json 的 test 脚本）
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LIB = join(ROOT, 'lib', 'index.js');

const mod = await import(new URL('file://' + LIB.replace(/\\/g, '/')).href);

describe('产物形状', () => {
  it('导出 name / inject / apply / VERSION', () => {
    assert.equal(mod.name, '@oblivion/core');
    assert.deepEqual(mod.inject, ['tools', 'systemPrompt']);
    assert.equal(typeof mod.apply, 'function');
    assert.match(mod.VERSION, /^\d+\.\d+\.\d+$/);
  });

  it('同时提供 default 对象形式（object 插件约定）', () => {
    assert.equal(typeof mod.default?.apply, 'function');
  });

  it('manifest 的 id 与 package.json 的 name 逐字一致', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const dshx = readFileSync(join(ROOT, 'dshx.yml'), 'utf8');
    const id = dshx.match(/^id:\s*(.+)$/m)?.[1]?.trim();
    assert.equal(id, "'" + pkg.name + "'");
  });

  it('boot-marker 与源码里的 console.log 逐字一致', () => {
    const dshx = readFileSync(join(ROOT, 'dshx.yml'), 'utf8');
    const marker = dshx.match(/marker:\s*"(.+?)"/)?.[1];
    assert.ok(marker, 'dshx.yml 缺少 marker');
    assert.ok(readFileSync(LIB, 'utf8').includes(marker), '产物里找不到 marker 字符串');
  });

  it('框架包不进 dependencies（WORKSPACE 铁律）', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const deps = Object.keys(pkg.dependencies ?? {});
    assert.deepEqual(deps.filter((d) => d.startsWith('@deepseek-ai')), []);
  });

  it('没有声明 dsh.bundle（决定走可热挂路径而非需重启的 bundle 层）', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    // 注意：`dsh.compat` 是**兼容性声明**（宿主范围 + 需要的服务/事件），与 `dsh.bundle` 无关。
    // 这条断言的原意是「不声明 bundle 层」，所以判据收紧到 bundle 本身。
    assert.equal(pkg.dsh?.bundle, undefined, '不得声明 dsh.bundle');
    assert.ok(pkg.dsh?.compat?.host, '应声明宿主兼容范围 dsh.compat.host');
    assert.deepEqual(
      pkg.dsh?.compat?.requires?.events,
      ['session/event', 'turn/end'],
      '应声明依赖的事件（turn/end 是实测存在的那个，session:complete 不存在）',
    );
  });

  it('产物把框架包留作 external，没有把 dsh-tools 打包进去', () => {
    const code = readFileSync(LIB, 'utf8');
    assert.ok(code.includes('@deepseek-ai/dsh-tools'), '应保留对 dsh-tools 的外部导入');
    assert.ok(code.length < 200_000, '产物应远小于把框架包打进去的体积（实测约 43 KB）');
  });
});

/** 只注册计数用的最小 ctx：不碰磁盘，不产生副作用。 */
function fakeCtx() {
  const seen = { tools: [], effects: [], events: [], sections: [] };
  return {
    seen,
    ctx: {
      tools: { register: (d) => seen.tools.push(d?.name) },
      systemPrompt: {
        section: (d) => {
          seen.sections.push(d.name);
          return () => {};
        },
        getSectionOrder: () => 50,
      },
      logger: {},
      effect: (fn, label) => {
        seen.effects.push(label);
        return fn();
      },
      on: (event) => seen.events.push(event),
    },
  };
}

describe('装配（apply）', () => {
  it('注册 5 个模型面工具', () => {
    const { ctx, seen } = fakeCtx();
    mod.apply(ctx, { dataRoot: join(ROOT, '.tmp-test-data'), mdRoot: join(ROOT, '.tmp-test-kb') });
    assert.deepEqual(seen.tools.sort(), [
      'oblivion_capture',
      'oblivion_feedback',
      'oblivion_graph_neighbors',
      'oblivion_profile',
      'oblivion_query',
    ]);
  });

  it('注册一个 systemPrompt 段落（用于认知陪伴注入）', () => {
    const { ctx, seen } = fakeCtx();
    mod.apply(ctx, {});
    assert.deepEqual(seen.sections, ['OBLIVION_COGNITION']);
  });

  it('监听 session/event，且每个副作用都走 ctx.effect（卸载无残留）', () => {
    const { ctx, seen } = fakeCtx();
    mod.apply(ctx, {});
    assert.ok(seen.events.includes('session/event'));
    assert.ok(seen.effects.length >= 6, '期望每个模块都有自己的 effect 清理位');
    assert.ok(seen.effects.every((label) => /^oblivion-core: /.test(label)));
  });

  it('关闭开关后不再注册 feedback / perspective 相关副作用', () => {
    const withBoth = fakeCtx();
    mod.apply(withBoth.ctx, { enableFeedback: false, enablePerspective: false });
    const effects = withBoth.seen.effects.join('\n');
    assert.ok(!effects.includes('feedback teardown'), 'enableFeedback=false 时不应注册 feedback');
    assert.ok(!effects.includes('perspective teardown'), 'enablePerspective=false 时不应注册 perspective');
  });

  it('提示段落是惰性求值的函数（陪伴内容只在下一轮生效）', () => {
    const { ctx } = fakeCtx();
    let captured;
    ctx.systemPrompt.section = (d) => {
      captured = d;
      return () => {};
    };
    mod.apply(ctx, {});
    assert.equal(typeof captured.text, 'function');
    assert.equal(captured.text({ agent: undefined }), '', '没有 agent 时不注入任何内容');
    assert.ok(captured.text({ agent: {} }).includes('Oblivion 认知陪伴规则'));
  });
});