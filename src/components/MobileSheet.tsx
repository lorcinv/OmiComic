import { tr, t } from '../i18n';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { takeDrawerGesture } from '../hooks/mobileDrawerGesture';
import { useMobileScrim } from '../hooks/mobileScrim';
const sheets: HTMLElement[] = [];
export const MOBILE_SHEET_MOTION_MS = 180;
export function dismissMobileSheet(afterClose?: () => void): void {
  window.dispatchEvent(new CustomEvent('omi-mobile-sheet-dismiss', { detail: afterClose }));
}
export default function MobileSheet({ title, onClose, beforeClose, children, side = false, showClose = true }: { title: string; onClose: () => void; beforeClose?: () => boolean; children: ReactNode; side?: boolean | 'right'; showClose?: boolean }) {
  const panel = useRef<HTMLElement>(null), backdrop = useRef<HTMLDivElement>(null);
  const scrim = useMobileScrim(true, 0);
  const close = useRef(onClose); close.current = onClose;
  const guard = useRef(beforeClose); guard.current = beforeClose;
  const motion = useRef<Animation | null>(null);
  const progress = useRef(0), closing = useRef(false);
  const initialGesture = useRef<ReturnType<typeof takeDrawerGesture> | undefined>(undefined);
  const swipe = useRef<{ x: number; y: number; initial: number; lastX: number; lastTime: number; velocity: number; horizontal: boolean } | null>(null);
  const direction = side === 'right' ? 1 : -1;
  const transform = (value: number) => side ? `translate3d(${direction*(1-value)*100}%,0,0)` : `translate3d(0,${(1-value)*100}%,0)`;
  function paint(value: number) {
    progress.current=value;
    if(panel.current)panel.current.style.transform=transform(value);
    scrim.set(value);
  }
  function stop() {
    const element=panel.current;
    if(element && motion.current) {
      const matrix=new DOMMatrixReadOnly(getComputedStyle(element).transform);
      progress.current=Math.max(0,Math.min(1,1-(side?Math.abs(matrix.m41)/element.clientWidth:Math.abs(matrix.m42)/element.clientHeight)));
    }
    motion.current?.cancel();motion.current=null;
    paint(progress.current);
  }
  function settle(to: number, afterClose?: () => void) {
    stop();swipe.current=null;
    if(!to && guard.current && !guard.current())to=1;
    closing.current=to===0;
    const element=panel.current,from=progress.current;
    const finish=()=>{paint(to);if(element)element.style.willChange='';if(!to){close.current();afterClose?.();}};
    if(!element || matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(to-from)<.001){finish();return;}
    element.style.willChange='transform';
    const options={duration:Math.max(80,MOBILE_SHEET_MOTION_MS*Math.abs(to-from)),easing:'cubic-bezier(.2,.7,.2,1)',fill:'both' as const};
    const animation=element.animate([{transform:transform(from)},{transform:transform(to)}],options);
    scrim.set(to, options.duration);
    motion.current=animation;
    animation.finished.then(()=>{
      if(motion.current!==animation)return;
      // Commit the endpoint before cancelling, so unmount cannot flash it open.
      paint(to);animation.cancel();motion.current=null;finish();
    }).catch(()=>undefined);
  }
  const settleRef=useRef(settle);settleRef.current=settle;
  useLayoutEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const element=panel.current!;sheets.push(element);
    const isTop=()=>sheets.at(-1)===element&&!document.querySelector('.root-delete-overlay,.settings-window-overlay');
    const back=(event:Event)=>{if(!isTop())return;event.preventDefault();event.stopImmediatePropagation();if(document.querySelector('.reader-tool-panel'))window.dispatchEvent(new Event('omi-reader-close-panel'));else settleRef.current(0);};
    const dismiss=(event:Event)=>{if(isTop())settleRef.current(0,(event as CustomEvent<(()=>void)|undefined>).detail);};
    const key=(event:KeyboardEvent)=>{
      if(!isTop()||document.querySelector('[role="listbox"],.reader-tool-panel'))return;
      if(event.key==='Escape')back(event);
      if(event.key!=='Tab')return;
      const items=[...element.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
      if(event.shiftKey&&(document.activeElement===items[0]||document.activeElement===element)){event.preventDefault();items.at(-1)?.focus();}
      else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0]?.focus();}
    };
    if(initialGesture.current===undefined)initialGesture.current=side?takeDrawerGesture(side==='right'?'right':'left'):null;
    const opening=initialGesture.current;
    if(opening){
      swipe.current={x:opening.x,y:opening.y,initial:0,lastX:opening.currentX,lastTime:performance.now(),velocity:0,horizontal:true};
      element.style.willChange='transform';paint(Math.max(0,Math.min(1,(opening.currentX-opening.x)*-direction/element.clientWidth)));
    }else{element.focus({preventScroll:true});settleRef.current(1);}
    const down=(event:TouchEvent)=>{
      if(!side||!isTop()||event.touches.length!==1)return;
      const target=event.target as Element;
      if(!element.parentElement?.contains(target)||target.closest('input,textarea,[role="slider"]'))return;
      const t=event.touches[0];stop();closing.current=false;
      swipe.current={x:t.clientX,y:t.clientY,initial:progress.current,lastX:t.clientX,lastTime:performance.now(),velocity:0,horizontal:false};
    };
    const move=(event:TouchEvent)=>{
      const g=swipe.current,t=event.touches[0];if(!g||!t||!isTop())return;
      const dx=t.clientX-g.x,dy=t.clientY-g.y;
      if(!g.horizontal){
        if(Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){swipe.current=null;settleRef.current(1);return;}
        if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(dy)*1.25)return;
        g.horizontal=true;element.style.willChange='transform';
      }
      event.preventDefault();event.stopPropagation();
      const now=performance.now(),elapsed=now-g.lastTime;
      if(elapsed>0)g.velocity=(t.clientX-g.lastX)*-direction/Math.max(8,elapsed);
      g.lastX=t.clientX;g.lastTime=now;
      paint(Math.max(0,Math.min(1,g.initial+dx*-direction/element.clientWidth)));
    };
    const end=(event:TouchEvent)=>{
      const g=swipe.current;swipe.current=null;
      if(!g?.horizontal){if(g)settleRef.current(1);return;}
      event.preventDefault();event.stopImmediatePropagation();
      const velocity=performance.now()-g.lastTime<100?g.velocity:0;
      settleRef.current(event.type==='touchcancel'?(g.initial>.5?1:0):Math.abs(velocity)>.35?(velocity>0?1:0):progress.current>.5?1:0);
    };
    window.addEventListener('keydown',key,true);window.addEventListener('omi-library-back',back,true);window.addEventListener('omi-reader-back',back,true);window.addEventListener('omi-mobile-sheet-dismiss',dismiss);
    window.addEventListener('touchstart',down,{capture:true,passive:true});window.addEventListener('touchmove',move,{capture:true,passive:false});window.addEventListener('touchend',end,{capture:true,passive:false});window.addEventListener('touchcancel',end,{capture:true,passive:false});
    return()=>{
      motion.current?.cancel();const index=sheets.indexOf(element);if(index>=0)sheets.splice(index,1);
      window.removeEventListener('keydown',key,true);window.removeEventListener('omi-library-back',back,true);window.removeEventListener('omi-reader-back',back,true);window.removeEventListener('omi-mobile-sheet-dismiss',dismiss);
      window.removeEventListener('touchstart',down,true);window.removeEventListener('touchmove',move,true);window.removeEventListener('touchend',end,true);window.removeEventListener('touchcancel',end,true);
      if(previous?.isConnected)previous.focus({preventScroll:true});
    };
  },[]);
  return createPortal(<div className={`mobile-sheet-overlay ${side?'is-side-drawer':''} ${side==='right'?'is-right-drawer':''}`} onClick={event=>{if(event.target===event.currentTarget||event.target===backdrop.current){event.preventDefault();event.stopPropagation();if(!closing.current)settle(0);}}}>
    <div className="mobile-sheet-backdrop" ref={backdrop} style={{opacity:0}} aria-hidden="true"/>
    <section className="mobile-sheet" ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
      <div className="mobile-sheet-handle" aria-hidden="true"/>
      <header className="mobile-sheet-heading"><h2>{title}</h2>{!side&&showClose&&<button onClick={()=>settle(0)} aria-label={tr`关闭${title}`}>{t("完成")}</button>}</header>
      <div className="mobile-sheet-content">{children}</div>
    </section>
  </div>,document.body);
}
