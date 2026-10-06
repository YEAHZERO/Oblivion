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
import { existsSync, mkdtempSync as mkdtemp, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  it('注册 7 个模型面工具（含观测面与整理）', () => {
    const { ctx, seen } = fakeCtx();
    // 用系统临时目录：插件装载时会写 status.json / decisions.jsonl，绝不能落在仓库里
    const tmp = mkdtemp(join(tmpdir(), 'oblivion-tools-'));
    try {
      mod.apply(ctx, { dataRoot: join(tmp, 'data'), mdRoot: join(tmp, 'kb') });
      assert.deepEqual(seen.tools.sort(), [
        'oblivion_capture',
        'oblivion_digest',
        'oblivion_feedback',
        'oblivion_graph_neighbors',
        'oblivion_profile',
        'oblivion_query',
        'oblivion_status',
      ]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
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

  it('装载即建目录：mdRoot 一经配置就自动创建 01_问答沉淀/ 等分类目录', async () => {
    const kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
    const root = await mkdtemp(join(tmpdir(), 'oblivion-mdroot-'));
    try {
      const { ctx } = fakeCtx();
      // 刻意用一个与默认值完全不同的自定义知识库位置
      mod.apply(ctx, { dataRoot: join(root, 'data'), mdRoot: join(root, '自定义知识库') });
      // 目录创建是非阻塞链路（失败只记日志），给它一点时间
      await new Promise((r) => setTimeout(r, 300));
      const expected = ['01_问答沉淀', '00_导入文件', '02_Wiki页面', '03_创作产物', '04_会话整理', '99_其他'];
      const missing = expected.filter((dir) => !existsSync(join(root, '自定义知识库', dir)));
      assert.deepEqual(missing, [], '应自动创建全部分类目录，缺：' + missing.join('、'));
      // 消毒：配置里的分类目录不得逃出 mdRoot
      assert.equal(kit.safeDirName('../../etc'), 'etc');
      assert.equal(kit.safeDirName('C:\\Windows\\System32'), 'Windows/System32');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('会话整理：composeDigest 的结构与文件名消毒（纯函数）', async () => {
    const kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
    const at = Date.UTC(2026, 9, 6, 1, 2, 3);
    const composed = kit.composeDigest(
      {
        title: 'DSH 插件开发 / 会话整理',
        topic: 'DSH 插件',
        sections: [
          { heading: '结论', body: '面板已可用。' },
          { heading: '过程', body: '先定位作用域问题。' },
        ],
        decisions: ['走热挂，不迁 bundle 层'],
        todos: ['重启 App 验证'],
        openQuestions: ['向量检索要不要接'],
        links: ['ts-123', '[[已有笔记]]'],
      },
      at,
    );
    assert.match(composed.markdown, /^---\n/, '盲区修正：笔记必须以 YAML frontmatter 开头');
    assert.match(composed.markdown, /title: "DSH 插件开发 \/ 会话整理"/);
    assert.match(composed.markdown, /status: "active"/);
    assert.match(composed.markdown, /impl: "implemented"/);
    assert.match(composed.markdown, /\n# DSH 插件开发 \/ 会话整理\n/);
    assert.match(composed.markdown, /## 结论\n\n面板已可用。/);
    assert.match(composed.markdown, /## 决策\n\n- 走热挂，不迁 bundle 层/);
    assert.match(composed.markdown, /## 待办\n\n- 重启 App 验证/);
    assert.match(composed.markdown, /## 未决问题/);
    assert.match(composed.markdown, /- \[\[ts-123\]\]/);
    assert.match(composed.markdown, /- \[\[已有笔记\]\]/, '已经带方括号的链接不该重复包一层');
    assert.match(composed.markdown, /<!-- oblivion:digest id=pending version=1 -->/);
    assert.equal(composed.sections, 2);
    assert.equal(composed.topic, 'DSH 插件');
    assert.ok(composed.fileName.endsWith('-DSH 插件开发 _ 会话整理.md'), '文件名必须消毒路径分隔符，实际 ' + composed.fileName);
    assert.equal(kit.safeFileName('a/b\\c:d*e?f"g<h>i|j'), 'a_b_c_d_e_f_g_h_i_j');
    assert.equal(kit.safeFileName('   '), 'untitled');
    assert.equal(kit.safeFileName('x'.repeat(200)).length, 80);
  });
});