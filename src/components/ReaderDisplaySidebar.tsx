import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import { consumeDismissGesture } from '../hooks/consumeDismissGesture';
import { FIT_MODE_OPTIONS, type ImageAdjustments } from '../../electron/shared/readerPreferences';
import { ReaderAdjustmentControls } from './ReaderTools';

export default function ReaderDisplaySidebar({ open, onClose, fitMode, onFit, fitDisabled, adjustments, onAdjustments, epub, splitControl }: {
  open: boolean; onClose: () => void; fitMode: string; onFit: (value: 'fit-window'|'fit-height'|'fit-width'|'original') => void;
  fitDisabled: boolean; adjustments: ImageAdjustments; onAdjustments: (value: ImageAdjustments) => void; epub: boolean; splitControl: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null), close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    panel.current?.focus({preventScroll:true});
    const outside = (event: PointerEvent) => {
      const node=event.target;
      if(node instanceof Node && (panel.current?.contains(node) || node instanceof Element && node.closest('[data-reader-more]')))return;
      consumeDismissGesture(event,true);close.current();
    };
    const key = (event: KeyboardEvent) => { if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close.current();} };
    const back = () => close.current();
    document.addEventListener('pointerdown',outside,true);window.addEventListener('keydown',key,true);window.addEventListener('omi-reader-close-panel',back);
    return () => {document.removeEventListener('pointerdown',outside,true);window.removeEventListener('keydown',key,true);window.removeEventListener('omi-reader-close-panel',back);if(previous instanceof HTMLElement && previous.isConnected)previous.focus({preventScroll:true});};
  },[open]);
  if(!open)return null;
  return createPortal(<aside ref={panel} tabIndex={-1} className="reader-tool-panel reader-display-sidebar" role="dialog" aria-modal="false" aria-label={t('阅读设置')} onKeyDown={event=>event.stopPropagation()}>
    <div className="reader-sidebar-heading"><strong>{t('阅读设置')}</strong></div>
    <div className="reader-sidebar-content">
      <section className="reader-tool-section"><strong>{t('适应方式')}</strong><div className="reader-fit-options" role="group" aria-label={t('适应方式')}>
        {FIT_MODE_OPTIONS.map(option=><button key={option.value} disabled={fitDisabled} aria-pressed={fitMode===option.value} onClick={()=>onFit(option.value)}>{t(option.label)}</button>)}
      </div></section>
      <section className="reader-tool-section reader-sidebar-split">{splitControl}</section>
      <ReaderAdjustmentControls adjustments={adjustments} onAdjustments={onAdjustments} epub={epub}/>
    </div>
  </aside>,document.body);
}
