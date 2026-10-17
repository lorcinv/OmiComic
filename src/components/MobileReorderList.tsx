import { useEffect, useRef, useState, type ReactNode } from 'react';
export default function MobileReorderList<T>({ items, itemKey, onReorder, render }: {
  items: T[]; itemKey: (item: T) => string; onReorder: (keys: string[]) => void;
  render: (item: T) => ReactNode;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const gesture = useRef<{ key: string; x: number; y: number; target: string; timer: number; active: boolean; element: HTMLDivElement; pointer: number } | null>(null);
  const suppress = useRef(false);
  const cancel = () => { if (gesture.current) { clearTimeout(gesture.current.timer); gesture.current.element.style.transform = ''; } gesture.current = null; setDragging(null); };
  useEffect(() => cancel, []);
  useEffect(() => {
    const move = (event: TouchEvent) => { if (gesture.current?.active) event.preventDefault(); };
    document.addEventListener('touchmove',move,{passive:false});
    return () => document.removeEventListener('touchmove',move);
  }, []);
  return <div className="mobile-reorder-list" onClickCapture={event => { if (suppress.current) { event.preventDefault(); event.stopPropagation(); suppress.current = false; } }}>
    {items.map(item => <div key={itemKey(item)} data-reorder-key={itemKey(item)} className={dragging === itemKey(item) ? 'is-dragging' : ''}
      onContextMenu={event => event.preventDefault()}
      onPointerDown={event => {
        if (event.button !== 0) return;
        cancel(); suppress.current = false;
        const g = { key: itemKey(item), x: event.clientX, y: event.clientY, target: itemKey(item), timer: 0, active: false, element: event.currentTarget, pointer: event.pointerId };
        g.timer = window.setTimeout(() => { g.active = true; suppress.current = true; g.element.setPointerCapture(g.pointer); setDragging(g.key); }, 420);
        gesture.current = g;
      }} onPointerMove={event => {
        const g = gesture.current; if (!g) return;
        if (!g.active) { if (Math.hypot(event.clientX - g.x, event.clientY - g.y) > 9) cancel(); return; }
        event.preventDefault();
        g.element.style.pointerEvents = 'none';
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-reorder-key]');
        g.element.style.pointerEvents = '';
        if (target && target.parentElement === g.element.parentElement) g.target = target.dataset.reorderKey!;
        g.element.style.transform = `translateY(${event.clientY - g.y}px)`;
      }} onPointerUp={event => {
        const g = gesture.current; if (!g) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (g.active) { event.preventDefault(); const keys = items.map(itemKey); const from = keys.indexOf(g.key), to = keys.indexOf(g.target); if (from >= 0 && to >= 0 && from !== to) { keys.splice(from, 1); keys.splice(to, 0, g.key); onReorder(keys); } }
        cancel();
      }} onPointerCancel={cancel} onLostPointerCapture={cancel}>
      {render(item)}
    </div>)}
  </div>;
}

