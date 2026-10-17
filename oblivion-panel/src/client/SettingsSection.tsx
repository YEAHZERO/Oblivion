/**
 * 设置分节：**Oblivion 知识库**（`settings.section`，入口「设置 → Oblivion 知识库」）。
 *
 * 这一页只做三件事，别的一律不碰：
 *   ① 知识库路径（`mdRoot`）；
 *   ② 自动整理的开关与节奏（`organize.*`）；
 *   ③ 模型选择与自动切换（`organize.provider` / `model` / `fallbacks`，候选来自宿主注册表）。
 *
 * ## 数据与写入都走 core 的路由
 *
 * 读 `GET /oblivion-core/settings`、写 `POST` 同一条（`settings-model.ts` 里已解释为什么
 * 必须这样：面板是只读数据面，跨插件取不到 Cordis 服务，而写语义只该有一份）。
 * 本文件里**没有**任何写文件的代码，也**不经手密钥** —— 只报 provider / model。
 *
 * ## 三条如实显示（都是被真实 bug 推出来的）
 *
 *   · **来源**：每个值旁边标「设置页 / 插件配置 / 默认值」。没有它，「我改了怎么没生效」
 *     只能在三层配置之间猜；有了它一眼看出是不是被 profile 压着。
 *   · **待重启**：core 在 `apply()` 那一刻就把配置固化进各子模块了 ⇒ 写下去的值
 *     要**重启 DSH** 才生效。所以「设置页要的值」与「正在跑的值」必须分开显示
 *     （设计稿 §10-A 的验收口径就是「重启后读到的是新值」）。
 *   · **清单外的值**：provider / model 不在宿主注册表里时，选项里补一条
 *     「（不在宿主清单里）」而不是让 `<select>` 静默跳到第一项 —— 那会让用户
 *     一保存就把配置改掉，而他根本没点那个值（`withCurrent()`）。
 */

import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { postDiag } from './diag.js';
import { RestartControl } from './RestartControl.js';
import {
  SETTINGS_ROUTE,
  SETTINGS_SECTION_ID,
  SETTINGS_SECTION_LABEL,
  SETTINGS_SECTION_ORDER,
  buildPatch,
  catalogSummary,
  describeSaveResult,
  draftCount,
  editField,
  fallbacksOf,
  fieldsOf,
  GROUPS,
  isCompleteRoute,
  loadSettings,
  modelOptions,
  numberText,
  parseNumberText,
  pendingSentence,
  postSettings,
  providerOptions,
  resetField,
  resolveField,
  routeProblem,
  configSourceLabel,
  withCurrent,
  writableNote,
  type ConfigSource,
  type FieldSpec,
  type FormState,
  type RouteEntry,
  type SettingsPayload,
} from './settings-model.js';

type Load =
  | { status: 'loading' }
  | { status: 'ready'; payload: SettingsPayload }
  | { status: 'error'; error: string };

interface Notice {
  kind: 'ok' | 'warn' | 'error';
  text: string;
}

/**
 * 配色与 brand 的设置面板**同源**（出处是 `oblivion-brand/src/client/theme.ts`）：
 * 三个 Oblivion 插件的设置分节在设置里挨着排（45 / 46 / 47），长得不一样会很刺眼。
 * 颜色一律走 DSH 主题变量并带后备值 —— 宿主换主题时跟着变，取不到变量也不至于透明。
 */
const LABEL = 'var(--dsw-alias-label-primary, currentColor)';
const MUTED = 'var(--dsw-alias-label-tertiary, #8b93a1)';
const BORDER = 'var(--dsw-alias-border-l2, #e5e7eb)';
const ACCENT = 'var(--dsw-alias-brand-primary, #4f6ef7)';
const DANGER = 'var(--dsw-alias-label-error, #d93025)';
const INPUT_BG = 'var(--dsw-alias-bg-layer-2, transparent)';
const WARN = '#d08700';
const OK = '#2e9e5b';

const S = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    // 内边距与限宽长在面板自己身上（外层容器是通用的，在那儿加约束会挤到别人的面板）。
    padding: '16px 20px 48px',
    maxWidth: 620,
    width: '100%',
    boxSizing: 'border-box',
    fontSize: 13,
    lineHeight: 1.7,
    color: LABEL,
  } as const,
  card: {
    border: '1px solid ' + BORDER,
    borderRadius: 8,
    padding: '12px 14px',
  } as const,
  title: { margin: '0 0 4px', fontSize: 16, fontWeight: 500, color: LABEL } as const,
  heading: { margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: LABEL } as const,
  hint: { margin: '6px 0 0', fontSize: 11, lineHeight: 1.6, color: MUTED } as const,
  warnText: { margin: '6px 0 0', fontSize: 11, color: WARN } as const,
  errorText: { margin: '6px 0 0', fontSize: 11, color: DANGER } as const,
  okText: { margin: '6px 0 0', fontSize: 11, color: OK } as const,
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 11, color: MUTED } as const,
  field: { padding: '8px 0', borderTop: '1px solid ' + BORDER } as const,
  fieldHead: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' } as const,
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } as const,
  badge: {
    border: '1px solid ' + BORDER,
    borderRadius: 999,
    padding: '0 6px',
    fontSize: 10,
    color: MUTED,
  } as const,
  badgeWarn: {
    border: '1px solid ' + WARN,
    borderRadius: 999,
    padding: '0 6px',
    fontSize: 10,
    color: WARN,
  } as const,
  input: {
    font: 'inherit',
    fontSize: 12,
    padding: '5px 8px',
    borderRadius: 6,
    border: '1px solid ' + BORDER,
    background: INPUT_BG,
    color: 'inherit',
    minWidth: 260,
  } as const,
  select: {
    font: 'inherit',
    fontSize: 12,
    padding: '5px 8px',
    borderRadius: 6,
    border: '1px solid ' + BORDER,
    background: INPUT_BG,
    color: 'inherit',
    maxWidth: 280,
  } as const,
  number: {
    font: 'inherit',
    fontSize: 12,
    padding: '5px 8px',
    borderRadius: 6,
    border: '1px solid ' + BORDER,
    background: INPUT_BG,
    color: 'inherit',
    width: 92,
  } as const,
  btn: {
    border: '1px solid ' + BORDER,
    borderRadius: 5,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    padding: '3px 8px',
    fontSize: 11,
  } as const,
  tiny: {
    border: 'none',
    background: 'transparent',
    color: MUTED,
    cursor: 'pointer',
    padding: '0 4px',
    fontSize: 11,
  } as const,
} as const;

function Badge({ source }: { source: ConfigSource }): JSX.Element {
  return (
    <span style={S.badge} title={'这个值最终由谁定：' + configSourceLabel(source)}>
      {configSourceLabel(source)}
    </span>
  );
}

/** 提示条：`kind` 决定颜色与默认文案位。 */
function NoticeLine({ notice }: { notice: Notice }): JSX.Element {
  const style = notice.kind === 'error' ? S.errorText : notice.kind === 'warn' ? S.warnText : S.okText;
  return <p style={style}>{notice.text}</p>;
}

export function OblivionSettingsSection(): JSX.Element {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  /** 只装**被碰过的**格子（值三态见 settings-model 的 `FormValue`）。 */
  const [form, setForm] = useState<FormState>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    const outcome = await loadSettings();
    if (outcome.ok) {
      setLoad({ status: 'ready', payload: outcome.payload });
      setForm({});
      // 这一条是「**设置分节真的挂上了**」的现场证据：只有设置外壳把这个座位渲染出来，
      // 这个组件才会挂载、才会发它。落盘是覆盖式的（见 diag.ts），所以终态里就是它。
      const catalog = outcome.payload.catalog ?? null;
      postDiag({
        at: Date.now(),
        where: 'settings-section',
        id: SETTINGS_SECTION_ID,
        order: SETTINGS_SECTION_ORDER,
        route: SETTINGS_ROUTE,
        version: outcome.payload.version ?? null,
        providers: (catalog?.providers ?? []).map((provider) => provider.id),
        llmAvailable: catalog?.llmAvailable ?? null,
        routeSource: catalog?.routeSource ?? null,
        routes: catalog?.routes ?? [],
        pending: outcome.payload.pending ?? [],
        writable: (outcome.payload.writable ?? []).length,
        values: Object.keys(outcome.payload.values ?? {}),
      });
    } else {
      setLoad({ status: 'error', error: outcome.error });
      postDiag({
        at: Date.now(),
        where: 'settings-section',
        id: SETTINGS_SECTION_ID,
        order: SETTINGS_SECTION_ORDER,
        route: SETTINGS_ROUTE,
        error: outcome.error,
        status: outcome.status ?? null,
      });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(async (): Promise<void> => {
    const payload = load.status === 'ready' ? load.payload : null;
    if (payload === null) return;
    const { patch, keys } = buildPatch(form);
    if (keys.length === 0) {
      setNotice({ kind: 'warn', text: '没有改动。' });
      return;
    }
    setBusy(true);
    setNotice(null);
    const outcome = await postSettings(patch);
    setBusy(false);
    if (!outcome.ok) {
      setNotice({ kind: 'error', text: outcome.error });
      return;
    }
    // POST 的回包就是**刷新后的整份快照**（core 顺手把 catalog 也重算了一遍），不必再 GET。
    setForm({});
    setLoad({ status: 'ready', payload: outcome.result });
    setNotice(describeSaveResult(outcome.result));
  }, [form, load]);

  if (load.status === 'loading') {
    return (
      <div style={S.root}>
        <div style={S.card}>读取中…（{SETTINGS_ROUTE}）</div>
      </div>
    );
  }

  if (load.status === 'error') {
    return (
      <div style={S.root}>
        <h2 style={S.title}>{SETTINGS_SECTION_LABEL}</h2>
        <div style={S.card}>
          <div>读不到设置：{load.error}</div>
          <p style={S.hint}>
            这条通路由 <code>@oblivion/core</code> 提供（{SETTINGS_ROUTE}）。若刚更新过插件，{' '}
            <strong>完全重启 DSH</strong> 之后再看 —— Node 半边的改动不会热加载。
          </p>
          <button type="button" style={S.btn} onClick={() => void reload()}>
            重试
          </button>
        </div>
      </div>
    );
  }

  const payload = load.payload;
  const catalog = payload.catalog ?? null;
  const summary = catalogSummary(catalog);
  const pending = payload.pending ?? [];
  const dirty = draftCount(form);
  const catalogMissing = catalog === null || catalog.providers.length === 0;
  const catalogNoLlm = catalog !== null && !catalog.llmAvailable;
  const catalogNoModels = catalog !== null && catalog.llmAvailable && catalog.providers.length > 0 && catalog.providers.every((provider) => provider.models.length === 0);

  /** 这一格**显示**什么值：表单里碰过就用表单的，否则用「设置层 or 正在跑的那份」。 */
  const display = (key: string): unknown => {
    const draft = form[key];
    if (draft === undefined || draft === null) return resolveField(payload, key).value;
    return draft;
  };
  const primaryProvider = String(display('organize.provider') ?? '');

  /** 一行字段的骨架：标签 + 来源徽标 +（保存时）待重启徽标。 */
  function fieldShell(field: FieldSpec, control: JSX.Element): JSX.Element {
    const resolved = resolveField(payload, field.key);
    const isDirty = form[field.key] !== undefined;
    const willReset = form[field.key] === null;
    const waitingRestart = pending.includes(field.key);
    return (
      <div key={field.key} style={S.field}>
        <div style={S.fieldHead}>
          <span style={{ fontSize: 12 }}>{field.label}</span>
          <Badge source={resolved.source} />
          {waitingRestart ? (
            <span style={S.badgeWarn} title="设置层已经写了这个值，但正在跑的 core 还是旧值">
              待重启
            </span>
          ) : null}
          {isDirty ? (
            <span style={S.badgeWarn} title={willReset ? '保存后会从设置层删掉这一键，回到下层配置' : '有未保存的改动'}>
              {willReset ? '将恢复默认' : '已改'}
            </span>
          ) : null}
        </div>
        <div style={{ ...S.row, marginTop: 4 }}>
          {control}
          {resolved.fromSettings || isDirty ? (
            <button
              type="button"
              style={S.tiny}
              title="从设置层删掉这一键（回到 profile / 默认值）"
              onClick={() => setForm(resetField(form, payload, field.key))}
            >
              恢复默认
            </button>
          ) : null}
        </div>
        {field.hint !== undefined ? <p style={S.hint}>{field.hint}</p> : null}
      </div>
    );
  }

  function controlOf(field: FieldSpec): JSX.Element {
    if (field.kind === 'bool') {
      const checked = display(field.key) === true;
      return (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setForm(editField(form, payload, field.key, event.target.checked))}
          />
          <span style={{ fontSize: 12, opacity: 0.8 }}>{checked ? '开' : '关'}</span>
        </label>
      );
    }

    if (field.kind === 'number') {
      const scale = field.scale ?? 1;
      const text = numberText(display(field.key), scale);
      return (
        <>
          <input
            type="number"
            style={S.number}
            value={text}
            step={field.step ?? 1}
            min={field.min}
            onChange={(event) => {
              const parsed = parseNumberText(event.target.value);
              // 没读懂（`abc`）就不动这一格 —— 把 `abc` 当 0 写下去才是最坏的结果。
              if (parsed === undefined) return;
              if (parsed === null) setForm(resetField(form, payload, field.key));
              else setForm(editField(form, payload, field.key, parsed * scale));
            }}
          />
          {field.unit !== undefined ? <span style={S.mono}>{field.unit}</span> : null}
        </>
      );
    }

    if (field.kind === 'select') {
      const isModel = field.key === 'organize.model';
      const current = String(display(field.key) ?? '');
      const options = isModel
        ? withCurrent(modelOptions(catalog, primaryProvider), current)
        : withCurrent(providerOptions(catalog), current);
      const problem = isModel
        ? routeProblem(catalog, primaryProvider, current)
        : routeProblem(catalog, current, String(display('organize.model') ?? ''));
      return (
        <>
          <select
            style={{ ...S.select, minWidth: isModel ? 220 : 200 }}
            value={current}
            onChange={(event) => setForm(editField(form, payload, field.key, event.target.value))}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {problem !== null ? <span style={S.warnText}>{problem}</span> : null}
        </>
      );
    }

    if (field.kind === 'routes') {
      return <RoutesEditor />;
    }

    // text（现在只有 mdRoot）
    const text = display(field.key) === undefined || display(field.key) === null ? '' : String(display(field.key));
    return (
      <input
        type="text"
        style={S.input}
        value={text}
        placeholder="~/OblivionKB"
        onChange={(event) => {
          // 清空 = 恢复默认（与那一格右上角的按钮同一个意思），免得写一个空路径进配置。
          if (event.target.value === '') setForm(resetField(form, payload, field.key));
          else setForm(editField(form, payload, field.key, event.target.value));
        }}
      />
    );
  }

  /** 备用路编辑器：每行 provider + model，可上移 / 下移 / 删除。 */
  function RoutesEditor(): JSX.Element {
    const draft = form['organize.fallbacks'];
    const rows: RouteEntry[] = Array.isArray(draft) ? draft : fallbacksOf(payload);
    const key = 'organize.fallbacks';
    const setRows = (next: RouteEntry[]): void => {
      setForm(editField(form, payload, key, next));
    };
    const move = (from: number, to: number): void => {
      if (to < 0 || to >= rows.length) return;
      const next = [...rows];
      const [item] = next.splice(from, 1);
      if (item === undefined) return;
      next.splice(to, 0, item);
      setRows(next);
    };
    return (
      <>
        {rows.length === 0 ? <span style={S.mono}>还没有备用路（主路失败就直接报错）。</span> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
          {rows.map((row, index) => (
            <div key={index} style={S.row}>
              <span style={S.mono}>{index + 1}.</span>
              <select
                style={S.select}
                value={row.provider}
                onChange={(event) => {
                  const next = [...rows];
                  next[index] = { ...row, provider: event.target.value };
                  setRows(next);
                }}
              >
                {withCurrent(providerOptions(catalog), row.provider).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                style={S.select}
                value={row.model}
                onChange={(event) => {
                  const next = [...rows];
                  next[index] = { ...row, model: event.target.value };
                  setRows(next);
                }}
              >
                {withCurrent(modelOptions(catalog, row.provider), row.model).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {!isCompleteRoute(row) ? <span style={S.mono}>（没配全，会被 core 丢掉）</span> : null}
              <button type="button" style={S.tiny} onClick={() => move(index, index - 1)} title="上移">
                ↑
              </button>
              <button type="button" style={S.tiny} onClick={() => move(index, index + 1)} title="下移">
                ↓
              </button>
              <button
                type="button"
                style={S.tiny}
                onClick={() => setRows(rows.filter((_, at) => at !== index))}
                title="删除这一条"
              >
                删
              </button>
            </div>
          ))}
          <button type="button" style={{ ...S.btn, alignSelf: 'flex-start' }} onClick={() => setRows([...rows, { provider: '', model: '' }])}>
            添加备用路
          </button>
        </div>
      </>
    );
  }

  const pendingText = pendingSentence(pending);
  const note = writableNote(payload.writable);

  return (
    <div data-obl-settings="" style={S.root}>
      <div>
        <h2 style={S.title}>{SETTINGS_SECTION_LABEL}</h2>
        <p style={S.hint}>
          路径、自动整理与模型选择。写入 <code>{payload.path ?? '<dataRoot>/settings.json'}</code>
          （优先级：默认值 &lt; profile 的插件 config &lt; 这一页）。
        </p>
      </div>

      <div style={S.card}>
        <div style={S.row}>
          <span style={S.mono}>core v{payload.version ?? '?'}</span>
          <span style={S.mono}>{SETTINGS_ROUTE}</span>
        </div>
        <div style={{ ...S.row, marginTop: 4 }}>
          <span style={{ fontSize: 12 }}>打开自动整理会走：</span>
          <span style={{ ...S.mono, wordBreak: 'break-word' }}>{summary.routes}</span>
        </div>
        <p style={S.hint}>{summary.label}</p>
        {catalogNoLlm ? (
          <p style={S.warnText}>
            宿主没有 <code>llm</code> 服务：下拉框为空，自动整理会直接跳过。provider 要在 profile 的
            <code> llm-pi-ai </code>配置里登记（本页不碰密钥，也不填地址）。
          </p>
        ) : null}
        {catalogMissing && !catalogNoLlm ? <p style={S.warnText}>宿主没回 provider 清单 —— core 版本旧（清单是 0.2.16 起的），或注册表为空。</p> : null}
        {catalogNoModels ? <p style={S.warnText}>列到了 provider 但都没有模型 —— 检查 profile 里各 provider 的 models。</p> : null}
      </div>

      {GROUPS.map((group) => (
        <div key={group.id} style={S.card}>
          <h3 style={S.heading}>{group.title}</h3>
          <p style={S.hint}>{group.hint}</p>
          {fieldsOf(group.id).map((field) => fieldShell(field, controlOf(field)))}
        </div>
      ))}

      <div style={S.card}>
        <div style={S.row}>
          <button
            type="button"
            style={{
              ...S.btn,
              padding: '5px 12px',
              border: 'none',
              background: dirty > 0 ? ACCENT : 'transparent',
              color: dirty > 0 ? '#fff' : MUTED,
              cursor: dirty > 0 && !busy ? 'pointer' : 'not-allowed',
            }}
            disabled={dirty === 0 || busy}
            onClick={() => void save()}
          >
            {busy ? '保存中…' : '保存'}
          </button>
          <button type="button" style={S.btn} disabled={dirty === 0 || busy} onClick={() => { setForm({}); setNotice(null); }}>
            撤销改动
          </button>
          <span style={S.mono}>{dirty === 0 ? '没有未保存的改动' : '有 ' + dirty + ' 项未保存'}</span>
        </div>
        {notice !== null ? <NoticeLine notice={notice} /> : null}
        {note !== '' ? <p style={S.hint}>{note}</p> : null}
      </div>

      {pendingText !== null ? (
        <div style={{ ...S.card, border: '1px solid ' + WARN }}>
          <h3 style={S.heading}>要重启 DSH 才生效</h3>
          <p style={S.warnText}>{pendingText}</p>
          <p style={S.hint}>
            配置在 core 装载那一刻就固化进各子模块了，所以设置层写下的值要下一轮装载才生效。
            下面这个按钮就是那次重启（机制只有一份，复用 @oblivion/brand 的重启路由）。
          </p>
          <div style={{ ...S.row, marginTop: 6 }}>
            <RestartControl />
          </div>
        </div>
      ) : null}
    </div>
  );
}
