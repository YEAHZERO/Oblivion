/**
 * 有数（@oblivion/daily-life）· 侧栏一页（浏览器半边）。
 *
 * ## 版面纪律
 *
 *   - 顶部 **KPI 只有 3 个数字**（账面投入 / 日耗合计 / 闲置损耗），其余统计下沉到列表；
 *   - **没有任何图表**（规格里的「本版不做」）：服役进度是纯 CSS 进度条，不是 SVG 图；
 *   - 每个数字都来自 Node 半边的指标层，这里不自己算账（前端只做「显示」与「归一表单」）；
 *   - 空态、错误态、坏账本（`loadError`）都要说话 —— 不静默显示成空列表。
 *
 * ## 交互
 *
 *   新增 / 编辑（同一张表单）、用过一次、卖出（现价 + 日期）、删除。
 *   所有写动作都走后端校验，前端只把空串归一成 `null`（`draftToItem`）。
 */

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import {
  defaultDraft,
  draftToItem,
  fetchState,
  sendAction,
  type ActionRequest,
  type DailyLifeState,
} from './api.js';
import {
  CATEGORY_SEED,
  countLine,
  kpiRow,
  metaText,
  money,
  moneyPerDay,
  percentText,
  progressText,
  statusLabel,
  statusTone,
  useHintText,
} from './format.js';

export interface DailyLifePanelProps {
  /** better-sidebar 会给每个 tab 传 `visible`；不可见时省掉渲染。 */
  visible?: boolean;
}

const TONE_COLOR: Record<string, string> = {
  good: '#2fbf71',
  warn: '#e2a03f',
  muted: '#8a8f98',
};

/** 今天（本地时区）的 `YYYY-MM-DD`。 */
function todayIso(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
}

const box: CSSProperties = {
  padding: '8px 10px',
  font: '13px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif',
  color: 'inherit',
};

export function DailyLifePanel(props: DailyLifePanelProps): unknown {
  const [state, setState] = useState<DailyLifeState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => defaultDraft(todayIso()));
  const [sellId, setSellId] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState('');

  const reload = useCallback(async (): Promise<void> => {
    const result = await fetchState();
    if (result.ok) {
      setState(result.state);
      setError(result.state.loadError);
    } else {
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (request: ActionRequest): Promise<void> => {
      setBusy(true);
      try {
        const result = await sendAction(request);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError(null);
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );

  if (props.visible === false) return null;

  const startAdd = (): void => {
    setEditingId(null);
    setDraft(defaultDraft(todayIso()));
    setShowForm(true);
  };

  const startEdit = (row: DailyLifeState['items'][number]): void => {
    setEditingId(row.id);
    setDraft({
      name: row.name,
      buyPrice: String(row.buyPrice),
      buyDate: row.buyDate,
      category: row.category ?? '',
      serviceDaysTarget: row.serviceDaysTarget === null ? '' : String(row.serviceDaysTarget),
      note: row.note ?? '',
    });
    setShowForm(true);
  };

  const submitForm = async (): Promise<void> => {
    const item = draftToItem(draft);
    if (editingId === null) await run({ action: 'add', item });
    else await run({ action: 'update', id: editingId, item });
    setShowForm(false);
    setEditingId(null);
  };

  const submitSell = async (id: string): Promise<void> => {
    const price = sellPrice.trim() === '' ? null : Number(sellPrice);
    if (price === null || !Number.isFinite(price)) {
      setError('卖出要填一个数字金额');
      return;
    }
    await run({ action: 'sell', id, item: { soldPrice: price, soldDate: todayIso() } });
    setSellId(null);
    setSellPrice('');
  };

  const stats = state?.stats ?? null;

  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>有数</strong>
        <span style={{ opacity: 0.55 }}>{state === null ? '读取中…' : 'v' + state.version}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => void reload()} disabled={busy} style={linkButton}>
          刷新
        </button>
        <button type="button" onClick={startAdd} style={linkButton}>
          新增
        </button>
      </div>

      {error !== null && (
        <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 6, background: 'rgba(226,160,63,0.15)', color: TONE_COLOR.warn }}>
          {error}
        </div>
      )}

      {stats !== null && (
        <>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            {kpiRow(stats).map((cell) => (
              <div key={cell.label} style={{ flex: 1, minWidth: 0 }} title={cell.hint}>
                <div style={{ opacity: 0.6, fontSize: 11 }}>{cell.label}</div>
                <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap' }}>{cell.value}</div>
              </div>
            ))}
          </div>
          <div style={{ opacity: 0.6, fontSize: 11, marginTop: 6 }}>{countLine(stats)}</div>
        </>
      )}

      {showForm && (
        <div style={{ marginTop: 8, padding: 8, border: '1px solid rgba(128,128,128,0.28)', borderRadius: 6 }}>
          <Field label="名称" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} placeholder="例如 iPad Air" />
          <Field label="买入价" value={draft.buyPrice} onChange={(value) => setDraft({ ...draft, buyPrice: value })} placeholder="4399" />
          <Field label="买入日" value={draft.buyDate} onChange={(value) => setDraft({ ...draft, buyDate: value })} placeholder="2024-03-01" />
          <Field
            label="目标服役天数"
            value={draft.serviceDaysTarget}
            onChange={(value) => setDraft({ ...draft, serviceDaysTarget: value })}
            placeholder="留空按 1095 天（3 年）"
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span style={{ width: 76, opacity: 0.6, fontSize: 11 }}>分类</span>
            <select
              value={draft.category}
              onChange={(event) => setDraft({ ...draft, category: event.target.value })}
              style={{ flex: 1, background: 'transparent', color: 'inherit', border: '1px solid rgba(128,128,128,0.3)', borderRadius: 4, padding: '2px 4px' }}
            >
              <option value="">未分类</option>
              {CATEGORY_SEED.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <Field label="备注" value={draft.note} onChange={(value) => setDraft({ ...draft, note: value })} placeholder="可留空" />
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button type="button" style={solidButton} disabled={busy || draft.name.trim() === ''} onClick={() => void submitForm()}>
              {editingId === null ? '记一笔' : '保存修改'}
            </button>
            <button
              type="button"
              style={linkButton}
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 8 }}>
        {state !== null && state.items.length === 0 && (
          <div style={{ opacity: 0.6, padding: '10px 0' }}>
            账本还是空的。点「新增」记下第一件东西 —— 有数会从买入价和已用天数算出它的真实日均成本。
          </div>
        )}
        {state?.items.map((row) => {
          const tone = statusTone(row.derived.status);
          return (
            <div key={row.id} style={{ padding: '7px 0', borderTop: '1px solid rgba(128,128,128,0.18)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                <span style={{ color: TONE_COLOR[tone], fontSize: 11 }}>{statusLabel(row.derived.status)}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontWeight: 600 }}>{moneyPerDay(row.derived.dailyCost)}</span>
              </div>
              <div style={{ opacity: 0.65, fontSize: 11, marginTop: 2 }}>{metaText(row)}</div>
              <div style={{ opacity: 0.65, fontSize: 11 }}>
                {progressText(row)} · {useHintText(row)}
              </div>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(128,128,128,0.22)', marginTop: 4 }}>
                <div
                  style={{
                    height: 4,
                    borderRadius: 2,
                    width: percentText(row.derived.usageProgress),
                    background: TONE_COLOR[tone],
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {row.derived.status !== 'sold' && (
                  <>
                    <button type="button" style={linkButton} disabled={busy} onClick={() => void run({ action: 'use', id: row.id })}>
                      用过一次
                    </button>
                    {sellId === row.id ? (
                      <>
                        <input
                          value={sellPrice}
                          onChange={(event) => setSellPrice(event.target.value)}
                          placeholder="卖出价"
                          style={{ width: 90, background: 'transparent', color: 'inherit', border: '1px solid rgba(128,128,128,0.3)', borderRadius: 4, padding: '1px 4px' }}
                        />
                        <button type="button" style={linkButton} disabled={busy} onClick={() => void submitSell(row.id)}>
                          确认卖出
                        </button>
                        <button type="button" style={linkButton} onClick={() => setSellId(null)}>
                          取消
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        style={linkButton}
                        onClick={() => {
                          setSellId(row.id);
                          setSellPrice('');
                        }}
                      >
                        卖出
                      </button>
                    )}
                  </>
                )}
                <button type="button" style={linkButton} onClick={() => startEdit(row)}>
                  编辑
                </button>
                <button type="button" style={linkButton} disabled={busy} onClick={() => void run({ action: 'remove', id: row.id })}>
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {state !== null && state.skipped > 0 && (
        <div style={{ opacity: 0.6, fontSize: 11, marginTop: 6 }}>
          账本里有 {state.skipped} 条记录形状不对，已被跳过（文件：{state.dataFile}）
        </div>
      )}
      {state !== null && stats !== null && stats.soldCount > 0 && (
        <div style={{ opacity: 0.6, fontSize: 11, marginTop: 6 }}>
          已卖出 {stats.soldCount} 件，回收 {money(stats.soldValue)}，整体保值 {percentText(stats.retentionRate)}
        </div>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  placeholder?: string;
  onChange(value: string): void;
}

function Field(props: FieldProps): ReactNode {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
      <span style={{ width: 76, opacity: 0.6, fontSize: 11 }}>{props.label}</span>
      <input
        value={props.value}
        placeholder={props.placeholder}
        onChange={(event) => props.onChange(event.target.value)}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          color: 'inherit',
          border: '1px solid rgba(128,128,128,0.3)',
          borderRadius: 4,
          padding: '2px 4px',
          font: 'inherit',
        }}
      />
    </div>
  );
}

const linkButton: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'inherit',
  opacity: 0.75,
  cursor: 'pointer',
  padding: 0,
  font: 'inherit',
};

const solidButton: CSSProperties = {
  background: 'rgba(47,191,113,0.18)',
  border: '1px solid rgba(47,191,113,0.5)',
  color: 'inherit',
  borderRadius: 4,
  cursor: 'pointer',
  padding: '2px 10px',
  font: 'inherit',
};
