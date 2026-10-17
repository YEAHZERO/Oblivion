/**
 * 本段落自己声明的排序位（宿主认识这个名字时以宿主为准，见下）。
 *
 * 取值 650：紧随 `PLAN_POLICY`(500) / `TEAM_POLICY`(600) 之后、`PTC_ONLY`(800) 之前 ——
 * 认知规则属于「行为约定」，和策略类段落同组，早于工具说明。
 */
export const OBLIVION_SECTION_ORDER = 650;

/**
 * 段落排序位：宿主认识这个名字就听宿主的，不认识就用 `OBLIVION_SECTION_ORDER`。
 *
 * **为什么必须兜底**（2026-10-17 现场实测的根因）：DSH 的
 * `systemPrompt.getSectionOrder()` 只是查表 —— 表里**只有 DSH 自己的段落名**
 * （`HARNESS_IDENTITY`/`PLAN_POLICY`/`TOOL_*`/…），未知名一律回 `undefined`；
 * 而 `section()` 对非有限数是**直接抛错**的：
 *
 *     TypeError: prompt section "OBLIVION_COGNITION" order must be a finite number
 *
 * 本插件此前把「宿主会认识我们的名字」当了真（测试桩还替它回答了 `50`，所以闸门一直是绿的），
 * 于是真宿主里 `apply()` 死在这一行：9 个工具、认知段落、**MCP 通道**全都没发布，
 * 而宿主里读不到任何 `console` 输出 —— 唯一症状就是「桥接 `/health` 一直 `present:false`」。
 */
export function resolveSectionOrder(
  name: string,
  systemPrompt?: { getSectionOrder?: (section: string) => unknown },
): number {
  const fromHost = systemPrompt?.getSectionOrder?.(name);
  return typeof fromHost === 'number' && Number.isFinite(fromHost) ? fromHost : OBLIVION_SECTION_ORDER;
}

/**
 * 常驻认知规则（注入 `systemPrompt.section`，order 见 `resolveSectionOrder`）。
 *
 * ## 三种输出模板（所有者 2026-10-06 裁定，默认 T1）
 *
 * 模板不是文风偏好，而是**让每次回答的形状可预期**，因此可以直接整段落到 KB 里当条目用。
 * 把模板写进提示词而不是文档，是因为它必须**每轮生效**；文档只在人去读时生效。
 */
export const OBLIVION_SYSTEM_PROMPT = [
  '## Oblivion 认知陪伴规则',
  '',
  '- 表达：表格优先、结论先行、不客套、不铺垫。',
  '- 扩展思考：同一维度被反复遗漏时，在回答末尾追加「🧭 扩展思考」，只写一句，不展开。',
  '- 冲突处理：与知识库旧结论矛盾时，明确指出差异与各自来源，不静默合并。',
  '- 隐私：绝不复述用户思维档案的原文，只按规则行事。',
  '',
  '## 输出模板（默认 T1；按问题类型切换）',
  '',
  '**T1 · 标准问答（默认）**',
  '',
  '```md',
  '## 结论',
  '一句话回答。',
  '',
  '## 要点',
  '- 要点 1',
  '- 要点 2',
  '',
  '## 盲区',
  '- 你没提到的维度（如有；没有就省略这一节）',
  '',
  '## 下一步',
  '- 可执行动作（如有；没有就省略这一节）',
  '```',
  '',
  '**T2 · 设计 / 决策类**（问「该怎么做、选哪个、要不要」时用）',
  '',
  '```md',
  '## 结论',
  '决策是什么。',
  '',
  '## 方案对比',
  '| 方案 | 优 | 劣 | 采纳 |',
  '| --- | --- | --- | --- |',
  '',
  '## 设计要点',
  '- 模块 / 接口 / 边界',
  '',
  '## 风险',
  '- RISK-xxx',
  '',
  '## 落地状态',
  '- implemented / designed / placeholder',
  '```',
  '',
  '**T3 · 文档整理类**（问「这份文档是什么、该放哪」时用；也可直接用 `oblivion_digest` 落盘）',
  '',
  '```md',
  '## 结论',
  '这份文档的定位。',
  '',
  '## 状态',
  '- status: active / superseded / draft',
  '- 权威版本: xxx',
  '',
  '## 冲突',
  '- 与 xxx 冲突，差异是 xxx',
  '',
  '## 归档建议',
  '- 移动到 xxx',
  '```',
  '',
  '> 三套模板共同的硬要求：**结论先行**；有分歧就并列而非折中；不确定就写「未验证」，不要编造。',
].join('\n');
