/**
 * 设置分节：品牌外观 + 侧栏面板。
 *
 * 注册到 `settings.section`（由设置弹窗声明），入口是「设置 → Oblivion 品牌」。
 * 改动写入设置存储并即时广播，侧栏品牌行与面板无需刷新页面即可更新。
 *
 * ⚠️ 本分节**永远注册**，不受「接管 DSH 品牌」开关影响 —— 否则用户关掉接管后
 *    就再也找不到地方把它打开了。
 */

import type { JSX } from 'react';
import { useRef, useState } from 'react';
import { OblivionBrandMark } from './Brand.js';
import {
  BRAND_IMAGE_MAX_EDGE,
  DEFAULT_BRAND_NAME,
  MAX_BRAND_IMAGE_BYTES,
  MAX_BRAND_NAME_LENGTH,
  brandSettings,
  resetBrandSettings,
  updateBrandSettings,
  useBrandSettings,
} from './settings.js';
import { providerLabel, type EmbeddableProvider } from './panels.js';

const LABEL = 'var(--dsw-alias-label-primary, currentColor)';
const MUTED = 'var(--dsw-alias-label-tertiary, #8b93a1)';
const BORDER = 'var(--dsw-alias-border-l2, #e5e7eb)';
const ACCENT = 'var(--dsw-alias-brand-primary, #4f6ef7)';
const DANGER = 'var(--dsw-alias-label-error, #d93025)';

const buttonStyle = {
  font: 'inherit',
  fontSize: '13px',
  padding: '5px 12px',
  borderRadius: '6px',
  border: `1px solid ${BORDER}`,
  background: 'transparent',
  color: LABEL,
  cursor: 'pointer',
} as const;

const cardStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '14px',
  border: `1px solid ${BORDER}`,
  borderRadius: '8px',
} as const;

const headingStyle = { margin: 0, fontSize: '13px', fontWeight: 600, color: LABEL } as const;
const hintStyle = { margin: 0, fontSize: '12px', lineHeight: '18px', color: MUTED } as const;

/** data URL 的近似字节数（base64 膨胀 4/3）。 */
function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  return comma < 0 ? dataUrl.length : Math.round(((dataUrl.length - comma - 1) * 3) / 4);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

/** 把图片按最长边缩到 `BRAND_IMAGE_MAX_EDGE`；SVG 与已足够小的图原样返回。 */
async function normalizeImage(dataUrl: string, mime: string): Promise<{ url: string; note: string | null }> {
  if (mime === 'image/svg+xml') {
    return { url: dataUrl, note: 'SVG 保持矢量原样，不缩放' };
  }

  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => resolve(null);
    element.src = dataUrl;
  });
  if (image === null) return { url: dataUrl, note: null };

  const longest = Math.max(image.naturalWidth, image.naturalHeight);
  if (longest === 0) return { url: dataUrl, note: null };
  if (longest <= BRAND_IMAGE_MAX_EDGE && dataUrlBytes(dataUrl) <= MAX_BRAND_IMAGE_BYTES) {
    return { url: dataUrl, note: null };
  }

  const scale = Math.min(1, BRAND_IMAGE_MAX_EDGE / longest);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) return { url: dataUrl, note: null };
  context.drawImage(image, 0, 0, width, height);

  // PNG 保透明；仍超限则退回 JPEG（有损但更小）。
  let output = canvas.toDataURL('image/png');
  let note = `已缩放到 ${width}×${height}`;
  if (dataUrlBytes(output) > MAX_BRAND_IMAGE_BYTES) {
    output = canvas.toDataURL('image/jpeg', 0.85);
    note = `已缩放到 ${width}×${height} 并转为 JPEG`;
  }
  return { url: output, note };
}

/** 设置分节主体工厂。 */
export function createBrandSettingsPanel(
  listProviders: () => readonly EmbeddableProvider[],
): () => JSX.Element {
  return function BrandSettingsPanel(): JSX.Element {
    const settings = useBrandSettings();
    const [draft, setDraft] = useState(() => brandSettings().name);
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const nameDirty = draft !== settings.name;
    const providers = listProviders();
    const selected = new Set(settings.sidebarPanels);

    const apply = (patch: Parameters<typeof updateBrandSettings>[0]): void => {
      const failure = updateBrandSettings(patch);
      setError(failure);
    };

    const onPickFile = async (file: File | undefined): Promise<void> => {
      if (file === undefined) return;
      setError(null);
      setNotice(null);
      try {
        const raw = await readAsDataUrl(file);
        const { url, note } = await normalizeImage(raw, file.type);
        if (dataUrlBytes(url) > MAX_BRAND_IMAGE_BYTES) {
          setError(
            `图片过大（约 ${Math.round(dataUrlBytes(url) / 1024)} KB，上限 ${Math.round(MAX_BRAND_IMAGE_BYTES / 1024)} KB）。请换一张更小的图。`,
          );
          return;
        }
        apply({ image: url });
        setNotice(note);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '读取图片失败');
      }
    };

    const togglePanel = (key: string, on: boolean): void => {
      const next = new Set(settings.sidebarPanels);
      if (on) next.add(key);
      else next.delete(key);
      apply({ sidebarPanels: [...next] });
    };

    return (
      <div
        data-obl-brand-settings=""
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          // 内边距与限宽都长在面板自己身上，而不是外层容器上 ——
          // 外层容器是通用的（插件市场等也走它），在那里加约束会把别人的面板挤窄。
          padding: '16px 20px 48px',
          maxWidth: '620px',
          width: '100%',
          boxSizing: 'border-box',
          margin: settings.centerPanel ? '0 auto' : '0',
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 500, color: LABEL }}>Oblivion 品牌</h2>
          <p style={hintStyle}>
            侧栏与会话 Hero 区的品牌呈现。关闭「接管 DSH 品牌」后，DeepSeek Harness 的鲸鱼外观会立即恢复。
          </p>
        </div>

        {/* ---- 接管开关 ---- */}
        <section style={cardStyle}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.overrideEnabled}
              onChange={(event) => apply({ overrideEnabled: event.target.checked })}
            />
            <span style={{ fontSize: '13px', color: LABEL }}>接管 DSH 品牌（侧栏图形与名称）</span>
          </label>
          <p style={hintStyle}>
            {settings.overrideEnabled
              ? '当前由本插件接管：官方品牌槽位的注册被本插件遮蔽。'
              : '当前已释放槽位：官方鲸鱼图标与 wordmark 已恢复。'}
          </p>
        </section>

        {/* ---- 品牌图形 ---- */}
        <section style={cardStyle}>
          <h3 style={headingStyle}>品牌图形</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1px solid ${BORDER}`,
                borderRadius: '8px',
                flex: 'none',
              }}
            >
              <OblivionBrandMark size={32} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button type="button" style={buttonStyle} onClick={() => fileRef.current?.click()}>
                上传图片
              </button>
              <button
                type="button"
                style={buttonStyle}
                disabled={settings.image === null}
                onClick={() => {
                  apply({ image: null });
                  setNotice(null);
                }}
              >
                恢复北极星
              </button>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(event) => {
              void onPickFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <p style={hintStyle}>
            支持任意浏览器可解码的格式（PNG / JPEG / WebP / GIF / SVG / AVIF / BMP / ICO）。
            超过 {BRAND_IMAGE_MAX_EDGE}px 的位图会自动缩放，SVG 保持矢量。
          </p>
          {notice !== null ? <p style={{ ...hintStyle, color: ACCENT }}>{notice}</p> : null}
        </section>

        {/* ---- 品牌名文字 ---- */}
        <section style={cardStyle}>
          <h3 style={headingStyle}>品牌名文字</h3>
          <input
            type="text"
            value={draft}
            maxLength={MAX_BRAND_NAME_LENGTH}
            placeholder={DEFAULT_BRAND_NAME}
            onChange={(event) => setDraft(event.target.value.slice(0, MAX_BRAND_NAME_LENGTH))}
            style={{
              font: 'inherit',
              fontSize: '13px',
              padding: '7px 10px',
              borderRadius: '6px',
              border: `1px solid ${BORDER}`,
              background: 'var(--dsw-alias-bg-layer-2, transparent)',
              color: LABEL,
            }}
          />
          <p style={hintStyle}>
            {draft.length}/{MAX_BRAND_NAME_LENGTH} 字符{draft === '' ? ' · 留空表示只显示图形' : ''}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              disabled={!nameDirty}
              onClick={() => apply({ name: draft })}
              style={{
                ...buttonStyle,
                border: 'none',
                background: nameDirty ? ACCENT : BORDER,
                color: nameDirty ? '#fff' : MUTED,
                cursor: nameDirty ? 'pointer' : 'not-allowed',
              }}
            >
              保存
            </button>
            <button
              type="button"
              style={buttonStyle}
              onClick={() => {
                setDraft(DEFAULT_BRAND_NAME);
                apply({ name: DEFAULT_BRAND_NAME });
              }}
            >
              恢复默认（{DEFAULT_BRAND_NAME}）
            </button>
            {nameDirty ? <span style={hintStyle}>有未保存的改动</span> : null}
          </div>
        </section>

        {/* ---- 面板显示 ---- */}
        <section style={cardStyle}>
          <h3 style={headingStyle}>面板显示</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings.centerPanel}
              onChange={(event) => apply({ centerPanel: event.target.checked })}
            />
            <span style={{ fontSize: '13px', color: LABEL }}>内容居中显示</span>
          </label>
          <p style={hintStyle}>
            本面板会出现在两个宽度差异很大的容器里：设置弹窗很窄，而挂到左侧栏后是整窗宽。
            居中时内容限宽 620px 并水平居中；关闭则贴左对齐。
            本设置只作用于本面板，不影响其它插件的面板。
          </p>
        </section>

        {/* ---- 侧栏面板 ---- */}
        <section style={cardStyle}>
          <h3 style={headingStyle}>左侧栏面板</h3>
          <p style={hintStyle}>
            勾选的插件面板会以独立条目出现在左侧栏（「插件」下方）。可多选。
          </p>
          {providers.length === 0 ? (
            <p style={hintStyle}>
              没有发现可嵌入的面板提供方。只有主动暴露渲染接口的插件（例如 dshmarket）才能被搬进侧栏。
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {providers.map((provider) => (
                <label
                  key={provider.key}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(provider.key)}
                    onChange={(event) => togglePanel(provider.key, event.target.checked)}
                  />
                  <span style={{ fontSize: '13px', color: LABEL }}>{providerLabel(provider.key)}</span>
                  <span style={{ fontSize: '11px', color: MUTED }}>{provider.key}</span>
                </label>
              ))}
            </div>
          )}
        </section>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            style={buttonStyle}
            onClick={() => {
              const failure = resetBrandSettings();
              setDraft(DEFAULT_BRAND_NAME);
              setNotice(null);
              setError(failure);
            }}
          >
            全部恢复默认
          </button>
          <span style={hintStyle}>保存在浏览器本地（localStorage）。</span>
        </div>

        {error !== null ? <p style={{ ...hintStyle, color: DANGER }}>{error}</p> : null}
      </div>
    );
  };
}
