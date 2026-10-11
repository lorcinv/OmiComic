import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import GlassSelect from '../GlassSelect';
import { DEFAULT_ADJUSTMENTS, PAGE_SORT_OPTIONS, type AutoReadOptions, type ImageAdjustments, type PageSort } from '../../electron/shared/readerPreferences';

interface Props {
  disabled: boolean; document: boolean; epub: boolean; timeSortUnavailable: boolean; sorting: boolean; error: string | null;
  sort: PageSort; onSort: (mode: PageSort) => void;
  adjustments: ImageAdjustments; onAdjustments: (value: ImageAdjustments) => void;
  auto: AutoReadOptions; onAuto: (value: AutoReadOptions) => void;
  running: boolean; onPlay: () => void; onPanel: (open: boolean) => void;
}
function Slider({ label, value, min, max, step = 1, unit = '', disabled = false, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; disabled?: boolean; onChange: (value: number) => void;
}) {
  return <label className="reader-tool-slider"><span>{label}<output>{step < 1 ? value.toFixed(2) : value}{unit}</output></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))} />
  </label>;
}
export default function ReaderTools(props: Props) {
  const [panel, setPanel] = useState<'settings' | 'adjustments' | null>(null);
  const [position, setPosition] = useState({ left: 8, top: 52 });
  const tools = useRef<HTMLDivElement>(null), popup = useRef<HTMLDivElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null), adjustmentsButton = useRef<HTMLButtonElement>(null);
  const onPanel = useRef(props.onPanel); onPanel.current = props.onPanel;
  useEffect(() => { onPanel.current(Boolean(panel)); return () => onPanel.current(false); }, [panel]);
  useLayoutEffect(() => {
    if (!panel) return;
    const reposition = () => {
      const box = (panel === 'settings' ? settingsButton : adjustmentsButton).current?.getBoundingClientRect();
      if (box) setPosition({ left: Math.max(8, Math.min(box.left, window.innerWidth - Math.min(356, window.innerWidth - 16) - 8)), top: Math.min(box.bottom + 12, window.innerHeight - 100) });
    };
    reposition(); window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [panel]);
  useEffect(() => {
    if (!panel) return;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || tools.current?.contains(target) || popup.current?.contains(target)) return;
      // GlassSelect renders its own listbox in a portal.
      if (target instanceof Element && target.closest('[role="listbox"]')) return;
      setPanel(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[role="listbox"]')) return;
      event.preventDefault(); event.stopImmediatePropagation(); setPanel(null);
      (panel === 'settings' ? settingsButton : adjustmentsButton).current?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', key, true); };
  }, [panel]);
  const adjust = <K extends keyof ImageAdjustments>(key: K, value: ImageAdjustments[K]) => props.onAdjustments({ ...props.adjustments, enabled: true, [key]: value });
  return <div className="reader-extra-tools" ref={tools}>
    <button ref={adjustmentsButton} className={panel === 'adjustments' ? 'is-active' : ''} disabled={props.disabled} aria-expanded={panel === 'adjustments'} aria-haspopup="dialog" aria-label="画面调整" title="画面调整" onClick={() => setPanel(panel === 'adjustments' ? null : 'adjustments')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v16M12 4v16M19 4v16M2 9h6M9 15h6M16 7h6" /></svg><span>画面调整</span>
    </button>
    <button ref={settingsButton} className={panel === 'settings' ? 'is-active' : ''} disabled={props.disabled} aria-expanded={panel === 'settings'} aria-haspopup="dialog" aria-label="阅读器设置" title="阅读器设置" onClick={() => setPanel(panel === 'settings' ? null : 'settings')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 3-1 3-3-1-2 4 2 2v2l-2 2 2 4 3-1 1 3h4l1-3 3 1 2-4-2-2v-2l2-2-2-4-3 1-1-3Z"/><circle cx="12" cy="12" r="3" /></svg>
    </button>
    <button data-reader-auto-play className={props.running ? 'is-active' : ''} disabled={props.disabled || props.sorting} onClick={() => { setPanel(null); props.onPlay(); }} aria-pressed={props.running} aria-label={props.running ? '暂停自动阅读' : '开始自动阅读'} title={props.running ? '暂停自动阅读' : '开始自动阅读'}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="reader-play-icon">{props.running ? <path d="M7 5h3v14H7zM14 5h3v14h-3z"/> : <path d="m8 5 11 7-11 7Z"/>}</svg>
    </button>
    {panel && createPortal(<div className="reader-tool-panel" ref={popup} role="dialog" aria-modal="false" aria-label={panel === 'settings' ? '阅读器设置' : '画面调整'} style={{ left: position.left, top: position.top, maxHeight: `calc(100dvh - ${position.top + 12}px)` }} onKeyDown={e => { if (e.key !== 'Escape') e.stopPropagation(); }}>
      <div className="reader-tool-heading"><strong>{panel === 'settings' ? '阅读器设置' : '画面调整'}</strong><button aria-label="关闭面板" onClick={() => setPanel(null)}>×</button></div>
      {panel === 'settings' ? <>
        <div className="reader-tool-section"><strong>页面排序</strong>{props.document ? <p>PDF / EPUB 保持文档原有顺序。</p> : <>
          <GlassSelect value={props.sort} options={PAGE_SORT_OPTIONS.map(option => ({...option, disabled: props.timeSortUnavailable && option.value.startsWith('time')}))} ariaLabel="页面排序" disabled={props.sorting} onChange={props.onSort} />
          <p>{props.timeSortUnavailable ? '当前 Android 文件接口未提供页面修改时间，仅支持文件名排序。' : '仅记住当前漫画。时间缺失的页面排在最后；时间相同按文件名自然升序排列。'}</p>
        </>}{props.error && <p role="alert">{props.error}</p>}</div>
        <div className="reader-tool-section"><strong>自动阅读</strong>
          <Slider label="翻页间隔" value={props.auto.intervalSeconds} min={1} max={60} unit=" 秒" onChange={intervalSeconds => props.onAuto({ ...props.auto, intervalSeconds })} />
          <Slider label="滚动速度" value={props.auto.scrollPixelsPerSecond} min={10} max={400} step={10} unit=" 像素/秒" onChange={scrollPixelsPerSecond => props.onAuto({ ...props.auto, scrollPixelsPerSecond })} />
          <p>单页 / 双页按间隔翻页；全景连续阅读平滑滚动。手动操作或离开窗口即暂停，末尾停止。</p>
        </div>
      </> : <>
        <label className="reader-tool-switch"><span>启用画面调整</span><input type="checkbox" checked={props.adjustments.enabled} onChange={e => props.onAdjustments({ ...props.adjustments, enabled: e.target.checked })} /></label>
        <p className="reader-tool-comparison">{props.adjustments.enabled ? '正在显示调整效果' : '正在显示原图'} · 当前漫画单独保存</p>
        <div className="reader-tool-section"><strong>基础调整</strong>
          <Slider label="亮度" value={props.adjustments.brightness} min={50} max={150} unit="%" onChange={v => adjust('brightness', v)} />
          <Slider label="对比度" value={props.adjustments.contrast} min={50} max={150} unit="%" onChange={v => adjust('contrast', v)} />
          <Slider label="伽马" value={props.adjustments.gamma} min={.5} max={2} step={.05} onChange={v => adjust('gamma', v)} />
        </div>
        <div className="reader-tool-section"><strong>滤镜</strong>
          <Slider label="暖色" value={props.adjustments.warmth} min={0} max={100} unit="%" onChange={v => adjust('warmth', v)} />
          <label className="reader-tool-switch"><span>灰度</span><input type="checkbox" checked={props.adjustments.grayscale} onChange={e => adjust('grayscale', e.target.checked)} /></label>
          <label className="reader-tool-switch"><span>反色</span><input type="checkbox" checked={props.adjustments.invert} onChange={e => adjust('invert', e.target.checked)} /></label>
        </div>
        <div className="reader-tool-section"><strong>图像处理</strong>
          <Slider label="锐化" value={props.adjustments.sharpen} min={0} max={100} unit="%" disabled={props.epub} onChange={v => adjust('sharpen', v)} />
          <Slider label="降噪" value={props.adjustments.denoise} min={0} max={100} unit="%" disabled={props.epub} onChange={v => adjust('denoise', v)} />
          <p>{props.epub ? 'EPUB 章节是排版文档，支持基础调整与滤镜，不进行像素锐化或降噪。' : '保守保护文字、网点与细线。仅处理可见画面，预览最多 400 万像素 / 长边 8192 像素；关闭总开关查看原图。'}</p>
        </div>
        <button className="reader-tool-reset" onClick={() => props.onAdjustments({ ...DEFAULT_ADJUSTMENTS })}>恢复默认</button>
      </>}
    </div>, document.body)}
  </div>;
}
