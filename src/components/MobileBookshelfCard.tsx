import { useEffect, useRef, type ReactNode } from 'react';

export default function MobileBookshelfCard({ id, title, onOpen, onManage, children, sorting, onReorder, selecting, selected, onSelect }: {
  id: string; title: string; onOpen: () => void; onManage: () => void; children: ReactNode; sorting?: boolean; onReorder?: (from:string,to:string)=>void;
  selecting?: boolean; selected?: boolean; onSelect?: () => void;
}) {
  const hold = useRef<{timer:number;x:number;y:number}|null>(null);
  const suppress = useRef(false);
  const drag = useRef<{x:number;y:number;el:HTMLElement}|null>(null);
  const cancel = () => { if (hold.current) clearTimeout(hold.current.timer); hold.current = null; };
  useEffect(() => cancel, []);
  const open = () => { if (!sorting) { if (selecting) onSelect?.(); else onOpen(); } };
  return <article className={`bookshelf-folder-card mobile-bookshelf-card ${selected ? 'is-selected' : ''} ${sorting ? 'is-touch-sortable' : ''}`} data-shelf-id={id} role="button" tabIndex={0} aria-label={title} aria-pressed={selecting ? Boolean(selected) : undefined}
    onClick={() => { if (suppress.current) { suppress.current=false; return; } open(); }}
    onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } }}
    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); cancel(); suppress.current=true; if (!sorting) onManage(); }}
    onPointerDown={event => { if (event.button !== 0) return; cancel(); suppress.current=false; if(sorting) {drag.current={x:event.clientX,y:event.clientY,el:event.currentTarget};event.currentTarget.setPointerCapture(event.pointerId);return;} hold.current={x:event.clientX,y:event.clientY,timer:window.setTimeout(() => { suppress.current=true; onManage(); },450)}; }}
    onPointerMove={event => {const d=drag.current;if(d){event.preventDefault();suppress.current=true;d.el.style.transform=`translate(${event.clientX-d.x}px,${event.clientY-d.y}px)`;d.el.style.zIndex='2';return;} const g=hold.current; if(g && Math.hypot(g.x-event.clientX,g.y-event.clientY)>9) cancel(); }}
    onPointerUp={event => {const d=drag.current;drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);if(d){d.el.style.pointerEvents='none';const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-shelf-id]');d.el.style.pointerEvents='';d.el.style.transform='';d.el.style.zIndex='';if(target?.dataset.shelfId && target.dataset.shelfId!==id)onReorder?.(id,target.dataset.shelfId);}cancel();}}
    onPointerCancel={() => {if(drag.current){drag.current.el.style.transform='';drag.current.el.style.zIndex='';drag.current=null;}cancel();}}>{children}</article>;
}
