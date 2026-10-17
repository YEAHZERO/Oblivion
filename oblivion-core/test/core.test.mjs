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

/** 同步小睡（不引 async，好在 `finally` 里直接用）。 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 删临时目录：Windows 上 `rmSync` 会抛**瞬时** EPERM —— 文件句柄刚被异步写放开、
 * 或杀毒在扫刚写的文件。退避重试几次；仍然失败就**放过**：临时目录留在 %TEMP% 不是
 * 用例失败，而拿它把整条闸门判红就是假失败（2026-10-16 在 `pnpm -r run test` 下真撞到一次）。
 */
function cleanupDir(dir) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch {
      if (attempt === 4) return;
      sleepSync(40 * (attempt + 1));
    }
  }
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
  const seen = { tools: [], effects: [], events: [], sections: [], sectionDefs: [] };
  return {
    seen,
    ctx: {
      tools: { register: (d) => seen.tools.push(d?.name) },
      systemPrompt: {
        section: (d) => {
          seen.sections.push(d.name);
          seen.sectionDefs.push(d);
          return () => {};
        },
        // 如实模拟真宿主：DSH 的排位表只认识它自己的段落名，未知名回 undefined
        // （旧桩回 50，替宿主答了它不会给的数，于是真宿主里 section() 抛
        //  `order must be a finite number` 而闸门全绿 —— 见 src/prompt.ts）。
        getSectionOrder: () => undefined,
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

/**
 * 在系统临时目录里 apply。
 *
 * **必须**：`mod.apply(ctx, {})` 会落到 `DEFAULT_CONFIG`（`~/.oblivion/data` +
 * `C:/Library/那些渐渐被遗忘`），于是单元测试会往**真实数据目录**写
 * `status.json` / `mount-diag.json` / `mcp-channel-diag.json`（2026-10-17 查到的
 * `status.json` 撕裂根因：装载快照与本测试的交错写入），还会在真实知识库里建分类目录。
 * 返回本次用的根目录，调用方负责 `cleanupDir()`。
 */
function applyInTemp(ctx, config = {}) {
  const root = mkdtemp(join(tmpdir(), 'oblivion-apply-'));
  mod.apply(ctx, { dataRoot: join(root, 'data'), mdRoot: join(root, 'kb'), ...config });
  return root;
}

describe('装配（apply）', () => {
  it('注册 10 个模型面工具（含观测面、整理、改名、主题页与自动整理）', () => {
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
        'oblivion_organize',
        'oblivion_profile',
        'oblivion_query',
        'oblivion_retitle',
        'oblivion_status',
        'oblivion_wiki',
      ]);
    } finally {
      cleanupDir(tmp);
    }
  });

  it('注册一个 systemPrompt 段落（用于认知陪伴注入）', () => {
    const { ctx, seen } = fakeCtx();
    const root = applyInTemp(ctx);
    try {
      assert.deepEqual(seen.sections, ['OBLIVION_COGNITION']);
      // 回归位：宿主的排位表不认识我们的名字（桩现在如实回 undefined），
      // 而 DSH 的 section() 对非有限 order 直接抛错 —— 必须用兜底位。
      assert.ok(
        Number.isFinite(seen.sectionDefs[0]?.order),
        `段落 order 必须是有限数，实际 ${String(seen.sectionDefs[0]?.order)}`,
      );
    } finally {
      cleanupDir(root);
    }
  });

  it('监听 session/event，且每个副作用都走 ctx.effect（卸载无残留）', () => {
    const { ctx, seen } = fakeCtx();
    const root = applyInTemp(ctx);
    try {
      assert.ok(seen.events.includes('session/event'));
      assert.ok(seen.effects.length >= 6, '期望每个模块都有自己的 effect 清理位');
      assert.ok(seen.effects.every((label) => /^oblivion-core: /.test(label)));
    } finally {
      cleanupDir(root);
    }
  });

  it('关闭开关后不再注册 feedback / perspective 相关副作用', () => {
    const withBoth = fakeCtx();
    const root = applyInTemp(withBoth.ctx, { enableFeedback: false, enablePerspective: false });
    try {
      const effects = withBoth.seen.effects.join('\n');
      assert.ok(!effects.includes('feedback teardown'), 'enableFeedback=false 时不应注册 feedback');
      assert.ok(!effects.includes('perspective teardown'), 'enablePerspective=false 时不应注册 perspective');
    } finally {
      cleanupDir(root);
    }
  });

  it('提示段落是惰性求值的函数（陪伴内容只在下一轮生效）', () => {
    const { ctx } = fakeCtx();
    let captured;
    ctx.systemPrompt.section = (d) => {
      captured = d;
      return () => {};
    };
    const root = applyInTemp(ctx);
    try {
      assert.equal(typeof captured.text, 'function');
      assert.equal(captured.text({ agent: undefined }), '', '没有 agent 时不注入任何内容');
      assert.ok(captured.text({ agent: {} }).includes('Oblivion 认知陪伴规则'));
    } finally {
      cleanupDir(root);
    }
  });

  it('装载即建目录：mdRoot 一经配置就自动创建 01_问答沉淀/ 等分类目录', async () => {
    const kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
    const root = await mkdtemp(join(tmpdir(), 'oblivion-mdroot-'));
    try {
      const { ctx } = fakeCtx();
      // 刻意用一个与默认值完全不同的自定义知识库位置
      mod.apply(ctx, { dataRoot: join(root, 'data'), mdRoot: join(root, '自定义知识库') });
      const expected = ['01_问答沉淀', '00_导入文件', '02_Wiki页面', '03_创作产物', '04_会话整理', '99_其他'];
      const missingNow = () =>
        expected.filter((dir) => !existsSync(join(root, '自定义知识库', dir)));
      // 目录创建**是非阻塞链路**（fire-and-forget，失败只记日志），所以这里轮询到齐，
      // 而不是睡一个固定时长：`pnpm -r run test` 下四个包并发跑，固定 300ms 会在大负载
      // 下偶发「只差最后建的那个目录」，把可靠的闸门变成运气（2026-10-16 复现过一次）。
      const deadline = Date.now() + 5_000;
      while (missingNow().length > 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      const missing = missingNow();
      assert.deepEqual(missing, [], '应自动创建全部分类目录，缺：' + missing.join('、'));
      // 消毒：配置里的分类目录不得逃出 mdRoot
      assert.equal(kit.safeDirName('../../etc'), 'etc');
      assert.equal(kit.safeDirName('C:\\Windows\\System32'), 'Windows/System32');
    } finally {
      cleanupDir(root);
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

  /**
   * 所有者 2026-10-06：「顺手把标签噪声治掉」。
   *
   * 实测噪声三类：格式词（`#md #json #ts #js #yaml`，来自 `TECH`）、
   * 路径碎片（`#Users`，来自 `topicHint`）、纯数字（`#15044`，topic 碎片）。
   */
  it('标签噪声：格式词 / 路径碎片 / 纯数字一律不打，且大小写不敏感去重', () => {
    assert.deepEqual(
      kit.sanitizeTags(['md', 'JSON', 'yaml', 'ts', 'Users', '15044', 'plugin', '#md', 'PLUGIN', '']),
      ['plugin'],
    );
    const tags = kit.tagsFromQA(
      '改 cordis.patch.yml 里的 json 与 ts 配置',
      '跑 npm test，文件在 C:\\Users\\liveu\\Projects\\Oblivion',
    );
    for (const noise of ['md', 'json', 'yaml', 'ts', 'js', 'users', 'projects', 'local', '15044']) {
      assert.ok(!tags.includes(noise), '不该出现噪声标签 ' + noise + '：' + tags.join(','));
    }
    assert.ok(tags.includes('npm'), '真标签要留住：' + tags.join(','));
    assert.ok(tags.length <= kit.TAG_MAX);
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
 * 问答抽取：**推理块不是答案**。
 *
 * 起因（所有者 2026-10-07）：76 篇笔记里 40 篇的 `>Note：` 是英文推理碎片 ——
 * 根因是 `textOfMessage()` 把所有带 `text` 的 content block 拼起来，而推理块
 * 与可见文本块形状完全相同（都是 `{ type, text }`）。这里把口径钉在块类型上。
 */
describe('问答抽取（reasoning 不算答案）', () => {
  let kit;

  before(async () => {
    kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
  });

  it('textOfMessage 丢掉 reasoning / tool-call，只留可见文本', () => {
    const data = {
      message: {
        content: [
          { type: 'reasoning', text: 'Let me think about this. The user wants…' },
          { type: 'tool-call', id: 'c1', name: 'read', arguments: '{}' },
          { type: 'reasoning', text: 'Still thinking.' },
          { type: 'text', text: '## 结论\n\n就是这样做。' },
        ],
      },
    };
    assert.equal(kit.textOfMessage(data), '## 结论\n\n就是这样做。');
  });

  it('认 kind 口径（客户端 UI 词表），也认裸字符串与 text 短路', () => {
    assert.equal(kit.textOfMessage({ content: [{ kind: 'reasoning', text: 'thinking' }, { kind: 'text', text: '答' }] }), '答');
    assert.equal(kit.textOfMessage('直接是字符串'), '直接是字符串');
    assert.equal(kit.textOfMessage({ text: '顶层 text' }), '顶层 text');
    assert.equal(kit.textOfMessage({ message: { content: '数组以外的字符串形式' } }), '数组以外的字符串形式');
  });

  it('不认识的块类型仍然照读（保持宽容，别把上游形状变化变成静默丢内容）', () => {
    assert.equal(kit.textOfMessage({ content: [{ type: 'quote', text: '未来才有的块' }] }), '未来才有的块');
    assert.equal(kit.textOfMessage({ content: [{ text: '没有 type 的块' }] }), '没有 type 的块');
  });

  it('extractQAPair 的答案里不能混进推理', () => {
    const qa = kit.extractQAPair({
      sessionId: 's-1',
      turn: 7,
      events: [
        { type: 'user/message', seq: 1, data: { content: [{ type: 'text', text: '这个怎么修？' }], source: { kind: 'user' } } },
        {
          type: 'assistant/message',
          seq: 2,
          data: {
            message: {
              content: [
                { type: 'reasoning', text: 'Step 1: grep. Step 2: fix the join.' },
                { type: 'text', text: '改 `util/fs.ts`：rename 失败就退回直接写。' },
              ],
            },
          },
        },
      ],
    });
    assert.equal(qa.question, '这个怎么修？');
    assert.equal(qa.answer, '改 `util/fs.ts`：rename 失败就退回直接写。');
    assert.ok(!qa.answer.includes('Step 1'), '推理碎片漏进答案了：' + qa.answer);
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
      cleanupDir(f.tmp);
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
      cleanupDir(f.tmp);
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
      cleanupDir(f.tmp);
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
      cleanupDir(f.tmp);
    }
  });

  it('工具注册可注销：第二遍装载不再撞「already registered」（回归 2026-10-17 真机现场）', () => {
    // 假宿主照抄 dsh-tools 的语义：`register()` 返回「注销这个工具」的函数，同名第二次注册直接抛。
    const defs = new Map();
    const ctx = {
      tools: {
        register: (d) => {
          if (defs.has(d.name)) throw new Error(`tool "${d.name}" is already registered`);
          defs.set(d.name, d);
          return () => defs.delete(d.name);
        },
      },
    };
    const deps = { knowledge: {}, profile: {}, feedback: null, graph: {} };

    const first = kit.registerTools(ctx, deps);
    assert.equal(first.length, 10, '10 个 oblivion_* 工具都要把注销函数回交出来');
    assert.equal(defs.size, 10);

    // 不注销就再装一遍 = 2026-10-17 那次真机现场：apply() 直接抛，MCP 通道从桥接里消失。
    assert.throws(() => kit.registerTools(ctx, deps), /already registered/);

    // 注销后再装：不抛，注册表回到 10 个 —— 这就是 index.ts 把注册包进 ctx.effect 的效果。
    for (const dispose of first) dispose();
    assert.equal(defs.size, 0, 'disposer 调完注册表要清空');
    assert.equal(kit.registerTools(ctx, deps).length, 10);
    assert.equal(defs.size, 10);
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
      cleanupDir(f.tmp);
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
      cleanupDir(tmp);
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
      cleanupDir(tmp);
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
      cleanupDir(tmp);
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
      cleanupDir(f.tmp);
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
      cleanupDir(f.tmp);
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
      cleanupDir(f.tmp);
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
      cleanupDir(f.tmp);
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
      cleanupDir(f.tmp);
    }
  });
});

/**
 * 共现图裁剪：图是「辅助面」，但不能无限长 —— 本机实测 23,253 条边 / 3.64 MB，
 * 每轮捕获都要整份读盘 + JSON.parse。这里钉住裁剪口径：**留强边，且丢了多少要留痕**。
 */
describe('共现图裁剪（graph/prune）', () => {
  let kit;

  before(async () => {
    kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
  });

  const NO_DECAY = { base: 1, periodDays: 30 };
  const edge = (a, b, weight, at = 1_000, count = 0) => ({
    source_id: a,
    target_id: b,
    weight,
    last_reinforced_at: at,
    reinforce_count: count,
  });

  it('超出边上限时按有效权重留强边，并报出丢了多少', () => {
    const edges = [edge('a', 'b', 0.3), edge('b', 'c', 0.9), edge('c', 'd', 0.6)];
    const out = kit.pruneGraph(edges, { maxEdges: 2, maxNodes: 0 }, NO_DECAY, 1_000);
    assert.deepEqual(out.kept.map((e) => [e.source_id, e.target_id]), [['b', 'c'], ['c', 'd']]);
    assert.equal(out.droppedEdges, 1);
    assert.equal(out.droppedNodes, 0);
    assert.equal(out.nodes, 3);
  });

  it('同权重时按「最近强化」再按强化次数排（不是先进先出）', () => {
    const edges = [edge('a', 'b', 0.5, 100, 0), edge('c', 'd', 0.5, 900, 0), edge('e', 'f', 0.5, 900, 3)];
    const out = kit.pruneGraph(edges, { maxEdges: 2, maxNodes: 0 }, NO_DECAY, 1_000);
    assert.deepEqual(out.kept.map((e) => e.source_id + e.target_id), ['ef', 'cd']);
  });

  it('超出节点上限时先丢「节点强度」最低的节点及其边', () => {
    // 中心 hub 与三个叶子相连：叶子各只有一条弱边 ⇒ 节点上限 2 时只留最强的那条边。
    const edges = [
      edge('hub', 'weak1', 0.3),
      edge('hub', 'weak2', 0.3),
      edge('hub', 'strong', 1.0),
    ];
    const out = kit.pruneGraph(edges, { maxEdges: 0, maxNodes: 2 }, NO_DECAY, 1_000);
    assert.deepEqual(out.kept.map((e) => e.target_id), ['strong']);
    assert.equal(out.droppedEdges, 2);
    assert.equal(out.droppedNodes, 2);
    assert.equal(out.nodes, 2);
  });

  it('上限 <= 0 表示不限制（原样返回、一条不丢）', () => {
    const edges = [edge('a', 'b', 0.3), edge('b', 'c', 0.9)];
    const out = kit.pruneGraph(edges, { maxEdges: 0, maxNodes: 0 }, NO_DECAY, 1_000);
    assert.equal(out.kept.length, 2);
    assert.equal(out.droppedEdges, 0);
    assert.equal(out.droppedNodes, 0);
  });

  it('不改入参（调用方决定何时落盘）', () => {
    const edges = [edge('a', 'b', 0.3), edge('b', 'c', 0.9)];
    const before = JSON.stringify(edges);
    kit.pruneGraph(edges, { maxEdges: 1, maxNodes: 0 }, NO_DECAY, 1_000);
    assert.equal(JSON.stringify(edges), before);
  });
});

/**
 * 条目文件名的形状闸门。
 *
 * `loadAll()` 现在**按文件名**先过滤（不解析就跳过 graph.json / status.json 这些非条目状态文件）。
 * 这条测试把 `newId()` 的产物钉在该形状上 —— 哪天改了 id 格式却忘了同步 `ENTRY_FILE_RE`，
 * 这里会红，而不是在真实知识库里静默丢掉所有条目。
 */
describe('条目文件名形状（store/ENTRY_FILE_RE）', () => {
  let kit;

  before(async () => {
    kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
  });

  it('newId() + .json 必须匹配（真实样例也对得上）', () => {
    for (let i = 0; i < 50; i += 1) {
      assert.ok(kit.ENTRY_FILE_RE.test(kit.newId() + '.json'), 'newId 形状漂了：' + kit.newId());
    }
    assert.ok(kit.ENTRY_FILE_RE.test('ts-muwsocwo-yk.json'));
    assert.ok(kit.ENTRY_FILE_RE.test('ts-1a2b3c-0z.json'));
  });

  it('dataRoot 里的非条目状态文件一律不匹配（省掉每轮 3.6 MB 的白读）', () => {
    for (const name of [
      'graph.json',
      'graph-events.json',
      'status.json',
      'mount-diag.json',
      'panel-client-diag.json',
      'index.json',
      'state.json',
      'profile.json',
      'perspective.json',
      'decisions.jsonl',
      'ts-muwsocwo-yk.md',
      'ts-muwsocwo-yk.json.bak',
    ]) {
      assert.ok(!kit.ENTRY_FILE_RE.test(name), '不该被当成条目：' + name);
    }
  });
});

/**
 * topic 口径（0.2.10）：整句归一化，不再是「问句里第一个词串」。
 *
 * 旧实现的 topic 实测长成 `Windows` / `key` / `针对C` / `只做体检` 这类碎片，
 * 既不能当归类线索，也让 `supersedeOlder()` 按错误口径降级旧条目。
 */
describe('主题（topic）口径', () => {
  let kit;

  before(async () => {
    kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
  });

  it('保留整句，剥开头水词，去掉结尾标点', () => {
    assert.equal(
      kit.topicFromQuestion('如何把 Windows 上的 rename 失败改成退回直接写？'),
      'Windows 上的 rename 失败改成退回直接写',
    );
  });

  it('不再是第一个词串：多词问句整句留下', () => {
    const topic = kit.topicFromQuestion('面板自己从 decisions.jsonl 现算（不动 core）');
    assert.ok(topic.includes('decisions.jsonl'), 'topic 丢了问句主体：' + topic);
    assert.ok(topic.length > 10, 'topic 还是碎片：' + topic);
    // 括号落在句子末尾 ⇒ 与旧的 `EDGE_PUNCT` 收尾规则一致地去掉括号，但**内容全留**。
    assert.equal(topic, '面板自己从 decisions.jsonl 现算不动 core');
  });

  it('deriveTopic 走同一口径，空问句退回 untitled', () => {
    assert.equal(
      kit.deriveTopic({ question: '怎么让 bridge 支持直接给 token', answer: 'x' }),
      '让 bridge 支持直接给 token',
    );
    assert.equal(kit.deriveTopic({ question: '   ', answer: 'x' }), 'untitled');
  });

  it('显式 topicHint 仍然优先（模型给的主题不被改写）', () => {
    assert.equal(kit.deriveTopic({ question: '随便', answer: 'x', topicHint: '运行时装载' }), '运行时装载');
  });

  it('topic 超长按上限截断，不切出半截括号', () => {
    const long = '这是一个特别特别长的问句' + '补'.repeat(80);
    const topic = kit.topicFromQuestion(long);
    assert.ok(topic.length <= kit.TOPIC_MAX, `topic 超长：${topic.length}`);
    assert.ok(topic.endsWith('…'));
  });

  it('URL 不进 topic（那是路径，不是主题）', () => {
    const topic = kit.topicFromQuestion('参考 https://github.com/foo/bar 这个插件的做法');
    assert.ok(!topic.includes('http'), 'topic 里带了 URL：' + topic);
  });
});

/**
 * 半截括号（0.2.10）。
 *
 * 起因（所有者 2026-10-07）：知识库里 7 篇笔记的名字带着半截括号 ——
 * `我提交_推送的（ 3f41a9d`、`不显示：最近判定 （窗口 10 条，显示最近 6 条`、
 * `改代码，更稳）：让 bridge 支持「直接给 token`。它们都是「问句被在第一个标点处切开」的残留。
 */
describe('名字里的半截括号', () => {
  let kit;

  before(async () => {
    kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
  });

  it('没闭合的开括号去掉', () => {
    const title = kit.titleFromQA('我提交、推送的（ 3f41a9d', '');
    assert.ok(!title.includes('（'), '还留着半截开括号：' + title);
    assert.ok(title.includes('3f41a9d'), '把内容也切掉了：' + title);
  });

  it('孤立的收括号去掉', () => {
    const title = kit.titleFromQA('改代码，更稳）：让 bridge 支持直接给 token', '');
    assert.ok(!title.includes('）'), '还留着孤立收括号：' + title);
    assert.ok(title.includes('bridge'), '把内容也切掉了：' + title);
  });

  it('配对完好的括号原样保留（不误伤）', () => {
    assert.equal(kit.titleFromQA('改一下（顺便）标签', ''), '改一下（顺便）标签');
    // 括号落在**句子两端**时本来就会被 `EDGE_PUNCT` 当装饰性标点去掉（0.1.x 起的规矩），
    // 这里钉住的是「去掉两端标点后不留半截括号」。
    assert.equal(kit.titleFromQA('「插件激活」怎么查', ''), '插件激活怎么查');
  });

  it('topic 与标题同一口径（两处都清）', () => {
    assert.ok(!kit.topicFromQuestion('不显示：最近判定 （窗口 10 条，显示最近 6 条').includes('（'));
    assert.ok(!kit.topicFromQuestion('改代码，更稳）：让 bridge 支持「直接给 token').includes('）'));
  });
});

describe('自动整理（DEC-030）', () => {
  let kit;

  before(async () => {
    kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
  });

  const NOTES = [
    { id: 'a1', file: '你是一个.md', path: join(tmpdir(), 'no-such-a1.md'), title: '你是一个', topic: '你是一个', tags: [], ask: '你是一个什么', namedBy: '', excerpt: '略', mtime: 2 },
    { id: 'b2', file: '逐包.md', path: join(tmpdir(), 'no-such-b2.md'), title: '逐包', topic: '逐包', tags: [], ask: '逐包怎么弄', namedBy: '', excerpt: '略', mtime: 1 },
  ];

  /**
   * 假宿主 LLM：`script` 的路 → 这一段流。
   *   `'throw'` = 适配器抛错；`'empty'` = 空流；其他字符串 = 一段 text-delta。
   * 同时记下**有没有真被调用**（「关着就不该发请求」这条断言全靠它）。
   *
   * 注册表里刻意留一个**用户自定义 provider**（`agnes`，自建 baseURL 的那种）：
   * 「设置页也能选到它」这条需求的全部依据就是「宿主注册表里有它」，
   * 插件不做白名单 —— 所以假宿主也必须能表现出「不止一个 provider」。
   */
  const DEFAULT_REGISTRY = [
    { id: 'fake', name: 'Fake', models: [{ provider: 'fake', id: 'm1' }] },
    {
      id: 'agnes',
      name: 'Agnes',
      models: [
        { provider: 'agnes', id: 'agnes-2.5-flash', name: 'agnes-2.5-flash' },
        { provider: 'agnes', id: 'agnes-3.0-flash' },
      ],
    },
  ];

  function fakeLlm(script, registry = DEFAULT_REGISTRY) {
    const calls = [];
    return {
      calls,
      listProviders: () => registry.map((p) => ({ id: p.id, name: p.name })),
      listModels: async (provider) => registry.find((p) => p.id === provider)?.models ?? [],
      stream(options) {
        calls.push(options);
        const key = options.provider + '/' + options.model;
        const step = Object.prototype.hasOwnProperty.call(script, key) ? script[key] : '';
        if (step === 'throw') throw new Error('boom:' + key);
        if (step === 'empty') return (async function* emptyStream() {})();
        return (async function* textStream() {
          yield { type: 'block-start', index: 0, blockType: 'text' };
          yield { type: 'text-delta', index: 0, text: step };
          yield { type: 'finish', reason: 'stop' };
        })();
      },
    };
  }

  function fakeRetitle(notes = NOTES, applied = []) {
    return {
      list: async (limit) => (limit > 0 ? notes.slice(0, limit) : notes),
      apply: async (entries) => {
        applied.push(...entries);
        return { results: entries.map((e) => ({ id: e.id, ok: true, from: 'old.md', to: 'new.md' })), index: null };
      },
    };
  }

  function organizeWith(overrides = {}, deps = {}) {
    return kit.createOrganizeService({
      config: {
        ...kit.DEFAULT_CONFIG,
        organize: { ...kit.DEFAULT_CONFIG.organize, ...overrides },
      },
      retitle: deps.retitle ?? fakeRetitle(),
      runtime: deps.runtime === undefined ? fakeLlm({}) : deps.runtime,
      at: deps.at ?? (() => 1_000_000),
      proposalsPath: deps.proposalsPath,
      defaultRoute: deps.defaultRoute,
    });
  }

  it('默认关着：preview 一个请求都不发', async () => {
    const runtime = fakeLlm({});
    const svc = organizeWith({ enabled: false }, { runtime });
    const out = await svc.preview();
    assert.equal(out.ok, false);
    assert.equal(out.enabled, false);
    assert.equal(runtime.calls.length, 0, '关着还去调模型了');
    assert.match(out.reason, /enabled is false/);
    assert.equal(svc.status().enabled, false);
  });

  it('开着但没选出模型：不碰 runtime，并说清为什么', async () => {
    const runtime = fakeLlm({});
    const svc = organizeWith({ enabled: true, provider: '', model: '' }, { runtime });
    const out = await svc.preview();
    assert.equal(out.ok, false);
    assert.equal(runtime.calls.length, 0);
    assert.match(out.reason, /没选出模型/);
  });

  it('宿主没有 llm 服务：不报错，只说不可用', async () => {
    const svc = organizeWith({ enabled: true, provider: 'fake', model: 'm1' }, { runtime: null });
    const out = await svc.preview();
    assert.equal(out.ok, false);
    assert.match(out.reason, /没有 llm 服务/);
    assert.equal(svc.status().llmAvailable, false);
  });

  describe('选路来源与可选模型清单（设置页的数据源）', () => {
    it('status 直接答出生效选路（关着也答，且不用先 preview）', () => {
      const svc = organizeWith(
        { enabled: false, provider: '', model: '' },
        { runtime: fakeLlm({}), defaultRoute: () => ({ provider: 'agnes', model: 'agnes-2.5-flash' }) },
      );
      const st = svc.status();
      assert.equal(st.enabled, false);
      assert.deepEqual(st.routes, [{ provider: 'agnes', model: 'agnes-2.5-flash' }]);
      assert.equal(st.routeSource, 'host-default', '没显式配 ⇒ 选路来自宿主默认');
    });

    it('显式配了主路：不再补宿主默认（routeSource=config）', () => {
      const svc = organizeWith(
        { enabled: true, provider: 'fake', model: 'm1' },
        { runtime: fakeLlm({}), defaultRoute: () => ({ provider: 'agnes', model: 'agnes-2.5-flash' }) },
      );
      const st = svc.status();
      assert.deepEqual(st.routes, [{ provider: 'fake', model: 'm1' }], '我明明配了 A，就不该跑 B');
      assert.equal(st.routeSource, 'config');
    });

    it('catalog 列出宿主全部 provider（含自定义 agnes），且零请求', async () => {
      const runtime = fakeLlm({});
      const svc = organizeWith(
        { enabled: false },
        { runtime, defaultRoute: () => ({ provider: 'agnes', model: 'agnes-2.5-flash' }) },
      );
      const cat = await svc.catalog();
      assert.equal(runtime.calls.length, 0, 'catalog 是注册表读取，不能发模型请求');
      assert.equal(cat.llmAvailable, true);
      assert.deepEqual(cat.providers.map((p) => p.id), ['fake', 'agnes']);
      const agnes = cat.providers.find((p) => p.id === 'agnes');
      assert.equal(agnes.name, 'Agnes', '显示名该用 displayName');
      assert.deepEqual(agnes.models.map((m) => m.id), ['agnes-2.5-flash', 'agnes-3.0-flash']);
      assert.deepEqual(cat.routes, [{ provider: 'agnes', model: 'agnes-2.5-flash' }]);
      assert.equal(cat.routeSource, 'host-default');
      // 关着也照样能列 —— 挑模型这件事本身不该要求先打开自动整理。
      assert.equal(svc.status().enabled, false);
    });

    it('没有 llm 服务：catalog 空手返回，不抛', async () => {
      const cat = await organizeWith({ enabled: false }, { runtime: null }).catalog();
      assert.deepEqual(cat.providers, []);
      assert.deepEqual(cat.routes, []);
      assert.equal(cat.routeSource, 'none');
      assert.equal(cat.llmAvailable, false);
    });

    it('某个 provider 的 listModels 抛错：它仍被列出，只是模型为空', async () => {
      const runtime = {
        calls: [],
        listProviders: () => [{ id: 'fake' }, { id: 'broken' }],
        listModels: async (provider) => {
          if (provider === 'broken') throw new Error('nope');
          return [{ provider: 'fake', id: 'm1' }];
        },
        stream() {
          throw new Error('unused');
        },
      };
      const cat = await organizeWith({ enabled: false }, { runtime }).catalog();
      assert.deepEqual(cat.providers.map((p) => p.id), ['fake', 'broken']);
      assert.deepEqual(cat.providers[1].models, []);
      assert.equal(cat.providers[1].name, 'broken', '没给显示名就退回 id');
    });

    it('宿主默认选路是 Promise 时：status 不猜（none），catalog await 出来', async () => {
      const svc = organizeWith(
        { enabled: true, provider: '', model: '' },
        {
          runtime: fakeLlm({}),
          defaultRoute: () => Promise.resolve({ provider: 'agnes', model: 'agnes-2.5-flash' }),
        },
      );
      assert.equal(svc.status().routeSource, 'none', '同步面不能猜异步值');
      const cat = await svc.catalog();
      assert.deepEqual(cat.routes, [{ provider: 'agnes', model: 'agnes-2.5-flash' }]);
      assert.equal(cat.routeSource, 'host-default');
      // 解析过一次就缓存住：再问同步面也答得出。
      assert.equal(svc.status().routeSource, 'host-default');
    });
  });

  it('开着且配了模型：拿到建议，落地时 named_by=model', async () => {
    const payload = JSON.stringify([{ id: 'a1', title: '你是一个什么（身份问答）', tags: ['#身份', 'rel'] }]);
    const runtime = fakeLlm({ 'fake/m1': payload });
    const applied = [];
    const svc = organizeWith(
      { enabled: true, provider: 'fake', model: 'm1' },
      { runtime, retitle: fakeRetitle(NOTES, applied) },
    );
    const out = await svc.preview();
    assert.equal(out.ok, true, out.reason);
    assert.equal(out.considered, 2);
    assert.equal(out.proposals.length, 1);
    assert.equal(out.proposals[0].id, 'a1');
    assert.equal(out.proposals[0].file, '你是一个.md');
    assert.deepEqual(out.proposals[0].tags, ['身份', 'rel'], '标签该去掉 # ');
    assert.equal(out.attempts.length, 1);
    assert.equal(out.attempts[0].ok, true);
    await svc.apply(out.proposals);
    assert.equal(applied.length, 1);
    assert.equal(applied[0].namedBy, 'model', '规则管线要靠这个标记让路');
  });

  it('自动切换：主路抛错，备用路顶上，两条路都留痕', async () => {
    const payload = JSON.stringify([{ id: 'a1', title: '备用路成功', tags: [] }]);
    const runtime = fakeLlm({ 'fake/main': 'throw', 'fake/backup': payload });
    const svc = organizeWith(
      { enabled: true, provider: 'fake', model: 'main', fallbacks: [{ provider: 'fake', model: 'backup' }] },
      { runtime },
    );
    const out = await svc.preview();
    assert.equal(out.ok, true, out.reason);
    assert.deepEqual(out.routes, [
      { provider: 'fake', model: 'main' },
      { provider: 'fake', model: 'backup' },
    ]);
    assert.equal(out.attempts.length, 2);
    assert.equal(out.attempts[0].ok, false);
    assert.match(String(out.attempts[0].error), /boom/);
    assert.equal(out.attempts[1].ok, true);
  });

  it('全路失败：ok:false，且每条路的失败原因都在', async () => {
    const runtime = fakeLlm({ 'fake/main': 'throw', 'fake/backup': 'empty' });
    const svc = organizeWith(
      { enabled: true, provider: 'fake', model: 'main', fallbacks: [{ provider: 'fake', model: 'backup' }] },
      { runtime },
    );
    const out = await svc.preview();
    assert.equal(out.ok, false);
    assert.equal(out.attempts.length, 2);
    assert.equal(out.attempts[1].ok, false);
    assert.match(String(out.attempts[1].error), /empty stream/);
    assert.match(out.reason, /所有路都失败了/);
  });

  it('终态 finish 报错也算失败（宿主把异常归一成 finish）', async () => {
    const runtime = fakeLlm({});
    const failing = {
      listProviders: () => [],
      listModels: async () => [],
      stream() {
        return (async function* finishError() {
          yield { type: 'text-delta', index: 0, text: '半截' };
          yield { type: 'finish', reason: 'error' };
        })();
      },
    };
    const svc = organizeWith({ enabled: true, provider: 'fake', model: 'm1' }, { runtime: failing });
    const out = await svc.preview();
    assert.equal(out.ok, false);
    assert.match(String(out.attempts[0].error), /finish=error/);
  });

  it('触发闸门：everyTurns=2 时第 1 轮不跑、第 2 轮跑；minIntervalMs 防抖', async () => {
    const dir = mkdtemp(join(tmpdir(), 'obl-gate-'));
    try {
      const runtime = fakeLlm({ 'fake/m1': '[]' });
      const svc = organizeWith(
        { enabled: true, provider: 'fake', model: 'm1', everyTurns: 2, minIntervalMs: 60_000 },
        { runtime, proposalsPath: join(dir, 'p.json') },
      );
      assert.equal(await svc.onTurn({ sessionId: 's1', at: 1_000_000 }), null, '第 1 轮不该跑');
      const second = await svc.onTurn({ sessionId: 's1', at: 1_000_000 });
      assert.ok(second !== null && second.ran, '第 2 轮该跑');
      assert.equal(await svc.onTurn({ sessionId: 's1', at: 1_000_000 }), null, '第 3 轮不该跑');
      const fourth = await svc.onTurn({ sessionId: 's1', at: 1_000_000 });
      assert.ok(fourth !== null);
      assert.equal(fourth.ran, false, 'minIntervalMs 内不该再跑');
      assert.match(fourth.reason, /minIntervalMs/);
    } finally {
      cleanupDir(dir);
    }
  });

  it('自动路径：只写建议文件、不碰知识库；readProposals 能读回', async () => {
    const dir = mkdtemp(join(tmpdir(), 'obl-props-'));
    try {
      const payload = JSON.stringify([{ id: 'a1', title: '甲', tags: ['t'] }]);
      const runtime = fakeLlm({ 'fake/m1': payload });
      const applied = [];
      const path = join(dir, 'organize-proposals.json');
      const svc = organizeWith(
        { enabled: true, provider: 'fake', model: 'm1', everyTurns: 1, minIntervalMs: 0, autoApply: false },
        { runtime, retitle: fakeRetitle(NOTES, applied), proposalsPath: path },
      );
      const out = await svc.onTurn({ sessionId: 's1', at: 5 });
      assert.ok(out !== null && out.ran);
      assert.equal(out.applied, undefined, 'autoApply=false 时不该落地');
      assert.equal(applied.length, 0, '自动路径不能碰知识库');
      assert.ok(existsSync(path), '建议该落盘');
      const back = await svc.readProposals();
      assert.equal(back.at, 5);
      assert.deepEqual(back.proposals.map((p) => p.id), ['a1']);
    } finally {
      cleanupDir(dir);
    }
  });

  it('autoApply=true 才落地，且仍走 apply（named_by=model）', async () => {
    const dir = mkdtemp(join(tmpdir(), 'obl-autoapply-'));
    try {
      const payload = JSON.stringify([{ id: 'a1', title: '甲', tags: [] }]);
      const runtime = fakeLlm({ 'fake/m1': payload });
      const applied = [];
      const svc = organizeWith(
        { enabled: true, provider: 'fake', model: 'm1', everyTurns: 1, minIntervalMs: 0, autoApply: true },
        { runtime, retitle: fakeRetitle(NOTES, applied), proposalsPath: join(dir, 'p.json') },
      );
      const out = await svc.onTurn({ sessionId: 's1', at: 7 });
      assert.ok(out !== null && out.applied === true);
      assert.equal(applied.length, 1);
      assert.equal(applied[0].namedBy, 'model');
    } finally {
      cleanupDir(dir);
    }
  });

  it('关着时 onTurn 直接 null（自动路径也零请求）', async () => {
    const runtime = fakeLlm({});
    const svc = organizeWith({ enabled: false, everyTurns: 1, minIntervalMs: 0 }, { runtime });
    assert.equal(await svc.onTurn({ sessionId: 's1', at: 1 }), null);
    assert.equal(runtime.calls.length, 0);
  });

  describe('建议解析（容错）', () => {
    const allowed = new Set(['a1', 'b2']);

    it('吃掉 Markdown 围栏与前后废话', () => {
      const text = '好的，我整理如下：\n```json\n[{"id":"a1","title":"名字","tags":["x"]}]\n```\n希望有帮助！';
      const { proposals, dropped } = kit.parseProposals(text, allowed);
      assert.equal(proposals.length, 1);
      assert.equal(proposals[0].title, '名字');
      assert.equal(dropped, 0);
    });

    it('未知 id / 空名字被丢，且计数对得上', () => {
      const text = '[{"id":"zz","title":"别人的"},{"id":"a1","title":"  "},{"id":"b2","title":"好名字"}]';
      const { proposals, dropped } = kit.parseProposals(text, allowed);
      assert.deepEqual(proposals.map((p) => p.id), ['b2']);
      assert.equal(dropped, 2);
    });

    it('整段不是数组时，逐个对象救回', () => {
      const text = '第一条 {"id":"a1","title":"甲"} 第二条 {"id":"b2","title":"乙"}';
      const { proposals } = kit.parseProposals(text, allowed);
      assert.deepEqual(proposals.map((p) => p.id), ['a1', 'b2']);
    });

    it('同一 id 只收一次（模型偶尔会重复输出）', () => {
      const text = '[{"id":"a1","title":"甲"},{"id":"a1","title":"乙"}]';
      const { proposals } = kit.parseProposals(text, allowed);
      assert.deepEqual(proposals.map((p) => p.title), ['甲']);
    });

    it('名字清洗：剥 # / .md、去换行与路径字符，并截断', () => {
      const text = JSON.stringify([{ id: 'a1', title: '  #  路径/名:字.md  ', tags: [] }]);
      const { proposals } = kit.parseProposals(text, allowed);
      const title = proposals[0].title;
      assert.ok(!title.includes('#'), title);
      assert.ok(!title.includes('.md'), title);
      assert.ok(!/[\n/\\:*?"<>|]/.test(title), title);
      assert.equal(title, '路径 名 字');
    });

    it('标签去 # / 去重 / 最多 8 个', () => {
      const text = JSON.stringify([{ id: 'a1', title: 'x', tags: ['#a', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'] }]);
      const { proposals } = kit.parseProposals(text, allowed);
      assert.deepEqual(proposals[0].tags, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    });

    it('完全不是 JSON：建议为空、原文可回带（便于当场看见模型没按格式回）', async () => {
      const runtime = fakeLlm({ 'fake/m1': '我觉得这些笔记都挺好，不用改。' });
      const svc = organizeWith({ enabled: true, provider: 'fake', model: 'm1' }, { runtime });
      const out = await svc.preview();
      assert.equal(out.ok, false);
      assert.equal(out.proposals.length, 0);
      assert.match(out.reason, /没给出可用建议/);
      assert.match(String(out.raw), /挺好/);
    });
  });

  it('提示词带上 id / 现名 / 提问 / 内容片段，并要求原样回抄 id', () => {
    const { system, prompt } = kit.buildRetitlePrompt([
      { id: 'a1', file: '你是一个.md', topic: '你是一个', ask: '你是一个什么', text: '这是一段正文' },
    ]);
    assert.match(system, /只输出一个 JSON 数组/);
    assert.match(prompt, /id=a1/);
    assert.match(prompt, /你是一个\.md/);
    assert.match(prompt, /你是一个什么/);
    assert.match(prompt, /这是一段正文/);
    assert.match(prompt, /原样回抄/);
  });
});

describe('三层配置（settings.json，DEC-030）', () => {
  let kit;

  before(async () => {
    kit = await import(new URL('../lib/testkit.js', import.meta.url).href);
  });

  it('设置层压过插件 config；没覆盖的键保留插件层', async () => {
    const dir = mkdtemp(join(tmpdir(), 'obl-set-a-'));
    try {
      await kit.writeSettings(dir, { mdRoot: '~/FromSettings' });
      const merged = kit.mergeSettingsConfig({ mdRoot: '~/FromPlugin', logPrefix: '[x]' }, kit.readSettingsSync(dir));
      assert.equal(merged.mdRoot, '~/FromSettings');
      assert.equal(merged.logPrefix, '[x]');
      assert.equal(kit.resolveConfig(merged).mdRoot, '~/FromSettings');
    } finally {
      cleanupDir(dir);
    }
  });

  it('dataRoot 不能被设置层覆盖（住址不能自己决定）', async () => {
    const dir = mkdtemp(join(tmpdir(), 'obl-set-b-'));
    try {
      await kit.writeSettings(dir, { dataRoot: 'C:/evil' });
      assert.equal(kit.readSettingsSync(dir).dataRoot, undefined);
      const merged = kit.mergeSettingsConfig({ dataRoot: '~/.oblivion/data' }, kit.readSettingsSync(dir));
      assert.equal(merged.dataRoot, '~/.oblivion/data');
    } finally {
      cleanupDir(dir);
    }
  });

  it('organize 深合并：只翻一个开关不抹掉同块的其他键', async () => {
    const dir = mkdtemp(join(tmpdir(), 'obl-set-c-'));
    try {
      await kit.writeSettings(dir, { organize: { enabled: true, model: 'm9' } });
      const merged = kit.mergeSettingsConfig({ organize: { provider: 'p1' } }, kit.readSettingsSync(dir));
      const cfg = kit.resolveConfig(merged);
      assert.equal(cfg.organize.enabled, true);
      assert.equal(cfg.organize.model, 'm9');
      assert.equal(cfg.organize.provider, 'p1');
      assert.equal(cfg.organize.timeoutMs, kit.DEFAULT_CONFIG.organize.timeoutMs, '默认值该还在');
    } finally {
      cleanupDir(dir);
    }
  });

  it('configSources 标出每个键最终是谁定的', async () => {
    const dir = mkdtemp(join(tmpdir(), 'obl-set-d-'));
    try {
      await kit.writeSettings(dir, { mdRoot: '~/FromSettings' });
      const sources = kit.configSources(
        { logPrefix: '[p]', mdRoot: '~/plugin' },
        kit.readSettingsSync(dir),
        ['mdRoot', 'logPrefix', 'minAnswerLength'],
      );
      assert.equal(sources.mdRoot, 'settings');
      assert.equal(sources.logPrefix, 'plugin');
      assert.equal(sources.minAnswerLength, 'default');
    } finally {
      cleanupDir(dir);
    }
  });

  it('未知键被丢掉（写错键名不该静默生效）', async () => {
    const dir = mkdtemp(join(tmpdir(), 'obl-set-e-'));
    try {
      await kit.writeSettings(dir, { totally_unknown_key: 1, mdRoot: '~/ok' });
      const values = kit.readSettingsSync(dir);
      assert.equal(values.totally_unknown_key, undefined);
      assert.equal(values.mdRoot, '~/ok');
    } finally {
      cleanupDir(dir);
    }
  });

  it('null 可以删掉一个键（回到下层配置）', async () => {
    const dir = mkdtemp(join(tmpdir(), 'obl-set-f-'));
    try {
      await kit.writeSettings(dir, { mdRoot: '~/A', logPrefix: '[A]' });
      await kit.writeSettings(dir, { mdRoot: null });
      const values = kit.readSettingsSync(dir);
      assert.equal(values.mdRoot, undefined);
      assert.equal(values.logPrefix, '[A]');
    } finally {
      cleanupDir(dir);
    }
  });

  it('坏文件 / 不存在都不炸，一律当空设置', () => {
    const bad = mkdtemp(join(tmpdir(), 'obl-set-bad-'));
    try {
      writeFileSync(join(bad, 'settings.json'), '{ 这不是 JSON', 'utf8');
      assert.deepEqual(kit.readSettingsSync(bad), {});
    } finally {
      cleanupDir(bad);
    }
    assert.deepEqual(kit.readSettingsSync(join(tmpdir(), 'obl-set-missing-' + Date.now())), {});
    assert.equal(kit.settingsPathOf('~/x').endsWith('settings.json'), true);
  });
});
