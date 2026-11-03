import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';

export default function TagSortList({ tags, selecting, selected, onToggle, onReorder }: {
  tags: string[]; selecting: boolean; selected: ReadonlySet<string>; onToggle: (tag: string) => void; onReorder: (tags: string[]) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ tag: string; x: number; y: number; element: HTMLElement; active: boolean; target: string; after: boolean } | null>(null);
  const suppress = useRef(false);
  const [drag, setDrag] = useState<{ tag: string; target: string; after: boolean } | null>(null);
  function cancel() { if (gesture.current) gesture.current.element.style.transform = ''; gesture.current = null; setDrag(null); }
  useEffect(() => cancel, []);
  function finish(commit: boolean) {
    const g = gesture.current;
    if (g?.active && commit && g.tag !== g.target) {
      const keys = tags.filter(tag => tag !== g.tag), at = keys.indexOf(g.target);
      if (at >= 0) { keys.splice(at + Number(g.after), 0, g.tag); onReorder(keys); }
    }
    if (g?.active) window.setTimeout(() => { suppress.current = false; }, 0);
    cancel();
  }
  return <div ref={list} className={`tag-sort-list ${selecting ? 'is-selecting' : ''} ${drag ? 'is-sorting' : ''}`} role="group" aria-label={t('全部标签')}
    onClickCapture={event => { if (suppress.current) { event.preventDefault(); event.stopPropagation(); } }}>
    {tags.map((tag, index) => <div key={tag} data-tag-sort={tag}
      className={`tag-sort-item ${drag?.tag === tag ? 'is-dragging' : ''} ${drag?.target === tag && drag.tag !== tag ? drag.after ? 'drop-after' : 'drop-before' : ''}`}
      onContextMenu={event => event.preventDefault()} onPointerDown={event => {
        if (event.button !== 0) return;
        cancel(); suppress.current = false;
        gesture.current = { tag, x: event.clientX, y: event.clientY, element: event.currentTarget, active: false, target: tag, after: false };
      }} onPointerMove={event => {
        const g = gesture.current; if (!g) return;
        if (!g.active && Math.hypot(event.clientX - g.x, event.clientY - g.y) < 6) return;
        if (!g.active) { g.active = true; suppress.current = true; event.currentTarget.setPointerCapture(event.pointerId); }
        event.preventDefault();
        const candidates = [...list.current!.querySelectorAll<HTMLElement>('[data-tag-sort]')].filter(el => el !== g.element);
        let nearest: HTMLElement | undefined, distance = Infinity;
        for (const el of candidates) {
          const box = el.getBoundingClientRect();
          const score = Math.abs(event.clientY - (box.top + box.height / 2)) * 3 + Math.abs(event.clientX - (box.left + box.width / 2));
          if (score < distance) { nearest = el; distance = score; }
        }
        if (nearest) { const box = nearest.getBoundingClientRect(); g.target = nearest.dataset.tagSort!; g.after = event.clientX > box.left + box.width / 2; }
        g.element.style.transform = `translate3d(${event.clientX - g.x}px,${event.clientY - g.y}px,0)`;
        setDrag({ tag: g.tag, target: g.target, after: g.after });
      }} onPointerUp={() => finish(true)} onPointerCancel={() => finish(false)} onLostPointerCapture={event => { if (event.target === event.currentTarget) finish(false); }}>
      <button type="button" className={`tag-filter-chip tag-catalogue-chip ${selected.has(tag) ? selecting ? 'is-management-selected' : 'is-active' : ''}`}
        style={{ animationDelay: `${index % 4 * -45}ms` }} aria-pressed={selected.has(tag)} title={t('拖动标签排序，点击选择')}
        onClick={() => onToggle(tag)} onKeyDown={event => {
          if (!event.altKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); const to = index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1);
          if (to >= 0 && to < tags.length) { const next = [...tags]; [next[index], next[to]] = [next[to], next[index]]; onReorder(next); }
        }}>
        <span>{tag}</span>
      </button>
    </div>)}
    {!tags.length && <p className="drawer-muted">{t('暂无标签')}</p>}
  </div>;
}
