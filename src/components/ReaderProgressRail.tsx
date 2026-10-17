import { t } from '../i18n';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type PointerEventHandler } from 'react';

interface Props {
  mobile: boolean; percent: number; current: number; total: number; label: string; rtl: boolean; dragging: boolean;
  onStart: PointerEventHandler<HTMLDivElement>; onMove: PointerEventHandler<HTMLDivElement>;
  onEnd: PointerEventHandler<HTMLDivElement>; onCancel: PointerEventHandler<HTMLDivElement>; onJump: (index: number) => void;
}
export default function ReaderProgressRail(p: Props) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = () => { clearTimeout(timer.current); timer.current=undefined; setVisible(true); };
  const hide = () => { if (!timer.current) timer.current = setTimeout(() => { timer.current=undefined; setVisible(false); }, 1500); };
  const proximity = (event: PointerEvent<HTMLDivElement>) => {
    const box=event.currentTarget.getBoundingClientRect();
    const x=box.left+box.width*(p.rtl ? 1-p.percent/100 : p.percent/100);
    if (Math.abs(event.clientX-x)<=22 && Math.abs(event.clientY-(box.top+box.height/2))<=24) { show(); timer.current=undefined; } else hide();
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return <div className={`reader-progress-rail ${p.rtl ? 'is-rtl' : ''} ${p.dragging ? 'is-dragging' : ''}`}
    style={{ '--reader-progress': `${p.percent}%` } as CSSProperties} role="slider" tabIndex={0} aria-label={t("阅读进度")}
    aria-valuemin={1} aria-valuemax={Math.max(1,p.total)} aria-valuenow={Math.max(1,p.current)} aria-valuetext={p.label}
    onPointerEnter={proximity} onPointerLeave={hide} onFocus={e => { if(e.currentTarget.matches(':focus-visible')) show(); }} onBlur={hide}
    onPointerDown={e => { proximity(e); p.onStart(e); }} onPointerMove={e => { proximity(e); p.onMove(e); }}
    onPointerUp={e => { p.onEnd(e); if (!e.currentTarget.matches(':hover')) hide(); }} onPointerCancel={p.onCancel} onLostPointerCapture={p.onCancel}
    onKeyDown={e => {
      const step = e.key === 'ArrowRight' ? (p.rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (p.rtl ? 1 : -1) : 0;
      if (step || e.key === 'Home' || e.key === 'End') { e.preventDefault(); show(); p.onJump(e.key === 'Home' ? 0 : e.key === 'End' ? p.total-1 : p.current-1+step); }
    }}>
    {!p.mobile && (visible || p.dragging) && <output className="reader-progress-label">{p.label}</output>}
    <span className="reader-progress-fill" aria-hidden="true"/><span className="reader-progress-thumb" aria-hidden="true"/>
  </div>;
}
