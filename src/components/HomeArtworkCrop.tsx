import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { centerArtworkCrop, fullArtworkCrop, type ArtworkCrop, type HomeArtwork } from '../../electron/shared/homeArtwork';
import { t } from '../i18n';

function CropDimension({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(String(value)); }, [value]);
  const commit = () => { const next = Math.max(1, Math.min(max, Math.round(Number(text) || value))); onChange(next); setText(String(next)); };
  return <input type="number" aria-label={label} min={1} max={max || 1} value={text}
    onFocus={() => { editing.current = true; }}
    onChange={e => { const next = e.target.value; setText(next); if (Number(next) >= 1 && Number(next) <= max) onChange(Number(next)); }}
    onBlur={() => { editing.current = false; commit(); }}
    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); e.currentTarget.blur(); } }} />;
}

export default function HomeArtworkCrop({ artwork, onClose, onSave }: {
  artwork: HomeArtwork; onClose: () => void; onSave: (crop: ArtworkCrop) => Promise<void>;
}) {
  const [crop, setCrop] = useState(artwork.crop ?? fullArtworkCrop);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [ratio, setRatio] = useState(artwork.crop ? -1 : 0);
  const dialog = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; crop: ArtworkCrop; width: number; height: number }>();
  const source = artwork.sourceUrl ?? artwork.url;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previous?.focus({ preventScroll: true });
  }, []);
  const aspect = size.width && size.height ? size.width / size.height : 1;
  const base = ratio > 0 ? { width: Math.min(1, ratio / aspect), height: Math.min(1, aspect / ratio) }
    : ratio < 0 ? { width: Math.min(1, crop.width / crop.height), height: Math.min(1, crop.height / crop.width) } : { width: 1, height: 1 };
  const zoom = Math.max(1, base.width / crop.width, base.height / crop.height);
  const imageStyle: CSSProperties = { width: `${100 / crop.width}%`, height: `${100 / crop.height}%`,
    left: `${-crop.x / crop.width * 100}%`, top: `${-crop.y / crop.height * 100}%` };
  const frameAspect = aspect * crop.width / crop.height;
  const frameStyle = { aspectRatio: frameAspect, width: `min(100%, ${260 * frameAspect}px)` };
  const move = (x: number, y: number, from = crop) => setCrop({ ...from, x: Math.max(0, Math.min(1 - from.width, x)), y: Math.max(0, Math.min(1 - from.height, y)) });
  return createPortal(<div className="home-artwork-crop-overlay" onPointerDown={e => e.stopPropagation()}>
    <div ref={dialog} className="home-artwork-crop" role="dialog" aria-modal="true" aria-label={t('裁剪主页看板娘')} tabIndex={-1}
      onKeyDown={e => e.stopPropagation()}
      onKeyDownCapture={e => {
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); if (!busy) onClose(); }
        if (e.key === 'Tab') {
          e.stopPropagation();
          const items = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')];
          const next = items[(items.indexOf(document.activeElement as HTMLElement) + (e.shiftKey ? -1 : 1) + items.length) % items.length];
          e.preventDefault(); next?.focus();
        }
      }}>
      <header><h3>{t('裁剪主页看板娘')}</h3><button type="button" aria-label={t('关闭裁剪')} disabled={busy} onClick={onClose}>×</button></header>
      <div className="home-artwork-crop__columns">
        <section><h4>{t('裁剪区域')}</h4><div className="home-artwork-crop__stage">
          <div className="home-artwork-crop__frame" style={frameStyle} role="group" tabIndex={0} aria-label={t('拖动图片调整位置')}
            onPointerDown={e => { if (e.button !== 0 || !size.width) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); const r = e.currentTarget.getBoundingClientRect(); drag.current = { x: e.clientX, y: e.clientY, crop, width: r.width, height: r.height }; }}
            onPointerMove={e => { const d = drag.current; if (d) move(d.crop.x - (e.clientX - d.x) / d.width * d.crop.width, d.crop.y - (e.clientY - d.y) / d.height * d.crop.height, d.crop); }}
            onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }}
            onKeyDown={e => { const key = e.key; if (key.startsWith('Arrow')) { e.preventDefault(); move(crop.x + (key === 'ArrowRight' ? .01 : key === 'ArrowLeft' ? -.01 : 0), crop.y + (key === 'ArrowDown' ? .01 : key === 'ArrowUp' ? -.01 : 0)); } }}>
            <img src={source} alt={t('裁剪原图')} style={imageStyle} draggable={false} onLoad={e => setSize({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} onError={() => setError(t('图片无法读取，请重新选择。'))} />
            <div className="home-artwork-crop__grid" aria-hidden="true" />
          </div>
        </div></section>
        <section><h4>{t('首页效果预览')}</h4><div className="home-artwork-crop__preview-stage"><div className="home-artwork-crop__preview" style={frameStyle}><img src={source} alt={t('羽化效果预览')} style={imageStyle} draggable={false} /></div></div></section>
      </div>
      <div className="home-artwork-crop__ratios" aria-label={t('裁剪比例')}>
        {[['原比例', 0], ['4:3', 4 / 3], ['16:9', 16 / 9], ['1:1', 1]].map(([label, value]) => <button type="button" key={label} aria-pressed={ratio === value} onClick={() => { const r = Number(value); setRatio(r); setCrop(centerArtworkCrop(crop, r ? Math.min(1, r / aspect) : 1, r ? Math.min(1, aspect / r) : 1)); }}>{t(String(label))}</button>)}
      </div>
      <div className="home-artwork-crop__sizes">
        <label>{t('宽度')}<CropDimension label={t('裁剪宽度')} max={size.width} value={Math.max(1, Math.round(crop.width * size.width))} onChange={v => { setRatio(-1); setCrop(centerArtworkCrop(crop, v / (size.width || 1), crop.height)); }} /><span>px</span></label>
        <label>{t('高度')}<CropDimension label={t('裁剪高度')} max={size.height} value={Math.max(1, Math.round(crop.height * size.height))} onChange={v => { setRatio(-1); setCrop(centerArtworkCrop(crop, crop.width, v / (size.height || 1))); }} /><span>px</span></label>
        <label className="home-artwork-crop__zoom">{t('缩放')}<input type="range" aria-label={t('图片缩放')} min={100} max={Math.max(400, Math.round(zoom * 100))} value={Math.round(zoom * 100)} onChange={e => setCrop(centerArtworkCrop(crop, base.width * 100 / Number(e.target.value), base.height * 100 / Number(e.target.value)))} /><output>{Math.round(zoom * 100)}%</output></label>
      </div>
      {error && <p role="alert">{error}</p>}
      <footer><button type="button" disabled={busy} onClick={onClose}>{t('取消')}</button><button type="button" className="is-primary" disabled={busy || !size.width} onClick={async () => { setBusy(true); setError(''); try { await onSave(crop); } catch (cause) { setError(cause instanceof Error ? cause.message : t('保存失败')); } finally { setBusy(false); } }}>{t('保存图案')}</button></footer>
    </div>
  </div>, document.body);
}
