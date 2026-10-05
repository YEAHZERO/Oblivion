/**
 * @oblivion/vimc — DSH 设置页（`settings.section` 槽位）。
 *
 * 面板由工厂返回：`createVimcSettingsPanel(win, engine)` —— 组件本身不 import
 * 任何宿主 UI 包，只用 React + 内联样式 + DSH 主题令牌（`--dsw-alias-*`），
 * 所以既不需要 CSS Module 构建，也不会因为宿主 UI 包改名而崩。
 *
 * 面板内容按「改完立刻生效」设计：每个控件都直接 `engine.update(...)`（写 localStorage 并生效），
 * 不需要「保存」按钮；键位文本是例外 —— 它是多行草稿，用「应用」显式提交，
 * 这样编辑到一半不会把键盘搞坏。
 */

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_CONFIG, type VimcConfig } from './config.js';
import { DEFAULT_KEY_MAPPINGS, type KeyMappingParse } from './keys.js';
import { importVimiumConfig, type VimiumImportReport } from './vimium.js';
import type { VimcEngine, VimcProbe } from './engine.js';
import type { WindowLike } from './types.js';

const COLORS = {
  text: 'var(--dsw-alias-label-primary)',
  muted: 'var(--dsw-alias-label-secondary)',
  border: 'var(--dsw-alias-border-l1)',
  strongBorder: 'var(--dsw-alias-border-l2)',
  surface: 'var(--dsw-alias-bg-layer-1)',
  nested: 'var(--dsw-alias-bg-layer-2)',
  brand: 'var(--dsw-alias-brand-primary)',
  warn: 'var(--dsw-alias-state-warn-primary)',
  error: 'var(--dsw-alias-state-error-primary)',
  success: 'var(--dsw-alias-state-success-primary)',
} as const;

const PANEL: Record<string, string> = {
  display: 'flex',
  flexDirection: 'column',
  gap: '18px',
  padding: '4px 2px 24px',
  color: COLORS.text,
  fontSize: '13px',
  lineHeight: '1.6',
};

const SECTION: Record<string, string> = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '14px 16px',
  border: `1px solid ${COLORS.border}`,
  borderRadius: '10px',
  background: COLORS.surface,
};

const ROW: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
};

const FIELD: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const INPUT: Record<string, string> = {
  background: COLORS.nested,
  color: COLORS.text,
  border: `1px solid ${COLORS.strongBorder}`,
  borderRadius: '6px',
  padding: '4px 8px',
  fontSize: '12px',
  fontFamily: 'inherit',
};

const MONO: Record<string, string> = {
  ...INPUT,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: '12px',
  lineHeight: '1.5',
  width: '100%',
  resize: 'vertical',
};

const BUTTON: Record<string, string> = {
  background: COLORS.nested,
  color: COLORS.text,
  border: `1px solid ${COLORS.strongBorder}`,
  borderRadius: '6px',
  padding: '4px 10px',
  fontSize: '12px',
  cursor: 'pointer',
};

const HEADING: Record<string, string> = {
  margin: '0',
  fontSize: '13px',
  fontWeight: '600',
};

const HINT: Record<string, string> = {
  margin: '0',
  fontSize: '11.5px',
  color: COLORS.muted,
};

const BADGE: Record<string, string> = {
  ...HINT,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  background: COLORS.nested,
  border: `1px solid ${COLORS.border}`,
  borderRadius: '999px',
  padding: '1px 8px',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={SECTION}>
      <h3 style={HEADING}>{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label style={{ ...FIELD, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span>{label}</span>
    </label>
  );
}

function NumberField({
  label, value, min, max, step, onChange, suffix,
}: {
  label: string; value: number; min: number; max: number; step: number; onChange: (next: number) => void; suffix?: string;
}) {
  return (
    <label style={FIELD}>
      <span style={{ color: COLORS.muted }}>{label}</span>
      <input
        type="number"
        style={{ ...INPUT, width: '86px' }}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      {suffix === undefined ? null : <span style={{ color: COLORS.muted }}>{suffix}</span>}
    </label>
  );
}

function KeyTable({ parse }: { parse: KeyMappingParse }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={ROW}>
        <span style={HINT}>
          生效键位 <b>{parse.bindings.length}</b> 个
          {parse.unmapAll ? '（含 unmapAll：内置默认已清空）' : '（内置默认 + 你的覆盖）'}
        </span>
        {parse.errors.length > 0 ? <span style={{ ...HINT, color: COLORS.error }}>语法问题 {parse.errors.length} 行</span> : null}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {parse.bindings.map((binding, index) => (
          <span key={`${binding.label}-${binding.command}-${String(index)}`} style={BADGE}>
            {binding.label} → {binding.command}
          </span>
        ))}
      </div>
      {parse.errors.length > 0 ? (
        <details>
          <summary style={{ ...HINT, cursor: 'pointer' }}>语法问题明细</summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '11.5px', color: COLORS.error }}>
            {parse.errors.map((error, index) => (
              <li key={`${error.text}-${String(index)}`}>{error.message}：<code>{error.text}</code></li>
            ))}
          </ul>
        </details>
      ) : null}
      {parse.unsupported.length > 0 ? (
        <details>
          <summary style={{ ...HINT, cursor: 'pointer' }}>
            Vimium 命令本插件不接管 <b>{parse.unsupported.length}</b> 个（点开看原因）
          </summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '11.5px', color: COLORS.muted }}>
            {parse.unsupported.map((item) => (
              <li key={item.command}>
                <code>{item.command}</code> — {item.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function ProbeView({ probe }: { probe: VimcProbe }) {
  const rows: [string, string][] = [
    ['竖向滚动容器', probe.vertical.target === null ? '未找到' : `${probe.vertical.target}（可滚 ${String(probe.vertical.range)}px）`],
    ['横向滚动容器', probe.horizontal.target === null ? '当前无（宽代码块/表格时才出现）' : `${probe.horizontal.target}（可滚 ${String(probe.horizontal.range)}px）`],
    ['输入框', probe.input.target === null ? '未找到' : `${probe.input.target}（来源 ${String(probe.input.via)}）`],
    ['已加载轮次', `${String(probe.turns.count)} 条（[ / ] 跳转用）`],
    ['可点击元素', probe.hints.candidates === null
      ? '未扫描（挂载自检跳过；点「运行只读自检」会扫）'
      : `${String(probe.hints.candidates)} 个（选择器命中 ${String(probe.hints.matched ?? '?')}${probe.hints.tiers === null ? '' : `；内联引用 ${String(probe.hints.tiers.references)} / 正文其它 ${String(probe.hints.tiers.content)} / 外部 ${String(probe.hints.tiers.outer)}`}）${probe.hints.sample.length === 0 ? '' : `：${probe.hints.sample.join(', ')}`}`],
    ['提示字母表', probe.hints.characters],
    ['候选扫描耗时', probe.hints.candidates === null ? '—' : `${String(probe.hints.scanMs)} ms（累计 ${String(probe.hints.sessions)} 次提示）`],
    ['页面内查找', probe.find.matches === 0
      ? `无命中（${probe.find.active ? '查找条开着' : '查找条关着'}${probe.find.regex ? ' · 正则' : ''} · 高亮 ${probe.find.highlight === 'custom' ? 'Custom Highlight' : '仅落点标记'}）`
      : `${String(probe.find.current)}/${String(probe.find.matches)} 命中 · 查找耗时 ${String(probe.find.scanMs)} ms${probe.find.regex ? ' · 正则' : ''} · 高亮 ${probe.find.highlight === 'custom' ? 'Custom Highlight' : '仅落点标记'}`],
    ['按键处理耗时', `${String(probe.perf.keyAvgMs)} ms 平均 / ${String(probe.perf.keyMaxMs)} ms 峰值（${String(probe.perf.keySamples)} 次采样）`],
    ['排除规则命中', probe.excluded ? '是（本页已停用）' : '否'],
  ];
  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: '11.5px' }}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: 'contents' }}>
          <dt style={{ color: COLORS.muted }}>{label}</dt>
          <dd style={{ margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface VimcSettingsPanelProps {
  /** 宿主注入：关闭设置面板。 */
  close?: () => void;
}

/**
 * 造出设置面板组件。
 *
 * @param win 页面 window（读文件、触发提示、诊断都用它）。
 * @param engine 键盘引擎。
 */
export function createVimcSettingsPanel(win: WindowLike, engine: VimcEngine) {
  return function VimcSettingsPanel(_props: VimcSettingsPanelProps) {
    const [config, setConfig] = useState<VimcConfig>(() => engine.config());
    const [draft, setDraft] = useState<string>(() => engine.config().keyMappings || DEFAULT_KEY_MAPPINGS);
    const [probe, setProbe] = useState<VimcProbe | null>(null);
    const [report, setReport] = useState<VimiumImportReport | null>(null);
    const [notice, setNotice] = useState<string>('');
    const fileInput = useRef<HTMLInputElement | null>(null);

    const apply = useCallback((patch: Partial<VimcConfig>) => {
      setConfig(engine.update(patch));
    }, []);

    const refreshProbe = useCallback(() => {
      try {
        setProbe(engine.probe());
      } catch (error) {
        setNotice(`自检失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }, []);

    const importJson = useCallback((raw: unknown) => {
      try {
        const result = importVimiumConfig(raw, { prefer: engine.config().prefer });
        const next = engine.update(result.patch as Partial<VimcConfig>);
        setConfig(next);
        setDraft(next.keyMappings || DEFAULT_KEY_MAPPINGS);
        setReport(result.report);
        setNotice(`已导入：采纳 ${String(result.report.adopted.length)} 项，未采纳 ${String(result.report.ignored.length)} 项`);
      } catch (error) {
        setNotice(`导入失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }, []);

    const onPickFile = useCallback(async (file: File | undefined) => {
      if (file === undefined) return;
      try {
        importJson(JSON.parse(await file.text()) as unknown);
      } catch (error) {
        setNotice(`读取失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }, [importJson]);

    const parse = engine.bindings();

    return (
      <div style={PANEL}>
        <div style={{ ...ROW, alignItems: 'baseline' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <h2 style={{ ...HEADING, fontSize: '15px' }}>Oblivion 键盘导航</h2>
            <span style={BADGE}>v{__OBLIVION_VIMC_VERSION__}</span>
          </div>
          <Toggle label="启用" checked={config.enabled} onChange={(enabled) => apply({ enabled })} />
        </div>
        <p style={HINT}>
          焦点在输入框里时本插件一个键都不接管；键位与选项按 <b>Vimium-C</b> 的语义实现，
          可直接导入 Vimium-C 的选项导出 JSON。
        </p>

        <Section title="键位（Vimium-C map / run 语法）">
          <textarea
            style={{ ...MONO, minHeight: '150px' }}
            spellCheck={false}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
          <div style={{ ...ROW, justifyContent: 'flex-start', gap: '8px' }}>
            <button type="button" style={BUTTON} onClick={() => { apply({ keyMappings: draft }); setNotice('键位已应用'); }}>
              应用键位
            </button>
            <button type="button" style={BUTTON} onClick={() => { setDraft(DEFAULT_KEY_MAPPINGS); apply({ keyMappings: DEFAULT_KEY_MAPPINGS }); setNotice('已恢复内置默认键位'); }}>
              恢复内置默认
            </button>
            <button type="button" style={BUTTON} onClick={() => setDraft(config.keyMappings || DEFAULT_KEY_MAPPINGS)}>
              撤销改动
            </button>
            <button type="button" style={BUTTON} onClick={() => { apply({ keyMappings: '' }); setDraft(DEFAULT_KEY_MAPPINGS); setNotice('已清空覆盖（跟随内置默认）'); }}>
              清空覆盖
            </button>
          </div>
          <KeyTable parse={parse} />
          <p style={HINT}>
            轮次跳转：内置默认 <code>[</code> = 上一条提问、<code>]</code> = 下一条提问（读到回答中间按一次回到本轮提问，
            已在提问顶部时再按一次继续往上）。它复用的是 DSH 自己的轮次锚点（<code>[data-chat-turn]</code>）。
          </p>
        </Section>

        <Section title="滚动">
          <div style={ROW}>
            <Toggle label="平滑滚动" checked={config.smooth} onChange={(smooth) => apply({ smooth })} />
            <NumberField label="竖向翻页比例" value={config.pageRatioVertical} min={0.1} max={2} step={0.05} onChange={(pageRatioVertical) => apply({ pageRatioVertical })} />
            <NumberField label="横向翻页比例" value={config.pageRatioHorizontal} min={0.1} max={2} step={0.05} onChange={(pageRatioHorizontal) => apply({ pageRatioHorizontal })} />
            <NumberField label="像素步长" value={config.scrollStepSize} min={1} max={2000} step={10} suffix="px" onChange={(scrollStepSize) => apply({ scrollStepSize })} />
          </div>
          <p style={HINT}>像素步长对应 Vimium-C 的 <code>scrollStepSize</code>：用于 <code>scrollUp/Down/Left/Right</code>、<code>scrollPx*</code>（含 Ctrl+方向键）。翻页比例是<b>本插件</b>的选项（Vimium-C 导出里没有）：默认 <b>0.6</b> —— 输入框占掉一部分可视高度，比例小一点翻页更稳。</p>
        </Section>

        <Section title="输入框（i / Esc）">
          <div style={ROW}>
            <Toggle label="Esc 退出输入框" checked={config.escapeToPage} onChange={(escapeToPage) => apply({ escapeToPage })} />
            <Toggle label="输入框里也允许翻页" checked={config.allowWhileEditing} onChange={(allowWhileEditing) => apply({ allowWhileEditing })} />
            <label style={FIELD}>
              <span style={{ color: COLORS.muted }}>聚焦后</span>
              <select
                style={INPUT}
                value={config.select}
                onChange={(event) => apply({ select: event.currentTarget.value as VimcConfig['select'] })}
              >
                <option value="all-line">选中光标所在行（Vimium 的 o.select=&quot;all-line&quot;）</option>
                <option value="all">全选</option>
                <option value="none">不动选区</option>
              </select>
            </label>
          </div>
          <label style={FIELD}>
            <span style={{ color: COLORS.muted }}>优先选择器</span>
            <input
              style={{ ...MONO, width: 'auto', flex: 1 }}
              value={config.prefer.join(', ')}
              onChange={(event) => apply({ prefer: event.currentTarget.value.split(',').map((item) => item.trim()).filter((item) => item !== '') })}
            />
          </label>
        </Section>

        <Section title="页面内查找（/ · . · ,）">
          <div style={{ ...ROW, justifyContent: 'flex-start', gap: '8px' }}>
            <Toggle label="按正则解释查询（regexFindMode）" checked={config.regexFindMode} onChange={(regexFindMode) => apply({ regexFindMode })} />
            <button type="button" style={BUTTON} onClick={() => { setNotice(engine.run('openFind') ? '查找框已打开：输入即搜，Enter 下一个、Shift+Enter 上一个、Esc 关闭' : '当前没有可搜索的会话正文'); }}>
              打开查找框
            </button>
          </div>
          <p style={HINT}>
            <code>/</code> 打开查找条（边打边找，显示 <code>(N 处)</code>）；<code>Enter</code> / <code>Shift+Enter</code>
            前后跳并**提交**（输入框收起、焦点回到页面）—— 于是紧接着就能用 <code>.</code> / <code>,</code> 继续前后跳；
            再按 <code>/</code> 回到编辑态并全选查询，<code>Esc</code> 关闭查找条（查询保留）。<br />
            大小写按 Vimium 的**智能大小写**（查询里含大写才区分大小写）；高亮用 CSS Custom Highlight API，
            <b>不改 DOM</b>。查找条本身是输入框，所以插件的其它快捷键在编辑态自动不生效。
          </p>
        </Section>

        <Section title="链接提示（f）">
          <div style={ROW}>
            <label style={FIELD}>
              <span style={{ color: COLORS.muted }}>字母表</span>
              <input
                style={{ ...INPUT, fontFamily: 'ui-monospace, monospace', width: '200px' }}
                value={config.linkHintCharacters}
                onChange={(event) => apply({ linkHintCharacters: event.currentTarget.value })}
              />
            </label>
            <button type="button" style={BUTTON} onClick={() => { setNotice(engine.startHints() ? '已进入提示模式：按字母触发' : '当前视口内没有可点击元素'); }}>
              立即显示提示
            </button>
          </div>
          <p style={HINT}>
            元素数量不超过字母表长度时每个元素 <b>1 个字母</b>；更多时**前面的候选优先用单字母**：
            正文里的内联引用/链接 → 正文里其它元素 → 外部按钮（首字母会预留，保证前缀不歧义）。
            <code>Esc</code> 或输入字母表之外的键取消。
          </p>
        </Section>

        <Section title="兼容：导入 Vimium-C 选项导出">
          <div style={{ ...ROW, justifyContent: 'flex-start', gap: '8px' }}>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(event) => { void onPickFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }}
            />
            <button type="button" style={BUTTON} onClick={() => fileInput.current?.click()}>
              选择 vimium_c-*.json
            </button>
            <span style={HINT}>或把 JSON 粘到下面</span>
          </div>
          <textarea
            style={{ ...MONO, minHeight: '64px' }}
            spellCheck={false}
            placeholder='{"keyMappings": ["map w scrollPageUp", …], "linkHintCharacters": "dsavewrqcxz", "scrollStepSize": 90, "keyLayout": 0}'
            onBlur={(event) => {
              const text = event.currentTarget.value.trim();
              if (text === '') return;
              try {
                importJson(JSON.parse(text) as unknown);
                event.currentTarget.value = '';
              } catch (error) {
                setNotice(`粘贴内容不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
              }
            }}
          />
          {report === null ? null : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={HINT}>
                来源：{report.source.name ?? '（未署名）'}
                {report.source.time === undefined ? '' : ` · ${report.source.time}`}
                {report.source.environment === undefined ? '' : ` · ${report.source.environment}`}
              </div>
              {report.adopted.length > 0 ? (
                <details open>
                  <summary style={{ ...HINT, cursor: 'pointer', color: COLORS.success }}>已采纳 {report.adopted.length} 项</summary>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '11.5px' }}>
                    {report.adopted.map((item) => (
                      <li key={item.key}><code>{item.key}</code> — {item.detail}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {report.ignored.length > 0 ? (
                <details>
                  <summary style={{ ...HINT, cursor: 'pointer', color: COLORS.warn }}>未采纳 {report.ignored.length} 项（点开看原因）</summary>
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '11.5px', color: COLORS.muted }}>
                    {report.ignored.map((item) => (
                      <li key={item.key}><code>{item.key}</code> — {item.reason}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          )}
        </Section>

        <Section title="排除规则与诊断">
          <label style={FIELD}>
            <span style={{ color: COLORS.muted }}>排除规则</span>
            <input
              style={{ ...MONO, width: 'auto', flex: 1 }}
              placeholder=":https://example.com/  ·  /regex/  ·  *glob*"
              value={config.exclusions.join(', ')}
              onChange={(event) => apply({ exclusions: event.currentTarget.value.split(',').map((item) => item.trim()).filter((item) => item !== '') })}
            />
          </label>
          <p style={HINT}>命中即整体停用（对应 Vimium-C 的 <code>exclusionRules.pattern</code>；只实现其模式语言的子集）。</p>
          <div style={{ ...ROW, justifyContent: 'flex-start', gap: '8px' }}>
            <Toggle label="诊断上报（写自证据文件）" checked={config.diagnostics} onChange={(diagnostics) => apply({ diagnostics })} />
            <button type="button" style={BUTTON} onClick={refreshProbe}>运行只读自检</button>
            <span style={HINT}>已处理 {engine.handledCount()} 个按键</span>
          </div>
          {probe === null ? null : <ProbeView probe={probe} />}
        </Section>

        {notice === '' ? null : <p style={{ ...HINT, color: COLORS.brand }}>{notice}</p>}
        <p style={HINT}>
          恢复出厂：把下面的默认值抄回各控件即可 —— 平滑滚动 {String(DEFAULT_CONFIG.smooth)}、
          像素步长 {String(DEFAULT_CONFIG.scrollStepSize)}px、竖向比例 {String(DEFAULT_CONFIG.pageRatioVertical)}。
        </p>
      </div>
    );
  };
}
