import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

const arrows = {
  left: 'M16 5L6 12L16 19Z', right: 'M8 5L18 12L8 19Z',
  up: 'M5 16L12 6L19 16Z', down: 'M5 8L12 18L19 8Z',
};

export default function ReaderBookSwitch({ direction, opacity, title, label, onActivate, avoidControls = false }: {
  direction: keyof typeof arrows; opacity: number; title: string; label: string; onActivate: () => void; avoidControls?: boolean;
}) {
  const element = useRef<HTMLButtonElement>(null);
  const [inset, setInset] = useState<number>();
  useLayoutEffect(() => {
    if (!avoidControls || direction !== 'up' && direction !== 'down') { setInset(undefined); return; }
    const stage = element.current?.closest('.reader-stage'), layout = element.current?.closest('.reader-layout');
    if (!stage || !layout) return;
    const controls = [...layout.querySelectorAll(direction === 'up' ? '.reader-toolbar' : '.reader-footer,.mobile-reader-previews')];
    const measure = () => {
      const box = stage.getBoundingClientRect();
      setInset(Math.max(8, ...controls.filter(node => getComputedStyle(node).visibility !== 'hidden').map(node => {
        const rect = node.getBoundingClientRect();
        return (direction === 'up' ? rect.bottom - box.top : box.bottom - rect.top) + 8;
      })));
    };
    measure(); const observer = new ResizeObserver(measure);
    observer.observe(stage); controls.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [avoidControls, direction]);
  const press = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const touched = useRef(false);
  return <button ref={element} type="button" className={`reader-book-switch reader-book-switch-${direction}`}
    style={{ '--book-switch-opacity': opacity, ...(inset === undefined ? {} : direction === 'up' ? { top: inset } : { bottom: inset }) } as CSSProperties & { '--book-switch-opacity': number }} title={title} aria-label={label}
    onPointerDown={event => {
      touched.current = event.pointerType === 'touch';
      press.current = event.pointerType === 'touch' && event.isPrimary && event.button === 0
        ? { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false } : null;
    }}
    onPointerMove={event => {
      const start = press.current;
      if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 8) start.moved = true;
    }}
    onPointerCancel={() => { press.current = null; }}
    onPointerUp={event => {
      const start = press.current; press.current = null;
      if (!start || start.id !== event.pointerId || start.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 8) return;
      // Android WebView can suppress the first compatibility click after a swipe.
      // Activate on a completed touch, then discard its optional duplicate click.
      touched.current = true; event.preventDefault(); event.stopPropagation(); onActivate();
    }}
    onClick={event => {
      if (touched.current && event.detail !== 0) { event.preventDefault(); return; }
      onActivate();
    }}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={arrows[direction]} /></svg>
  </button>;
}
