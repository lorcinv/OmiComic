import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { t } from '../i18n';
const EMPTY_TAGS: string[] = [];

/** Suggestions only read the in-memory tag catalogue; no directory scan or file I/O. */
export default function TagAutocomplete({ value, onChange, allTags, excluded = EMPTY_TAGS, disabled = false, autoFocus = false, onConfirm, onCancel }: {
  value: string; onChange: (value: string) => void; allTags: string[]; excluded?: string[]; disabled?: boolean; autoFocus?: boolean; onConfirm?: () => void; onCancel?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null), strip = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; scroll: number; pointer: number; moved: boolean } | null>(null);
  const suppress = useRef(false), id = useId();
  const [edges, setEdges] = useState({ start: true, end: true });
  const [active, setActive] = useState(-1);
  const query = value.split(/[,，\n]/).at(-1)?.trim().normalize('NFKC').toLocaleLowerCase() ?? '';
  const excludedKey = JSON.stringify(excluded);
  const suggestions = useMemo(() => {
    if (!query) return [];
    const used = new Set([...JSON.parse(excludedKey) as string[], ...value.split(/[,，\n]/).slice(0, -1).map(s => s.trim())]);
    return allTags.filter(tag => !used.has(tag) && tag.normalize('NFKC').toLocaleLowerCase().includes(query))
      .sort((a, b) => Number(!a.toLocaleLowerCase().startsWith(query)) - Number(!b.toLocaleLowerCase().startsWith(query)));
  }, [query, allTags, value, excludedKey]);
  function measure() {
    const el = strip.current; if (!el) return;
    const next = { start: el.scrollLeft < 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 };
    setEdges(old => old.start === next.start && old.end === next.end ? old : next);
  }
  useEffect(() => {
    const el = strip.current; if (!el) return;
    el.scrollLeft = 0; setActive(-1); measure();
    const resize = new ResizeObserver(measure); resize.observe(el);
    const wheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      event.preventDefault();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      el.scrollLeft += delta * (event.deltaMode === 1 ? 24 : event.deltaMode === 2 ? el.clientWidth : 1);
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { resize.disconnect(); el.removeEventListener('wheel', wheel); };
  }, [suggestions]);
  function pick(tag: string) {
    const prefix = value.slice(0, Math.max(value.lastIndexOf(','), value.lastIndexOf('，'), value.lastIndexOf('\n')) + 1);
    onChange(prefix ? `${prefix} ${tag}` : tag); input.current?.focus();
  }
  function stop() {
    const g = gesture.current; gesture.current = null;
    if (g?.moved) window.setTimeout(() => { suppress.current = false; }, 0);
  }
  return <div className="tag-autocomplete">
    <input ref={input} autoFocus={autoFocus} disabled={disabled} aria-label={t('新标签')} placeholder={t('输入标签，逗号分隔')}
      autoComplete="off" value={value} aria-controls={suggestions.length ? id : undefined}
      onChange={event => onChange(event.target.value)} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        const enabled = suggestions.map((_, index) => index);
        if (enabled.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          event.preventDefault(); const at = enabled.indexOf(active); const next = enabled[(at + (event.key === 'ArrowDown' ? 1 : enabled.length - 1) + enabled.length) % enabled.length];
          setActive(next); strip.current?.children[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } else if (enabled.length && ((event.key === 'Enter' && active >= 0) || event.key === 'Tab')) {
          event.preventDefault(); pick(suggestions[active >= 0 ? active : enabled[0]]); setActive(-1);
        } else if (event.key === 'Enter' && onConfirm) { event.preventDefault(); event.stopPropagation(); onConfirm(); }
        else if (event.key === 'Escape' && onCancel) { event.preventDefault(); event.stopPropagation(); onCancel(); }
      }} />
    {suggestions.length > 0 && <div ref={strip} id={id} className="tag-completion-strip" role="group" aria-label={t('标签联想')}
      data-at-start={edges.start} data-at-end={edges.end} onScroll={measure}
      onAuxClick={event => { if (event.button === 1) event.preventDefault(); }}
      onPointerDown={event => {
        if (event.pointerType !== 'mouse' || ![0, 1].includes(event.button)) return;
        if (event.button === 1) event.preventDefault();
        suppress.current = false;
        gesture.current = { x: event.clientX, scroll: event.currentTarget.scrollLeft, pointer: event.pointerId, moved: false };
      }} onPointerMove={event => {
        const g = gesture.current; if (!g) return;
        if (!g.moved && Math.abs(event.clientX - g.x) < 5) return;
        if (!g.moved) { g.moved = true; suppress.current = true; event.currentTarget.setPointerCapture(g.pointer); }
        event.preventDefault(); event.currentTarget.scrollLeft = g.scroll + g.x - event.clientX;
      }} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onClickCapture={event => { if (suppress.current) { event.preventDefault(); event.stopPropagation(); } }}>
      {suggestions.map((tag, index) => <button key={tag} type="button" disabled={disabled} title={tag} className={index === active ? 'is-active' : ''}
        onPointerDown={event => { if (event.pointerType === 'mouse') event.preventDefault(); }} onClick={() => pick(tag)}>{tag}</button>)}
    </div>}
  </div>;
}
