import { t, tr } from '../i18n';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import ResourcePlaceholder from './ResourcePlaceholder';
import MobileIcon from './MobileIcon';
import type { 资源类型 } from '../types';

export interface MobileResourceCardProps {
  id: string; index?: number; bookmarkId?: string; title: string; type: 资源类型; thumbnail?: string | null;
  layout: 'grid' | 'list'; pages?: string; size?: string; bookmarkDate?: string; tags?: string[]; invalid?: boolean;
  favorite?: boolean; onFavorite?: () => void; onInfo?: () => void;
  onOpen: () => void; onHold: () => void; selecting: boolean; selected: boolean; onSelect: () => void;
  sorting?: boolean; onReorder?: (from: string, to: string) => void;
}
export default function MobileResourceCard(p: MobileResourceCardProps) {
  const gesture = useRef<{ x: number; y: number; timer: number; active: boolean; element: HTMLElement } | null>(null);
  const suppress = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [p.thumbnail]);
  const cancel = () => { if (gesture.current) { clearTimeout(gesture.current.timer); gesture.current.element.style.transform = ''; } gesture.current = null; setDragging(false); };
  useEffect(() => cancel, []);
  function down(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button,input')) return;
    cancel(); suppress.current = false;
    const g = { x: event.clientX, y: event.clientY, timer: 0, active: Boolean(p.sorting), element: event.currentTarget };
    if (p.sorting) event.currentTarget.setPointerCapture(event.pointerId);
    else g.timer = window.setTimeout(() => { suppress.current = true; p.onHold(); }, 450);
    gesture.current = g;
  }
  function move(event: PointerEvent<HTMLElement>) {
    const g = gesture.current; if (!g) return;
    if (!g.active) { if (Math.hypot(event.clientX - g.x, event.clientY - g.y) > 9) cancel(); return; }
    if (Math.hypot(event.clientX - g.x, event.clientY - g.y) > 6) {
      suppress.current = true; setDragging(true); event.preventDefault();
      g.element.style.transform = `translate(${event.clientX - g.x}px,${event.clientY - g.y}px)`;
      const scroll = g.element.closest('.resource-list-scroll');
      if (scroll) { const rect = scroll.getBoundingClientRect(); if (event.clientY < rect.top + 40) scroll.scrollTop -= 12; else if (event.clientY > rect.bottom - 40) scroll.scrollTop += 12; }
    }
  }
  function up(event: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    // Release before React moves the captured card to its new position.
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (g?.active && suppress.current) {
      g.element.style.pointerEvents = 'none';
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-selection-key]');
      g.element.style.pointerEvents = '';
      if (target?.dataset.selectionKey && target.dataset.selectionKey !== p.id) p.onReorder?.(p.id, target.dataset.selectionKey);
    }
    cancel();
  }
  const open = () => { if (suppress.current) { suppress.current = false; return; } if (p.sorting) return; p.selecting ? p.onSelect() : p.onOpen(); };
  const favorite = p.onFavorite && <button className={`mobile-card-favorite ${p.favorite ? 'is-active' : ''}`} aria-label={p.favorite ? t("取消收藏") : t("收藏")} aria-pressed={p.favorite} onClick={event => { event.stopPropagation(); p.onFavorite!(); }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}><MobileIcon name="heart"/></button>;
  return <article className={`resource-card mobile-resource-card ${p.selected ? 'is-selected' : ''} ${p.invalid ? 'is-path-invalid' : ''} ${dragging ? 'is-touch-dragging' : ''} ${p.sorting ? 'is-touch-sortable' : ''}`} tabIndex={0} role="button" aria-label={p.title} data-selection-key={p.id} data-bookmark-card-id={p.bookmarkId} data-library-index={p.index}
    onClick={open} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(); } }}
    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); suppress.current = true; cancel(); p.onHold(); }} onMouseDown={event => event.stopPropagation()} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
    <div className="resource-preview" onClick={event => { if (p.layout === 'list' && p.onInfo && !p.selecting && !suppress.current) { event.stopPropagation(); p.onInfo(); } }}>
      {p.thumbnail && !failed ? <img src={p.thumbnail} alt="" loading="eager" draggable={false} onError={() => setFailed(true)} /> : <ResourcePlaceholder type={p.type} />}
      {p.layout === 'grid' && !p.selecting && favorite}
      {p.invalid && <span className="mobile-card-missing">{t("文件不可用")}</span>}
      {p.selecting && <span className="mobile-card-selection" role="checkbox" aria-label={tr`选择 ${p.title}`} aria-checked={p.selected}/>}
    </div>
    <div className="resource-details"><strong>{p.title}</strong>{p.layout === 'list' && !!p.tags?.length && <span className="mobile-card-tags">{p.tags.slice(0,4).join(' · ')}</span>}</div>
    <div className="mobile-card-meta"><span className="mobile-card-pages">{p.pages}{p.pages && p.size ? ' ' : ''}{p.size}</span>{p.bookmarkDate && <><span aria-hidden="true">·</span><time className="mobile-bookmark-date">{p.bookmarkDate}</time></>}</div>
    {p.layout === 'list' && !p.selecting && favorite}
    {!p.selecting && <div className="mobile-card-actions">{p.onInfo && <button className="mobile-card-info" aria-label={t("打开资源信息")} onClick={event => { event.stopPropagation(); p.onInfo!(); }}><MobileIcon name="dots"/></button>}</div>}
  </article>;
}
