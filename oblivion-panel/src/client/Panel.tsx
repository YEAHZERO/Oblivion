/**
 * Oblivion 认知面板 —— 注册进 `dsh-better-sidebar` 的一个 tab。
 *
 * 数据来自本插件 Node 半边的只读路由 `GET /oblivion-panel/status`；
 * 那边读的是 `@oblivion/core` 落的 `status.json` / `decisions.jsonl` / `ts-*.json` / 笔记目录。
 *
 * 设计原则（与 core 的「先跑够几天再调参」一致）：
 *   - **空态要解释原因**，不是一句「暂无数据」：没装载 / 跑过但没判定 / 数据目录找不到，三件事分开说；
 *   - 建议区只在 core 给出 `hints` 时出现（样本不足时它刻意不开口，这里也照实显示「样本不足」）；
 *   - 只读：面板不写任何东西，唯一的动作是「刷新」与「打开笔记」；
 *   - 「打开笔记」由宿主半边包一层注入 `onOpenFile`（见 `index.ts` 的 `openNoteInSidebar`），
 *     点条目名 / 笔记名都会走同一条路，结果写进 `panel-client-diag.json` 供排查。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { RestartControl } from './RestartControl.js';
import type { DecisionStats } from '../snapshot.js';
import {
  actionLabel,
  hintLine,
  percent,
  reasonLabel,
  relativeTime,
  scoreText,
  statNumber,
  topBlocker,
  type HintLike,
} from './format.js';

/** 与 Node 半边 config.routePath 的默认值一致。 */
const STATUS_ROUTE = '/oblivion-panel/status';

/** 面板用到的 data 形状（Node 半边 `PanelSnapshot` 的浏览器侧视图）。 */
interface PanelData {
  panelVersion?: string;
  generatedAt?: number;
  dataRoot?: string;
  mdRoot?: string;
  core?: { version?: string; generatedAt?: number; hints?: HintLike[]; stats?: Record<string, unknown> } | null;
  /** Node 半边由留痕现算的统计（0.0.8 起）；老 host 不发时回落 `core.stats`。 */
  live?: DecisionStats;
  trace?: { path?: string; recent?: Array<Record<string, unknown>> };
  items?: Array<{ id?: string; topic?: string; title?: string; created_at?: number; status?: string }>;
  notes?: Array<{ name?: string; path?: string; mtimeMs?: number; bytes?: number }>;
  problems?: string[];
}

/** tab 组件 props：只声明我们真正用到的那几个（其余由 side bar 传入，忽略即可）。 */
export interface PanelTabProps {
  /** 面板是否可见（不可见时暂停轮询）。 */
  visible?: boolean;
  /** side bar 的「打开文件」能力（有则点笔记直接开）。 */
  onOpenFile?: (path: string) => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: PanelData }
  | { status: 'error'; error: string };

const S = {
  root: {
    padding: '10px 12px 24px',
    fontSize: 12,
    lineHeight: 1.7,
    color: 'inherit',
    overflow: 'auto',
    height: '100%',
    boxSizing: 'border-box',
  } as const,
  row: { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' } as const,
  h: { fontSize: 12, fontWeight: 600, margin: '14px 0 6px', opacity: 0.85 } as const,
  card: {
    border: '1px solid rgba(127,127,127,0.28)',
    borderRadius: 6,
    padding: '8px 10px',
    marginBottom: 6,
  } as const,
  kpi: { display: 'flex', gap: 14, flexWrap: 'wrap', margin: '6px 0 2px' } as const,
  kpiCell: { minWidth: 64 } as const,
  kpiLabel: { fontSize: 11, opacity: 0.6 } as const,
  kpiValue: { fontSize: 15, fontWeight: 600 } as const,
  mono: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 } as const,
  dim: { opacity: 0.65 } as const,
  btn: {
    border: '1px solid rgba(127,127,127,0.35)',
    borderRadius: 5,
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    padding: '2px 8px',
    fontSize: 11,
  } as const,
  list: { margin: 0, padding: 0, listStyle: 'none' } as const,
  li: { padding: '3px 0', borderTop: '1px solid rgba(127,127,127,0.16)' } as const,
};

function kpi(label: string, value: JSX.Element | string): JSX.Element {
  return (
    <div style={S.kpiCell}>
      <div style={S.kpiLabel}>{label}</div>
      <div style={S.kpiValue}>{value}</div>
    </div>
  );
}

/** 从标题/主题猜出这个条目对应的笔记文件（找不到就不给链接，绝不凭空造路径）。 */
function notePathForItem(item: { topic?: string; title?: string }, notes: PanelData['notes']): string | undefined {
  if (!notes || notes.length === 0) return undefined;
  const candidates = [item.topic, item.title]
    .map((value) => String(value ?? '').trim())
    .filter((value) => value !== '');
  for (const candidate of candidates) {
    const wanted = (candidate + '.md').toLowerCase();
    const hit = notes.find((note) => String(note.name ?? '').toLowerCase() === wanted);
    if (hit?.path) return hit.path;
  }
  return undefined;
}

/** 空态：把「为什么没有数据」说清楚。 */
function emptyReason(data: PanelData): string {
  if (!data.core) {
    return '读不到 @oblivion/core 的 status.json —— 检查 core 是否装载（它的只读快照在每次装载时刷新）。';
  }
  // 轮数优先看**现算**的留痕统计（status.json 只记到装载那一刻）。
  const turns = data.live ? data.live.turns : statNumber(data.core, 'turns');
  if (!turns) {
    return 'core 已装载（v' + String(data.core.version ?? '?') + '），但还没有走完的 turn/end —— 正常问一轮再看。';
  }
  return '有 ' + turns + ' 轮判定，但都还没沉淀：原因见下面的「最近判定」。';
}

export function OblivionPanel(props: PanelTabProps): JSX.Element {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
    try {
      const response = await fetch(STATUS_ROUTE, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = (await response.json()) as PanelData;
      setState({ status: 'ready', data });
    } catch (error) {
      setState({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  useEffect(() => {
    if (props.visible === false) return;
    void load();
  }, [load, props.visible]);

  const body = useMemo(() => {
    if (state.status === 'loading') return <div style={S.dim}>读取中…</div>;
    if (state.status === 'error') {
      return (
        <div style={S.card}>
          <div>读不到观测数据：{state.error}</div>
          <div style={S.dim}>
            若刚装载本插件，需要**重启一次 App**（Node 半边改动不会热加载）。路由：{STATUS_ROUTE}
          </div>
        </div>
      );
    }

    const data = state.data;
    const core = data.core ?? null;
    const hints = core?.hints ?? [];
    // 顶部统计用**现算**的 live（读 decisions.jsonl），不是 core 装载时的 status.json ——
    // 后者会停在重启那一刻（实测顶部「已沉淀 2」而下面列表有 4 条）。老 host 没有 live 时回落。
    const live = data.live ?? null;
    const turns = live ? live.turns : statNumber(core, 'turns');
    const evaluated = live ? live.evaluated : statNumber(core, 'evaluated');
    const captured = live ? live.captured : statNumber(core, 'captured');
    const captureRate = live ? live.captureRate : (core?.stats ?? {}).captureRate;
    // 有现算统计就用它；没有（老 host）才回落 core 装载快照里的 byReason。
    const blocker = topBlocker(live ? live.byReason : (core?.stats ?? {}).byReason);
    const recent = data.trace?.recent ?? [];
    const items = data.items ?? [];
    const notes = data.notes ?? [];

    return (
      <>
        <div style={S.row}>
          <div style={S.dim}>
            core {core ? 'v' + String(core.version ?? '?') : '未装载'} · 面板 v{String(data.panelVersion ?? '?')} ·
            刷新于 {relativeTime(data.generatedAt)}
          </div>
          <button type="button" style={S.btn} onClick={() => void load()}>
            刷新
          </button>
        </div>
        {/* 重启入口：复用 @oblivion/brand 的 /obl-brand/restart（机制只有一份） */}
        <div style={{ ...S.row, marginTop: 6 }}>
          <RestartControl />
        </div>

        <div style={S.kpi}>
          {kpi('捕获率', percent(captureRate))}
          {kpi('判定轮数', String(turns ?? '—'))}
          {kpi('已评估', String(evaluated ?? '—'))}
          {kpi('已沉淀', String(captured ?? '—'))}
        </div>

        <div style={{ ...S.dim, marginTop: 2 }}>
          {live
            ? '统计实时读自 ' +
              live.parsed +
              ' 行留痕（保留期 ' +
              live.windowDays +
              ' 天' +
              (live.dropped > 0 ? '，按保留期/上限丢弃 ' + live.dropped + ' 行' : '') +
              '）'
            : '统计来自 core 装载时的 status.json 快照（需要面板 host ≥ 0.0.8 才是实时的）'}
        </div>

        {!core || !turns ? (
          <div style={{ ...S.card, marginTop: 10 }}>{emptyReason(data)}</div>
        ) : null}

        <div style={{ ...S.dim, marginTop: 4 }}>
          {blocker
            ? '主要拦截原因：' + reasonLabel(blocker.reason) + '（' + blocker.count + ' 次）'
            : (turns ?? 0) > 0
              ? '全部通过，无拦截'
              : '还没有判定记录'}
        </div>

        <div style={S.h}>
          调参建议{' '}
          {hints.length === 0 ? (
            <span style={S.dim}>
              （暂无：core 在装载时按已评估 {evaluated ?? 0} 轮算，样本不足 20 轮刻意不开口）
            </span>
          ) : (
            <span style={S.dim}>（core 在装载时算，不是实时的）</span>
          )}
        </div>
        {hints.map((hint, index) => (
          <div key={String(hint.key ?? index)} style={S.card}>
            {hintLine(hint)}
          </div>
        ))}

        <div style={S.h}>最近判定</div>
        {recent.length === 0 ? (
          <div style={S.dim}>还没有判定记录（{data.trace?.path ?? 'decisions.jsonl'}）</div>
        ) : (
          <ul style={S.list}>
            {recent
              .slice()
              .reverse()
              .map((row, index) => (
                <li key={index} style={S.li}>
                  <span style={S.dim}>{relativeTime(row.at)}</span>　
                  <span>{actionLabel(row.action)}</span>
                  {row.score !== undefined ? <span style={S.dim}> · 分值 {scoreText(row.score)}</span> : null}
                  <div style={{ ...S.dim, ...S.mono }}>{reasonLabel(row.reason)}</div>
                </li>
              ))}
          </ul>
        )}

        <div style={S.h}>最近沉淀（{items.length}）</div>
        {items.length === 0 ? (
          <div style={S.dim}>还没有条目落盘</div>
        ) : (
          <ul style={S.list}>
            {items.map((item, index) => {
              const path = notePathForItem(item, notes);
              return (
                <li key={String(item.id ?? index)} style={S.li}>
                  <div>
                    {path ? (
                      <a
                        href="#"
                        style={{ color: 'inherit' }}
                        title={'在侧边栏打开 ' + path}
                        onClick={(event) => {
                          event.preventDefault();
                          props.onOpenFile?.(path);
                        }}
                      >
                        {String(item.title ?? '(无标题)')}
                      </a>
                    ) : (
                      String(item.title ?? '(无标题)')
                    )}
                  </div>
                  <div style={S.dim}>
                    {relativeTime(item.created_at)} · 主题 {String(item.topic ?? '—')} · {String(item.id ?? '')}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div style={S.h}>知识库笔记（{notes.length}）</div>
        {notes.length === 0 ? (
          <div style={S.dim}>01_问答沉淀/ 里还没有笔记（{data.mdRoot ?? '—'}）</div>
        ) : (
          <ul style={S.list}>
            {notes.map((note, index) => (
              <li key={String(note.path ?? index)} style={S.li}>
                <a
                  href="#"
                  style={{ color: 'inherit' }}
                  onClick={(event) => {
                    event.preventDefault();
                    if (props.onOpenFile && note.path) props.onOpenFile(note.path);
                  }}
                  title={note.path ?? ''}
                >
                  {String(note.name ?? '')}
                </a>
                <span style={S.dim}> · {relativeTime(note.mtimeMs)}</span>
              </li>
            ))}
          </ul>
        )}

        {(data.problems ?? []).length > 0 ? (
          <>
            <div style={S.h}>读取告警（{data.problems?.length}）</div>
            <ul style={S.list}>
              {(data.problems ?? []).map((problem, index) => (
                <li key={index} style={{ ...S.li, ...S.mono, ...S.dim }}>
                  {problem}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </>
    );
  }, [state, load, props.onOpenFile]);

  return <div style={S.root}>{body}</div>;
}
