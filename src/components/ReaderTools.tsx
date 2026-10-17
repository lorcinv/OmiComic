import { t } from '../i18n';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { consumeDismissGesture } from '../hooks/consumeDismissGesture';
import MobileIcon from './MobileIcon';
import { DEFAULT_ADJUSTMENTS, type ImageAdjustments } from '../../electron/shared/readerPreferences';

interface Props {
  disabled: boolean; epub: boolean;
  adjustments: ImageAdjustments; onAdjustments: (value: ImageAdjustments) => void;
  running: boolean; onPlay: () => void; onPanel: (open: boolean) => void;
  mobile?: boolean;
}
function Slider({ label, value, min, max, step = 1, unit = '', disabled = false, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; disabled?: boolean; onChange: (value: number) => void;
}) {
  return <label className="reader-tool-slider"><span>{label}<output>{step < 1 ? value.toFixed(2) : value}{unit}</output></span>
    <input aria-label={label} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={e => onChange(Number(e.target.value))} />
  </label>;
}
export default function ReaderTools(props: Props) {
  const [panel, setPanel] = useState<'adjustments' | null>(null);
  const [position, setPosition] = useState({ left: 8, top: 52 });
  const tools = useRef<HTMLDivElement>(null), popup = useRef<HTMLDivElement>(null);
  const adjustmentsButton = useRef<HTMLButtonElement>(null);
  const onPanel = useRef(props.onPanel); onPanel.current = props.onPanel;
  useLayoutEffect(() => { onPanel.current(Boolean(panel)); return () => onPanel.current(false); }, [panel]);
  useLayoutEffect(() => {
    if (!panel) return;
    const reposition = () => {
      const box = adjustmentsButton.current?.getBoundingClientRect();
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
      consumeDismissGesture(event);
      setPanel(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[role="listbox"]')) return;
      event.preventDefault(); event.stopImmediatePropagation(); setPanel(null);
      adjustmentsButton.current?.focus({ preventScroll: true });
    };
    const back = () => setPanel(null);
    document.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', key, true);
    window.addEventListener('omi-reader-close-panel', back);
    return () => { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', key, true); window.removeEventListener('omi-reader-close-panel', back); };
  }, [panel]);
  const adjust = <K extends keyof ImageAdjustments>(key: K, value: ImageAdjustments[K]) => props.onAdjustments({ ...props.adjustments, enabled: true, [key]: value });
  return <div className="reader-extra-tools" ref={tools}>
    <button ref={adjustmentsButton} className={panel === 'adjustments' ? 'is-active' : ''} disabled={props.disabled} aria-expanded={panel === 'adjustments'} aria-haspopup="dialog" aria-label={t("画面调整")} title={t("画面调整")} onClick={() => setPanel(panel === 'adjustments' ? null : 'adjustments')}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4v16M12 4v16M19 4v16M2 9h6M9 15h6M16 7h6" /></svg><span>{t("画面调整")}</span>
    </button>
    {!props.mobile && <button data-reader-auto-play className={props.running ? 'is-active' : ''} disabled={props.disabled} onClick={() => { setPanel(null); props.onPlay(); }} aria-pressed={props.running} aria-label={props.running ? t("暂停自动阅读") : t("开始自动阅读")} title={props.running ? t("暂停自动阅读") : t("开始自动阅读")}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="reader-play-icon">{props.running ? <path d="M7 5h3v14H7zM14 5h3v14h-3z"/> : <path d="m8 5 11 7-11 7Z"/>}</svg>
    </button>}
    {panel && createPortal(<div className="reader-tool-panel" ref={popup} role="dialog" aria-modal="false" aria-label={t("画面调整")} style={{ left: position.left, top: position.top, maxHeight: `calc(100dvh - ${position.top + 12}px)` }} onKeyDown={e => { if (e.key !== 'Escape') e.stopPropagation(); }}>
      {props.mobile && <div className="reader-tool-heading"><strong>{t("画面调整")}</strong><button aria-label={t("关闭面板")} onClick={() => setPanel(null)}><MobileIcon name="close"/></button></div>}
        {props.mobile && <p className="reader-tool-comparison">{t("全局画面调整 · 应用于所有漫画")}</p>}
        <div className="reader-tool-section"><strong>{t("基础调整")}</strong>
          <Slider label={t("亮度")} value={props.adjustments.brightness} min={50} max={150} unit="%" onChange={v => adjust('brightness', v)} />
          <Slider label={t("对比度")} value={props.adjustments.contrast} min={50} max={150} unit="%" onChange={v => adjust('contrast', v)} />
          <Slider label={t("伽马")} value={props.adjustments.gamma} min={.5} max={2} step={.05} onChange={v => adjust('gamma', v)} />
        </div>
        <div className="reader-tool-section"><strong>{t("滤镜")}</strong>
          <Slider label={t("暖色")} value={props.adjustments.warmth} min={0} max={100} unit="%" onChange={v => adjust('warmth', v)} />
          <label className="reader-tool-switch"><span>{t("灰度")}</span><input type="checkbox" checked={props.adjustments.grayscale} onChange={e => adjust('grayscale', e.target.checked)} /></label>
          <label className="reader-tool-switch"><span>{t("反色")}</span><input type="checkbox" checked={props.adjustments.invert} onChange={e => adjust('invert', e.target.checked)} /></label>
        </div>
        <div className="reader-tool-section"><strong>{t("图像处理")}</strong>
          <Slider label={t("锐化")} value={props.adjustments.sharpen} min={0} max={100} unit="%" disabled={props.epub} onChange={v => adjust('sharpen', v)} />
          <Slider label={t("降噪")} value={props.adjustments.denoise} min={0} max={100} unit="%" disabled={props.epub} onChange={v => adjust('denoise', v)} />
          {props.epub && <p>{t("EPUB 支持基础调整与滤镜。")}</p>}
        </div>
        <button className="reader-tool-reset" onClick={() => props.onAdjustments({ ...DEFAULT_ADJUSTMENTS })}>{t("恢复默认")}</button>
    </div>, document.body)}
  </div>;
}
