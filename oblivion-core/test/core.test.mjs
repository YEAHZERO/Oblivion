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
import { existsSync, mkdirSync, mkdtempSync as mkdtemp, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LIB = join(ROOT, 'lib', 'index.js');

const mod = await import(new URL('file://' + LIB.replace(/\\/g, '/')).href);

describe('产物形状', () => {
  it('导出 name / inject / apply / VERSION', () => {
    assert.equal(mod.name, '@oblivion/core');
    assert.deepEqual(mod.inject, ['tools', 'systemPrompt', 'agents']);
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
      ['agent/created', 'session/event', 'turn/end'],
      '应声明依赖的事件（0.1.19 起含 agent/created：它由 scopeTarget 按作用域派发）',
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
  it('注册 8 个模型面工具（含观测面、整理与改名）', () => {
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
        'oblivion_retitle',
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

/**
 * 沉淀件的命名与打标签。
 *
 * 所有者 2026-10-06：「这些沉淀的文档，命名上看不出是什么内容，单纯只是我的问题的简写而已，
 * 需要在沉淀整理的时候顺便命名 + 打标签」。
 */
describe('命名与打标签（由内容决定，不调模型）', () => {
  let kit;

  before(async () => {
    kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
  });

  it('优先用答案里第一个不像套话的小标题（套话被跳过）', () => {
    assert.equal(kit.titleFromQA('给出实施的具体方案', '## 结论\n\n应该这样做。\n\n## 怎么装 bundle\n'), '怎么装 bundle');
    assert.equal(kit.titleFromQA('随便问问', '## 要点\n\n## 摘要\n'), '随便问问');
  });

  it('问句去水词 + 保留整句（不在第一个标点处截断），而不是整句照抄', () => {
    assert.equal(
      kit.titleFromQA('查看opencode的配置，里面有API和密钥', '没有小标题'),
      'opencode的配置，里面有API和密钥',
      '「里面有API和密钥」正是这条沉淀的内容，不该被标点截掉',
    );
    assert.equal(kit.titleFromQA('这个最近沉淀和笔记有何区别？', ''), '最近沉淀和笔记有何区别');
    assert.equal(kit.titleFromQA('给出实施的具体方案', ''), '实施的具体方案');
  });

  it('绝不产出空名，长度有上限', () => {
    assert.equal(kit.titleFromQA('', ''), 'untitled');
    assert.equal(kit.titleFromQA('   ', '   '), 'untitled');
    assert.ok(kit.titleFromQA('x'.repeat(100), '').length <= 32);
  });

  it('标签：包名 / 技术词 / 中文词表，且扫问句不只扫答案', () => {
    const tags = kit.tagsFromQA(
      '怎么把 @oblivion/core 装进 dsh-better-sidebar 的 profile 补丁',
      '用 npm 装，改 cordis.patch.yml',
    );
    assert.ok(tags.includes('@oblivion/core'), '包名要成为标签：' + tags.join(','));
    assert.ok(tags.includes('dsh-better-sidebar'));
    assert.ok(tags.includes('npm'));
    assert.ok(tags.includes('config'), '「补丁」应命中中文词表：' + tags.join(','));
    assert.ok(tags.length <= 8, '标签上限 8，实际 ' + tags.length);
    assert.deepEqual(kit.tagsFromQA('', ''), []);
  });

  it('deriveTitle 走同一条口径（不再是问句前 60 字）', () => {
    const title = kit.deriveTitle({
      question: '查看这个方案：# Oblivion C 方案完整设计书',
      answer: '## 结论\n\n## 分阶段落地\n',
      sources: [],
    });
    assert.equal(title, '分阶段落地');
  });
});

/**
 * 笔记改名 / 打标签（`oblivion_retitle`）。
 *
 * 所有者 2026-10-06：「让模型用 oblivion_digest 那种方式顺手给最近的笔记改名打标签」——
 * 分工与整理件一致：**模型负责起名，插件只负责落盘、同步条目、重建索引**（插件不调 LLM）。
 */
describe('改名与打标签（oblivion_retitle）', () => {
  let kit;

  before(async () => {
    kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
  });

  function noteOf(id, title) {
    return `---
title: "${title}"
topic: "方案"
source: "session"
ref: "session-x#turn-1"
created_at: "2026-10-06"
updated_at: "2026-10-06"
tags: ["dsh"]
status: "active"
impl: "implemented"
related_wiki: []
---

# ${title}

>Date :  2026-10-06
>Source：Oblivion
>Note：先做这一步。
>Tags： #dsh

## 内容

### 具体实施计划

第一步先装 bundle。

## 来源

- \`session\`: session-x#turn-1

<!-- oblivion:id=${id} version=1 -->
`;
  }

  function fixture() {
    const tmp = mkdtemp(join(tmpdir(), 'oblivion-retitle-'));
    const mdRoot = join(tmp, 'kb');
    const mdDir = join(mdRoot, '01_问答沉淀');
    const dataDir = join(tmp, 'data');
    mkdirSync(mdDir, { recursive: true });
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(mdDir, '给出实施的具体方案.md'), noteOf('ts-test-1', '给出实施的具体方案'), 'utf8');
    // 用户自有的笔记（正文里没有 oblivion 标记）：一个字都不该动
    writeFileSync(join(mdDir, '我自己的笔记.md'), '# 我自己的笔记\n\n别碰我。\n', 'utf8');
    writeFileSync(
      join(dataDir, 'ts-test-1.json'),
      JSON.stringify({
        id: 'ts-test-1',
        topic: '方案',
        title: '给出实施的具体方案',
        content: '',
        tags: ['dsh'],
        sources: [],
        status: 'active',
        created_at: 0,
        updated_at: 0,
        version: 1,
      }),
      'utf8',
    );
    return { tmp, mdRoot, mdDir, dataDir };
  }

  function serviceOf(f) {
    return kit.createRetitleService({
      mdRoot: f.mdRoot,
      dataRoot: f.dataDir,
      classify: { session: '01_问答沉淀' },
    });
  }

  it('只认自己的笔记：用户自有的 md 不列出来', async () => {
    const f = fixture();
    try {
      const list = await serviceOf(f).list(10);
      assert.deepEqual(list.map((n) => n.id), ['ts-test-1']);
      assert.equal(list[0].ask, '给出实施的具体方案', '旧 title 就是原问句，要能读出来给模型看');
      assert.ok(list[0].excerpt.includes('第一步先装 bundle'), '要有答案摘要：' + list[0].excerpt);
    } finally {
      rmSync(f.tmp, { recursive: true, force: true });
    }
  });

  it('落地：改名 + H1/frontmatter 同步 + 原问句留在 ask + 条目 JSON 同步 + 索引重建', async () => {
    const f = fixture();
    try {
      const self = { items: [] };
      const svc = kit.createRetitleService({
        mdRoot: f.mdRoot,
        dataRoot: f.dataDir,
        classify: { session: '01_问答沉淀' },
        host: {
          store: { loadAll: async () => self.items },
          index: {
            rebuild: (items) => {
              self.items = items;
            },
            all: () => self.items,
          },
        },
      });
      const { results, index } = await svc.apply([
        { id: 'ts-test-1', title: 'Oblivion 具体实施计划', tags: ['dsh', 'plan'] },
      ]);

      assert.equal(results[0].ok, true);
      assert.equal(results[0].from, '给出实施的具体方案.md');
      assert.equal(results[0].to, 'Oblivion 具体实施计划.md');
      assert.equal(results[0].itemSynced, true);
      assert.ok(!existsSync(join(f.mdDir, '给出实施的具体方案.md')), '旧名字不该留下');

      const note = readFileSync(join(f.mdDir, 'Oblivion 具体实施计划.md'), 'utf8');
      assert.ok(note.includes('title: "Oblivion 具体实施计划"'), 'frontmatter 的 title 要跟着改');
      assert.ok(note.includes('# Oblivion 具体实施计划'), '正文 H1 也要跟着改');
      assert.ok(note.includes('ask: "给出实施的具体方案"'), '原问句必须留下');
      assert.ok(note.includes('>Ask： 给出实施的具体方案'), '正文也要有人读的那一行');
      assert.ok(/>Tags：.*#plan/.test(note), '新标签要写进正文：' + note.split('\n').find((l) => l.startsWith('>Tags')));

      const item = JSON.parse(readFileSync(join(f.dataDir, 'ts-test-1.json'), 'utf8'));
      assert.equal(item.title, 'Oblivion 具体实施计划', '条目 title 不同步 ⇒ 下次写入会按旧名再起一份');
      assert.deepEqual(item.tags, ['dsh', 'plan']);
      assert.ok(item.updated_at > 0);

      assert.ok(index && existsSync(index.path), '要重建 00-Index/索引.md：' + JSON.stringify(index));
      assert.equal(index.count, self.items.length);
    } finally {
      rmSync(f.tmp, { recursive: true, force: true });
    }
  });

  it('ask 只在第一次写：再改一次名字，原问句不会被新名字顶掉', async () => {
    const f = fixture();
    try {
      const svc = serviceOf(f);
      await svc.apply([{ id: 'ts-test-1', title: 'Oblivion 具体实施计划' }]);
      await svc.apply([{ id: 'ts-test-1', title: 'Oblivion 落地步骤' }]);

      const note = readFileSync(join(f.mdDir, 'Oblivion 落地步骤.md'), 'utf8');
      assert.ok(note.includes('ask: "给出实施的具体方案"'), '第二次改名仍要守住原问句');
      assert.ok(!note.includes('ask: "Oblivion 具体实施计划"'), '不能把上一次的新名字当成原问句');
      assert.equal((note.match(/>Ask：/g) ?? []).length, 1, '>Ask 行只写一次');
    } finally {
      rmSync(f.tmp, { recursive: true, force: true });
    }
  });

  it('工具两段式：不带 items 给候选，带 items 落地；服务缺席时只回 skipped', async () => {
    const f = fixture();
    try {
      const defs = new Map();
      const ctx = { tools: { register: (d) => defs.set(d.name, d) } };
      kit.registerTools(ctx, { knowledge: {}, profile: {}, feedback: null, graph: {}, retitle: serviceOf(f) });

      const tool = defs.get('oblivion_retitle');
      assert.ok(tool, '要注册 oblivion_retitle');

      const listed = await tool.execute({ limit: 5 }, {});
      assert.equal(listed.mode, 'list');
      assert.equal(listed.notes.length, 1);
      assert.equal(listed.notes[0].id, 'ts-test-1');
      assert.equal(listed.notes[0].ask, '给出实施的具体方案');

      const applied = await tool.execute(
        { items: [{ id: 'ts-test-1', title: 'Oblivion 具体实施计划', tags: ['plan'] }] },
        {},
      );
      assert.equal(applied.mode, 'apply');
      assert.equal(applied.total, 1);
      assert.equal(applied.renamed, 1);
      assert.deepEqual(applied.failed, []);

      const none = new Map();
      const ctx2 = { tools: { register: (d) => none.set(d.name, d) } };
      kit.registerTools(ctx2, { knowledge: {}, profile: {}, feedback: null, graph: {}, retitle: null });
      assert.equal((await none.get('oblivion_retitle').execute({}, {})).skipped, true);
    } finally {
      rmSync(f.tmp, { recursive: true, force: true });
    }
  });
});
