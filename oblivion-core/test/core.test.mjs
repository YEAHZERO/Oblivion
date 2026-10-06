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
import { existsSync, mkdirSync, mkdtempSync as mkdtemp, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LIB = join(ROOT, 'lib', 'index.js');

/** 目录里的文件名（排序），用来断言「落成了哪些文件、有没有多长出 -2」。 */
function readdirNames(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();
}

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
  it('注册 9 个模型面工具（含观测面、整理、改名与主题页）', () => {
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
        'oblivion_wiki',
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

  it('文件名绝不带首尾的点/空格（模型给过「.gitignore …」这种名字）', () => {
    assert.equal(kit.fileNameOf({ title: '.gitignore 整棵忽略 + 搜索插件分工' }), 'gitignore 整棵忽略 + 搜索插件分工');
    assert.equal(kit.fileNameOf({ title: '结尾的点.' }), '结尾的点');
    assert.equal(kit.fileNameOf({ title: '...' }), 'untitled', '全被清掉时不能变成空名');
  });

  it('名字来源可标记：named_by: model 写进 frontmatter，listNotes 读得回', async () => {
    const f = fixture();
    try {
      const svc = serviceOf(f);
      await svc.apply([{ id: 'ts-test-1', title: 'Oblivion 具体实施计划', namedBy: 'model' }]);
      const note = readFileSync(join(f.mdDir, 'Oblivion 具体实施计划.md'), 'utf8');
      assert.ok(note.includes('named_by: "model"'), '要写下名字来源，规则管线据此让路');
      const again = await kit.listNotes(f.mdDir, 10);
      assert.equal(again[0].namedBy, 'model');
      // 再改一次名字时标记不该被抹掉（模型起的名字始终是模型起的）
      await svc.apply([{ id: 'ts-test-1', title: 'Oblivion 落地步骤' }]);
      const moved = readFileSync(join(f.mdDir, 'Oblivion 落地步骤.md'), 'utf8');
      assert.ok(moved.includes('named_by: "model"'), '标记要保住');
      assert.equal((moved.match(/named_by:/g) ?? []).length, 1, 'named_by 行只写一次');
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
      // 工具这条路的名字一律记来源：规则管线（rename-notes.mjs）看到它就跳过
      assert.ok(
        readFileSync(join(f.mdDir, 'Oblivion 具体实施计划.md'), 'utf8').includes('named_by: "model"'),
        '模型面工具改的名要标 named_by: model',
      );

      const none = new Map();
      const ctx2 = { tools: { register: (d) => none.set(d.name, d) } };
      kit.registerTools(ctx2, { knowledge: {}, profile: {}, feedback: null, graph: {}, retitle: null });
      assert.equal((await none.get('oblivion_retitle').execute({}, {})).skipped, true);
    } finally {
      rmSync(f.tmp, { recursive: true, force: true });
    }
  });
});

describe('关联知识双链：单段合并、去重、丢弱标题（md-writer）', () => {
  let kit;

  before(async () => {
    kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
  });

  /** 老笔记的现实样子：双链段被追加了 3 次，里面还混着 `[[OK]]`、`[[继续]]` 这种应答。 */
  const CLUTTERED = [
    '---',
    'title: "反复追加过的笔记"',
    'topic: "方案"',
    '---',
    '',
    '# 反复追加过的笔记',
    '',
    '>Date :  2026-10-06',
    '>Tags： #dsh',
    '',
    '## 内容',
    '',
    '正文不能被双链改写。',
    '',
    '<!-- oblivion:id=ts-link-1 version=1 -->',
    '',
    '## 关联知识（自动）',
    '',
    '- [[激活排查]]',
    '- [[OK]]',
    '',
    '## 关联知识（自动）',
    '',
    '- [[激活排查]]',
    '- [[继续]]',
    '',
    '## 关联知识（自动）',
    '',
    '- [[数据目录归属之谜]]',
    '',
  ].join('\n');

  it('把重复的段并成一段：去重、丢弱标题、有限条数', async () => {
    const tmp = mkdtemp(join(tmpdir(), 'oblivion-links-'));
    try {
      const path = join(tmp, '笔记.md');
      writeFileSync(path, CLUTTERED, 'utf8');
      const wrote = await kit.appendRelatedLinks(path, ['数据目录归属之谜', '新的双链', 'OK']);
      assert.equal(wrote, true);
      const after = readFileSync(path, 'utf8');
      assert.equal(after.split(kit.RELATED_HEADER).length - 1, 1, '只应剩一段关联知识：' + after);
      assert.ok(after.includes('- [[激活排查]]'), '已有链接要保住');
      assert.ok(after.includes('- [[新的双链]]'), '新链接要写进去');
      assert.ok(!after.includes('[[OK]]') && !after.includes('[[继续]]'), '弱标题不该留在双链里');
      assert.ok(after.includes('正文不能被双链改写。'), '正文一个字不动');
      assert.ok(after.includes('<!-- oblivion:id=ts-link-1 version=1 -->'), '幂等标记要留着');

      // 幂等：同一批链接再跑一次，不写盘
      assert.equal(await kit.appendRelatedLinks(path, ['新的双链']), false);
      assert.equal(readFileSync(path, 'utf8'), after);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('prune 模式：陈旧双链（目标笔记已不在盘上）可以被清掉', async () => {
    const tmp = mkdtemp(join(tmpdir(), 'oblivion-links3-'));
    try {
      const path = join(tmp, '笔记.md');
      writeFileSync(path, CLUTTERED, 'utf8');
      // 合并模式会**保住**已有链接 —— 这正是现场 513 条双链里 478 条悬空的原因
      // （候选来自条目，条目的 title 被改名回填改掉之后，旧链接就再也指不到文件了）。
      assert.equal(
        await kit.appendRelatedLinks(path, ['继续查并修掉这个激活问题'], { prune: true }),
        true,
      );
      const pruned = readFileSync(path, 'utf8');
      assert.ok(pruned.includes('- [[继续查并修掉这个激活问题]]'), pruned);
      assert.ok(!pruned.includes('[[激活排查]]') && !pruned.includes('[[数据目录归属之谜]]'), '陈旧链接要清掉：' + pruned);
      assert.equal(pruned.split(kit.RELATED_HEADER).length - 1, 1, '仍然只有一段');
      assert.ok(pruned.includes('正文不能被双链改写。'), '正文不动');

      // 幂等
      assert.equal(
        await kit.appendRelatedLinks(path, ['继续查并修掉这个激活问题'], { prune: true }),
        false,
      );

      // prune + 空列表 ⇒ 段整个去掉（不留空标题）
      assert.equal(await kit.appendRelatedLinks(path, [], { prune: true }), true);
      const empty = readFileSync(path, 'utf8');
      assert.ok(!empty.includes(kit.RELATED_HEADER), '没有链接就不该留空段：' + empty);
      assert.ok(empty.includes('正文不能被双链改写。'), '正文还在');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('用户自有笔记与「全是弱标题」两种情况都不动文件', async () => {
    const tmp = mkdtemp(join(tmpdir(), 'oblivion-links2-'));
    try {
      const mine = join(tmp, '我自己的笔记.md');
      writeFileSync(mine, '# 我自己的笔记\n\n别碰我。\n', 'utf8');
      assert.equal(await kit.appendRelatedLinks(mine, ['激活排查']), false, '用户自有笔记不动');
      assert.equal(readFileSync(mine, 'utf8'), '# 我自己的笔记\n\n别碰我。\n');

      const path = join(tmp, '笔记.md');
      writeFileSync(path, CLUTTERED, 'utf8');
      assert.equal(await kit.appendRelatedLinks(path, ['OK', '继续']), false, '全是弱标题就不写');
      assert.equal(readFileSync(path, 'utf8'), CLUTTERED);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('主题页（oblivion_wiki）：模型判簇，插件落盘 + 回链', () => {
  let kit;

  before(async () => {
    kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
  });

  function noteOf(id, title, ask, body) {
    return [
      '---',
      'title: ' + JSON.stringify(title),
      'topic: "认知层"',
      'source: "session"',
      'ref: "session-x#turn-1"',
      'created_at: "2026-10-06"',
      'updated_at: "2026-10-06"',
      'tags: ["dsh", "plugin"]',
      'status: "active"',
      'impl: "implemented"',
      'ask: ' + JSON.stringify(ask),
      '---',
      '',
      '# ' + title,
      '',
      '>Date :  2026-10-06',
      '>Source：Oblivion',
      '>Tags： #dsh #plugin',
      '>Ask： ' + ask,
      '',
      '## 内容',
      '',
      '### 具体实施计划',
      '',
      body,
      '',
      '## 来源',
      '',
      '- `session`: session-x#turn-1',
      '',
      '<!-- oblivion:id=' + id + ' version=1 -->',
      '',
    ].join('\n');
  }

  function fixture() {
    const tmp = mkdtemp(join(tmpdir(), 'oblivion-wiki-'));
    const mdRoot = join(tmp, 'kb');
    const mdDir = join(mdRoot, '01_问答沉淀');
    mkdirSync(mdDir, { recursive: true });
    writeFileSync(
      join(mdDir, '事件作用域.md'),
      noteOf('ts-w-1', '事件作用域', '插件的 session/event 收不到，为什么', '作用域过滤派发。'),
      'utf8',
    );
    writeFileSync(
      join(mdDir, '注入服务.md'),
      noteOf('ts-w-2', '注入服务', '未声明的服务读取就抛，怎么绕', 'inject 里声明才能读。'),
      'utf8',
    );
    return { tmp, mdRoot, mdDir };
  }

  function serviceOf(f, host) {
    return kit.createWikiService({
      mdRoot: f.mdRoot,
      dataRoot: join(f.tmp, 'data'),
      classify: { session: '01_问答沉淀', wiki: '02_Wiki页面' },
      host: host ?? null,
    });
  }

  const CLUSTER = {
    title: '认知插件组 · 事件作用域与注入',
    summary: '两条坑同源：事件按作用域过滤派发，服务不声明就读不了。',
    members: ['ts-w-1', 'ts-w-2'],
    tags: ['scope'],
  };

  it('renderWikiPage：frontmatter + 概述 + 成员双链 + 状态标注 + 标签并集 + 幂等尾标', async () => {
    const page = kit.renderWikiPage({
      cluster: { title: '主题页样板', summary: '合并后的一句话。', members: [], tags: ['GRAPH'] },
      members: [
        { id: 'a', file: '现行那篇.md', title: '现行那篇', ask: '原来问什么', status: 'active', tags: ['dsh'], excerpt: '' },
        { id: 'b', file: '旧版那篇.md', title: '旧版那篇', ask: '', status: 'superseded', tags: ['plugin'], excerpt: '' },
        // 文件名与标题不一致（标题里有 `:`）：链接必须跟着**文件名**走
        { id: 'c', file: 'cordis_group 形状核对.md', title: 'cordis:group 形状核对', ask: '两层同插', status: 'active', tags: [], excerpt: '' },
      ],
      at: Date.parse('2026-10-06T12:00:00Z'),
    });
    assert.ok(page.includes('title: "主题页样板"'), page);
    assert.ok(page.includes('generated_by: "model"'));
    assert.ok(page.includes('## 概述'));
    assert.ok(page.includes('合并后的一句话。'));
    assert.ok(page.includes('- [[现行那篇]] —— 原来问什么'), '成员要带原问句：' + page);
    assert.ok(page.includes('- [[旧版那篇]]（已被新版取代）'), '非 active 成员要标出来');
    assert.ok(page.includes('- [[cordis_group 形状核对]]'), '链接文本用文件名，不用带 : 的标题：' + page);
    assert.ok(!page.includes('[[cordis:group'), '带 : 的标题不能当链接');
    assert.ok(page.includes('## 口径提示'), '有非 active 成员时要有口径提示');
    assert.ok(page.includes('tags: ["graph", "dsh", "plugin"]'), '标签并集且小写：' + page);
    assert.ok(/<!-- oblivion:wiki title=主题页样板 members=3 at=\d+ -->/.test(page), '要有幂等尾标');
  });

  it('落地：写主题页 + 给每篇成员笔记补一行 > Wiki + 不动正文；重跑是更新同一页', async () => {
    const f = fixture();
    try {
      const self = { items: [] };
      const svc = serviceOf(f, {
        store: { loadAll: async () => self.items },
        index: {
          rebuild: (items) => {
            self.items = items;
          },
          all: () => self.items,
        },
      });
      const before = readFileSync(join(f.mdDir, '事件作用域.md'), 'utf8');

      const first = await svc.apply([CLUSTER]);
      assert.deepEqual(first.results.map((r) => [r.ok, r.members, r.linked]), [[true, 2, 2]]);
      const pagePath = join(f.mdRoot, '02_Wiki页面', CLUSTER.title + '.md');
      assert.ok(existsSync(pagePath), '主题页要落在 02_Wiki页面/：' + first.results[0].file);
      const page = readFileSync(pagePath, 'utf8');
      assert.ok(page.includes('两条坑同源'), '模型的概述要落进页面');
      assert.ok(page.includes('- [[事件作用域]] —— 插件的 session/event 收不到，为什么'));

      const after = readFileSync(join(f.mdDir, '事件作用域.md'), 'utf8');
      assert.ok(after.includes('> Wiki： [[' + CLUSTER.title + ']]'), '要写回 Wiki 行：' + after);
      assert.ok(after.includes('>Ask： 插件的 session/event 收不到，为什么'), 'Wiki 行插在元信息块末尾，别顶掉 Ask');
      assert.ok(before.includes('### 具体实施计划') && after.includes('### 具体实施计划'), '正文一个字不动');
      assert.ok(after.includes('<!-- oblivion:id=ts-w-1 version=1 -->'));
      assert.equal(first.index.count, 0, '索引按 host 的 store 重建（这里替身是空的，但路径要有）');
      assert.ok(first.index.path.endsWith('索引.md'));

      // 幂等：同一簇重跑 ⇒ 更新同一页，不再写回已经指过的链接
      const second = await svc.apply([CLUSTER]);
      assert.equal(second.results[0].file, first.results[0].file, '不能长出 -2.md');
      assert.equal(second.results[0].linked, 0, '已指过的链接不重复写');
      assert.deepEqual(readdirNames(join(f.mdRoot, '02_Wiki页面')), [CLUSTER.title + '.md']);

      const list = await svc.list(10);
      assert.deepEqual(list.pages.map((p) => [p.title, p.members]), [[CLUSTER.title, 2]]);
      assert.equal(list.notes.length, 2);
      assert.ok(list.notes.every((n) => n.wiki.includes(CLUSTER.title)), '候选里要能看到「已归页」');
      assert.equal(list.notes.find((n) => n.id === 'ts-w-1').ask, '插件的 session/event 收不到，为什么');
    } finally {
      rmSync(f.tmp, { recursive: true, force: true });
    }
  });

  it('防误伤：用户自己的同名笔记不会被覆盖，改成 <标题>-oblivion.md', async () => {
    const f = fixture();
    try {
      const wikiDir = join(f.mdRoot, '02_Wiki页面');
      mkdirSync(wikiDir, { recursive: true });
      const mine = '# 我自己写的主题页\n\n别碰我。\n';
      writeFileSync(join(wikiDir, CLUSTER.title + '.md'), mine, 'utf8');

      const { results } = await serviceOf(f).apply([CLUSTER]);
      assert.equal(results[0].file, CLUSTER.title + '-oblivion.md');
      assert.equal(readFileSync(join(wikiDir, CLUSTER.title + '.md'), 'utf8'), mine, '用户自己的文件一个字都不改');
      assert.ok(readFileSync(join(wikiDir, results[0].file), 'utf8').includes('oblivion:wiki'));
    } finally {
      rmSync(f.tmp, { recursive: true, force: true });
    }
  });

  it('工具两段式：不带 clusters 给候选 + 已有主题页，带 clusters 落地；服务缺席只回 skipped', async () => {
    const f = fixture();
    try {
      const defs = new Map();
      const ctx = { tools: { register: (d) => defs.set(d.name, d) } };
      kit.registerTools(ctx, {
        knowledge: {},
        profile: {},
        feedback: null,
        graph: {},
        wiki: serviceOf(f),
      });

      const tool = defs.get('oblivion_wiki');
      assert.ok(tool, '要注册 oblivion_wiki');

      const listed = await tool.execute({ limit: 5 }, {});
      assert.equal(listed.mode, 'list');
      assert.equal(listed.count, 2);
      assert.deepEqual(listed.pages, []);
      assert.equal(listed.notes[0].wiki, null);
      assert.ok(listed.notes[0].ask !== '', '候选要带原问句，模型才判得出「是不是一个主题」');

      const applied = await tool.execute({ clusters: [CLUSTER] }, {});
      assert.equal(applied.mode, 'apply');
      assert.equal(applied.total, 1);
      assert.equal(applied.pages, 1);
      assert.equal(applied.linked, 2);
      assert.deepEqual(applied.failed, []);

      const after = await tool.execute({ limit: 5 }, {});
      assert.deepEqual(after.pages.map((p) => p.title), [CLUSTER.title]);
      assert.ok(after.notes.every((n) => n.wiki.includes(CLUSTER.title)));

      const none = new Map();
      const ctx2 = { tools: { register: (d) => none.set(d.name, d) } };
      kit.registerTools(ctx2, { knowledge: {}, profile: {}, feedback: null, graph: {}, wiki: null });
      assert.equal((await none.get('oblivion_wiki').execute({}, {})).skipped, true);
    } finally {
      rmSync(f.tmp, { recursive: true, force: true });
    }
  });

  it('双链按文件名：标题里有 : 或 / 时，链接指向消毒后的文件名而不是标题', async () => {
    const f = fixture();
    try {
      // 成员标题里带 `:`：落盘文件名会被消毒成 `_`，链接文本必须跟着改，否则 Obsidian 里是悬空链接
      writeFileSync(
        join(f.mdDir, '清理死进程残留 + cordis_group 形状核对.md'),
        noteOf('ts-w-3', '清理死进程残留 + cordis:group 形状核对', '把残留一次清干净', '清完了。'),
        'utf8',
      );
      const cluster = { title: 'A/B：两条工程实践', summary: 'x', members: ['ts-w-1', 'ts-w-3'], tags: [] };
      const { results } = await serviceOf(f).apply([cluster]);
      assert.ok(results[0].file.includes('_') && !results[0].file.includes('/'), '页面文件名要消毒：' + results[0].file);

      const page = readFileSync(join(f.mdRoot, '02_Wiki页面', results[0].file), 'utf8');
      assert.ok(page.includes('- [[清理死进程残留 + cordis_group 形状核对]]'), '成员链接用文件名：' + page);
      assert.ok(!page.includes('[[清理死进程残留 + cordis:group'), '不能拿带 : 的标题当链接');

      const member = readFileSync(join(f.mdDir, '清理死进程残留 + cordis_group 形状核对.md'), 'utf8');
      assert.ok(
        member.includes('> Wiki： [[' + results[0].file.replace(/\.md$/, '') + ']]'),
        '回链也要用落盘文件名：' + member,
      );

      // 关联知识双链同理：`appendRelatedLinks` 收的是标题，写出去的是文件名
      const related = join(f.mdDir, '事件作用域.md');
      assert.equal(await kit.appendRelatedLinks(related, ['清理死进程残留 + cordis:group 形状核对']), true);
      const fixed = readFileSync(related, 'utf8');
      assert.ok(fixed.includes('- [[清理死进程残留 + cordis_group 形状核对]]'), '关联知识也要按文件名：' + fixed);
    } finally {
      rmSync(f.tmp, { recursive: true, force: true });
    }
  });

  it('空标题 / 全是陌生 id 的簇按失败回报，不写空文件', async () => {    const f = fixture();
    try {
      const { results } = await serviceOf(f).apply([
        { title: '', summary: 'x', members: ['ts-w-1'] },
        { title: '不存在的簇', summary: 'x', members: ['ts-nope'] },
      ]);
      assert.deepEqual(results.map((r) => r.error), ['empty-title', 'no-known-members']);
      assert.deepEqual(readdirNames(join(f.mdRoot, '02_Wiki页面')), []);
    } finally {
      rmSync(f.tmp, { recursive: true, force: true });
    }
  });
});
