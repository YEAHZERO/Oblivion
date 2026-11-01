/**
 * 知识库目录树面板 —— 左栏「知识库」入口（`sidebar.panellist`）打开的**主栏面板**。
 *
 * 两栏布局：左栏目录树（可折叠），右栏文档内容查看器（点击 .md 文件后拉取
 * `GET /oblivion-panel/kb-file?file=<relPath>` 渲染）。非 md 文件只列不点。
 *
 * 样式沿用 `Panel.tsx` 约定：内联对象、`color: inherit`、单色——主题跟外壳，不引 CSS 模块。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { PolarisGlyph } from './leftbar.js';

/** 与 Node 半边 config.kbTreePath / config.kbFilePath 的默认值一致。 */
const KB_TREE_ROUTE = '/oblivion-panel/kb-tree';
const KB_FILE_ROUTE = '/oblivion-panel/kb-file';

interface KbTreeNode {
  name: string;
  relPath: string;
  kind: 'dir' | 'file';
  children?: KbTreeNode[];
}

interface KbTreeData {
  ok?: boolean;
  mdRoot?: string;
  mdRootSource?: string;
  tree?: KbTreeNode[];
  truncated?: boolean;
  fileCount?: number;
  dirCount?: number;
  problems?: string[];
  panelVersion?: string;
}

export interface KbTreePanelProps {
  /** 主栏面板是否可见（不可见时暂停请求）。 */
  visible?: boolean;
  /** 打开文件能力（better-sidebar 服务注入；缺席时 .md 点击无反应）。 */
  onOpenFile?: (path: string) => void;
  /** 刷新按钮触发的重载。 */
  onRefresh?: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; data: KbTreeData }
  | { status: 'error'; error: string };

const S = {
  root: {
    display: 'flex',
    height: '100%',
    boxSizing: 'border-box',
    color: 'inherit',
    fontSize: 12,
    lineHeight: 1.7,
    overflow: 'hidden',
  } as const,
  treePane: {
    width: '34%',
    minWidth: 220,
    overflow: 'auto',
    padding: '10px 12px',
    borderRight: '1px solid rgba(127,127,127,0.25)',
  } as const,
  docPane: {
    flex: 1,
    overflow: 'auto',
    padding: '10px 14px 24px',
  } as const,
  row: { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' } as const,
  head: { display: 'flex', alignItems: 'center', gap: 8 } as const,
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
  tree: { listStyle: 'none', margin: '8px 0 0', padding: 0 } as const,
  card: {
    border: '1px solid rgba(127,127,127,0.28)',
    borderRadius: 6,
    padding: '8px 10px',
    marginBottom: 8,
  } as const,
  fileBtn: {
    border: 'none',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    padding: 0,
    fontSize: 12,
    fontFamily: 'inherit',
    flex: '1 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  } as const,
  fileBtnActive: {
    border: 'none',
    background: 'rgba(65,118,230,0.12)',
    color: 'inherit',
    cursor: 'pointer',
    padding: '0 4px',
    fontSize: 12,
    borderRadius: 3,
    fontFamily: 'inherit',
    flex: '1 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  } as const,
  /** 非点击的行内名字（目录/非 md 文件）：单行裁剪省略。 */
  name: {
    flex: '1 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as const,
  docTitle: { fontWeight: 600, fontSize: 13, marginBottom: 4 } as const,
  /** 正文：与宿主对话区正文一致——继承宿主正文字体（非等宽），字号 13、行高 1.8。 */
  docBody: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'inherit',
    fontSize: 13,
    lineHeight: 1.8,
  } as const,
  docPlaceholder: { opacity: 0.5, marginTop: 24 } as const,
  /** 编辑模式：textarea 样式——**撑满整个右栏**（不留边框、不缩进），等宽字体。 */
  editor: {
    flex: 1,
    width: '100%',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 12,
    lineHeight: 1.7,
    padding: '8px 10px',
    boxSizing: 'border-box',
    background: 'transparent',
    color: 'inherit',
    resize: 'none',
    outline: 'none',
    border: 'none',
  } as const,
  /** 编辑模式工具栏。 */
  editorBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  } as const,
};

interface TreeRowProps {
  node: KbTreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (relPath: string) => void;
  /** 选中文件的 relPath（与 KbTreePanel selectedFile state 对应）；非 undefined 即选中。 */
  selected?: string;
  /** 点击 .md 文件 → 选中 + 右栏显示内容。 */
  onSelectFile?: (relPath: string) => void;
  /** 打开文件能力（宿主注入；缺席时 .md 点击只选中，不打开侧边栏）。 */
  onOpenFile?: (path: string) => void;
}

/** 一行树条目：目录可折叠（▸/▾ + 名字），.md 文件可点（选中 → 右栏渲染）。 */
function TreeRow(props: TreeRowProps): JSX.Element {
  const { node, depth, expanded, onToggle, selected, onSelectFile, onOpenFile } = props;
  const isDir = node.kind === 'dir';
  const isMd = !isDir && node.name.endsWith('.md');
  const isOpen = expanded.has(node.relPath);
  const isSelected = selected !== undefined && selected === node.relPath;
  const indent = 14 * depth;

  return (
    <>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: isSelected ? '1px 4px' : '1px 0', paddingLeft: indent, borderRadius: 3, background: isSelected ? 'rgba(65,118,230,0.12)' : 'transparent' }}
      >
        {isDir ? (
          <button
            type="button"
            onClick={() => onToggle(node.relPath)}
            aria-label={(isOpen ? '折叠 ' : '展开 ') + node.name}
            style={{ border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 12, opacity: 0.8 }}
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span style={{ width: 12, flex: '0 0 auto' }} aria-hidden />
        )}
        <span aria-hidden style={{ opacity: 0.55, fontSize: 11 }}>
          {isDir ? '📁' : isMd ? '📄' : '📃'}
        </span>
        {isMd && onSelectFile ? (
          <button
            type="button"
            onClick={() => { onSelectFile(node.relPath); if (onOpenFile) onOpenFile(node.relPath); }}
            title={isSelected ? '已选中，右栏显示内容' : '点击在右栏查看内容，同时弹出侧边栏'}
            style={isSelected ? S.fileBtnActive : S.fileBtn}
          >
            {node.name}
          </button>
        ) : (
          <span style={{ ...S.name, fontSize: 12, opacity: isMd ? 1 : 0.85 }} title={node.name}>{node.name}</span>
        )}
      </div>
      {isDir && isOpen && node.children?.length ? (
        <div>
          {node.children.map((child) => (
            <TreeRow
              key={child.relPath}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              selected={selected}
              onSelectFile={onSelectFile}
              onOpenFile={onOpenFile}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

/**
 * `sidebar.panellist` 条目的**纯图标**组件（外壳把条目行渲染成 ~18px 的图标 + label，
 * 不是内容区——把内容组件挂进去会把整块左侧栏盖住、会话点不到）。
 *
 * props 契约：`{size, active}`（来自 `ui-sidebar` 的 PanelRow，图标组件收 `{size, active}`）。
 */
export function KbTreeIcon(props: { size?: number; active?: boolean }): JSX.Element {
  const size = props.size ?? 18;
  return (
    <svg
      data-obl-kb-icon=""
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ display: 'block', flex: '0 0 auto', opacity: props.active ? 1 : 0.75 }}
    >
      {/* 文件夹 + 目录树：一个打开的文件夹，里面几层小线条 */}
      <path
        d="M3 7V5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="4" y="8" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <line x1="8" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="8" y1="15" x2="14" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="11" y1="18" x2="15" y2="18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="16" y1="11" x2="18" y2="11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function KbTreePanel(props: KbTreePanelProps): JSX.Element {
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  /** 展开的目录（按 relPath 记录）；默认全收起（手动点 ▸ 展开）。 */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** 当前选中的 .md 文件 relPath；undefined = 未选中。 */
  const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined);
  /** 右栏文档加载状态。 */
  const [doc, setDoc] = useState<
    | { status: 'idle' }
    | { status: 'loading'; relPath: string }
    | { status: 'ready'; relPath: string; content: string; truncated: boolean }
    | { status: 'error'; relPath: string; error: string }
  >({ status: 'idle' });
  /** 编辑模式：true 时右栏显示 textarea + 保存/取消按钮。 */
  const [editing, setEditing] = useState(false);
  /** 编辑中的文本内容。 */
  const [editContent, setEditContent] = useState('');
  /** 正在保存（防重复点击）。 */
  const [saving, setSaving] = useState(false);
  /** 左栏宽度（面板宽度的百分比，可拖分隔线调整；默认 34）。 */
  const [leftPct, setLeftPct] = useState(34);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  /** 拖动中间分隔线：左栏宽度跟随指针横坐标（15%–75% 之间夹取），右栏自动占剩余。 */
  const onDragStart = useCallback((event: { preventDefault(): void }) => {
    event.preventDefault();
    setDragging(true);
    const move = (ev: PointerEvent) => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.min(75, Math.max(15, pct)));
    };
    const stop = () => {
      setDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }, []);

  const load = useCallback(async () => {
    setState((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }));
    try {
      const response = await fetch(KB_TREE_ROUTE, { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = (await response.json()) as KbTreeData;
      // 默认**不展开**任何文件夹：首次加载时把已展开集合清空（刷新后回到全收起）。
      setExpanded(new Set());
      setState({ status: 'ready', data });
    } catch (error) {
      setState({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  /** 拉取 .md 文件内容（右栏渲染）。 */
  const loadFile = useCallback((relPath: string) => {
    setSelectedFile(relPath);
    setDoc({ status: 'loading', relPath });
    // 切换文件时重置编辑状态
    setEditing(false);
    setEditContent('');
    const url = KB_FILE_ROUTE + '?file=' + encodeURIComponent(relPath);
    fetch(url, { cache: 'no-store', credentials: 'same-origin' })
      .then((response) => response.json())
      .then((data: { ok?: boolean; content?: string; truncated?: boolean; error?: string }) => {
        if (data.ok && data.content !== undefined) {
          setDoc({ status: 'ready', relPath, content: data.content, truncated: data.truncated ?? false });
          setEditContent(data.content);
        } else {
          setDoc({ status: 'error', relPath, error: data.error ?? '读取失败' });
        }
      })
      .catch((error: unknown) => {
        setDoc({ status: 'error', relPath, error: error instanceof Error ? error.message : String(error) });
      });
  }, []);

  /** 保存编辑后的内容（POST kb-file 写入）。 */
  const saveEdit = useCallback(async (relPath: string, content: string) => {
    setSaving(true);
    try {
      const response = await fetch(KB_FILE_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ file: relPath, content }),
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setDoc({ status: 'ready', relPath, content, truncated: false });
        setEditing(false);
      } else {
        setDoc({ status: 'error', relPath, error: data.error ?? '保存失败' });
        setEditing(false);
      }
    } catch (error: unknown) {
      setDoc({ status: 'error', relPath, error: error instanceof Error ? error.message : String(error) });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, []);

  useEffect(() => {
    if (props.visible === false) return;
    void load();
  }, [load, props.visible]);

  const toggle = useCallback((relPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) next.delete(relPath);
      else next.add(relPath);
      return next;
    });
  }, []);

  // ── 右栏：文档内容查看器 ──────────────────────────────────────────
  const docPane = useMemo(() => {
    if (doc.status === 'idle') {
      return (
        <div style={S.docPlaceholder}>
          点击左侧 📄 .md 文件，在此查看内容
        </div>
      );
    }
    if (doc.status === 'loading') {
      return <div style={{ ...S.docPlaceholder, opacity: 0.5 }}>加载中…</div>;
    }
    if (doc.status === 'error') {
      return (
        <div style={S.card}>
          <div>读取 {doc.relPath} 失败：{doc.error}</div>
          <div style={S.dim}>若刚装载本插件，需要**重启一次 App**（Node 半边改动不会热加载）。</div>
        </div>
      );
    }
    // ready
    const fileName = doc.relPath.split('/').pop() ?? doc.relPath;
    if (editing) {
      // 编辑模式：右栏**全高 textarea**（无边框、无缩进），顶部一行工具栏
      return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          <div style={S.editorBar}>
            <span style={S.docTitle}>{fileName}</span>
            <button
              type="button"
              style={S.btn}
              disabled={saving}
              onClick={() => { void saveEdit(doc.relPath, editContent); }}
            >
              {saving ? '保存中…' : '保存'}
            </button>
            <button type="button" style={S.btn} onClick={() => { setEditing(false); setEditContent(doc.content); }}>
              取消
            </button>
          </div>
          <textarea
            data-obl-kb-doc-body=""
            style={S.editor}
            value={editContent}
            onChange={(ev: { target: { value: string } }) => setEditContent(ev.target.value)}
            autoFocus
          />
        </div>
      );
    }
    return (
      <div>
        <div style={{ ...S.row, marginBottom: 4 }}>
          <div style={S.head}>
            <span style={S.docTitle}>{fileName}</span>
            <button
              type="button"
              style={S.btn}
              onClick={() => { setEditing(true); setEditContent(doc.content); }}
            >
              编辑
            </button>
          </div>
          {doc.truncated && (
            <span style={{ ...S.mono, ...S.dim }}>（已截断：仅显示前 512 KB）</span>
          )}
        </div>
        <div style={{ ...S.mono, ...S.dim, marginBottom: 8 }}>{doc.relPath}</div>
        <pre style={S.docBody}>{doc.content}</pre>
      </div>
    );
  }, [doc, editing, editContent, saving, saveEdit]);

  const body = useMemo(() => {
    if (state.status === 'loading') {
      return (
        <div style={{ padding: '10px 12px', color: 'inherit' }}>
          <div style={S.dim}>读取知识库目录中…</div>
          <div style={{ ...S.dim, marginTop: 12, opacity: 0.4 }}>—</div>
        </div>
      );
    }
    if (state.status === 'error') {
      return (
        <div style={{ padding: '10px 12px' }}>
          <div style={S.card}>
            <div>读不到知识库目录：{state.error}</div>
            <div style={S.dim}>
              若刚装载本插件，需要**重启一次 App**（Node 半边改动不会热加载）。路由：{KB_TREE_ROUTE}
            </div>
          </div>
        </div>
      );
    }

    const data = state.data;
    if (!data.ok) {
      return (
        <div style={{ padding: '10px 12px' }}>
          <div style={S.card}>
            <div>目录树装配失败：</div>
            {(data.problems ?? []).map((problem) => (
              <div key={problem} style={{ ...S.mono, ...S.dim }}>{problem}</div>
            ))}
          </div>
        </div>
      );
    }

    const tree = data.tree ?? [];
    if (tree.length === 0) {
      return (
        <div style={{ padding: '10px 12px' }}>
          <div style={S.card}>
            <div>知识库是空的（{data.mdRoot}）。</div>
            <div style={S.dim}>mdRoot 来源：{data.mdRootSource}（core 优先，缺则 fallback）</div>
          </div>
        </div>
      );
    }

    return (
      <>
        {/* 左栏：目录树（宽度 = leftPct%，随分隔线拖动/窗口大小自适应） */}
        <div style={{ ...S.treePane, width: leftPct + '%' }}>
          <div style={S.row}>
            <div style={S.head}>
              <PolarisGlyph size={16} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>知识库</span>
            </div>
            <button type="button" style={S.btn} onClick={() => { void load(); }}>
              刷新
            </button>
          </div>
          <div style={{ ...S.mono, ...S.dim, marginTop: 4, fontFamily: 'inherit' }}>
            {data.mdRoot}
            {data.truncated ? '（已裁剪）' : ''}
          </div>
          <div style={S.tree}>
            <ul style={S.tree}>
              {tree.map((node) => (
                <li key={node.relPath}>
                  <TreeRow
                    node={node}
                    depth={0}
                    expanded={expanded}
                    onToggle={toggle}
                    selected={selectedFile}
                    onSelectFile={loadFile}
                    onOpenFile={props.onOpenFile}
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
        {/* 中间分隔线：可左右拖动调整左栏宽度（15%–75%） */}
        <div
          onPointerDown={onDragStart}
          title="拖动调整左右栏宽度"
          style={{
            flex: '0 0 4px',
            cursor: 'col-resize',
            background: dragging ? 'rgba(65,118,230,0.35)' : 'rgba(127,127,127,0.25)',
            touchAction: 'none',
            alignSelf: 'stretch',
          }}
        />
        {/* 右栏：文档内容（flex:1 自动占剩余宽度） */}
        {/* tabIndex + data-obl-kb-doc-body：预览模式下 vimc 键盘（j/k/d/G）可在此滚动 */}
        <div
          style={S.docPane}
          tabIndex={editing ? -1 : 0}
          data-obl-kb-doc-body={editing ? undefined : ''}
          data-obl-kb-editing={editing ? 'true' : undefined}
          onFocus={(ev) => {
            // 预览模式聚焦到右栏后，vimc 按键路由到该容器
          }}
        >
          {docPane}
        </div>
      </>
    );
  }, [state, expanded, selectedFile, doc, editing, editContent, saving, load, toggle, loadFile, saveEdit, props.onOpenFile, docPane, leftPct, onDragStart]);

  return (
    <div ref={rootRef} style={S.root}>
      {body}
    </div>
  );
}
