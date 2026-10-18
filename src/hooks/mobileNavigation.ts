import { flushSync } from 'react-dom';
import { androidCall, androidNotify, hasAndroidRenderer } from '../android/bridge';

type Direction = 'forward' | 'back' | 'replace' | 'tab-next' | 'tab-prev' | 'folder' | 'detail' | 'detail-back' | 'home-expand' | 'home-collapse';
export type MobileNavigationOrigin = {left:number;top:number;width:number;height:number;selectionKey?:string};
let serial = 0;
let active: ViewTransition | null = null;
let activeCleanup: (()=>void) | null = null;
let homeOrigin={x:36,y:40};
let suspended = false;
let motionEpoch = 0;

/** Capture before async data/reader preparation, not after it finishes. */
export const mobileNavigationEpoch = (): number => motionEpoch;

/** Finish navigation state on backgrounding, but never replay its animation
 * when the existing Activity returns from the launcher or another app. */
export function observeMobileNavigationLifecycle(): () => void {
  const pause = () => {
    suspended = true;
    motionEpoch++;
    active?.skipTransition();
    if (hasAndroidRenderer()) androidNotify('cancelScene', {});
  };
  const resume = () => { suspended = false; };
  const visibility = () => { if (document.hidden) pause(); else resume(); };
  // omi-pause also means "stop autoplay" inside EPUB content. Only Activity
  // lifecycle events may suspend navigation until the next foreground entry.
  window.addEventListener('omi-app-pause', pause);
  window.addEventListener('omi-app-resume', resume);
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', resume);
  document.addEventListener('visibilitychange', visibility);
  visibility();
  return () => {
    window.removeEventListener('omi-app-pause', pause);
    window.removeEventListener('omi-app-resume', resume);
    window.removeEventListener('pagehide', pause);
    window.removeEventListener('pageshow', resume);
    document.removeEventListener('visibilitychange', visibility);
    suspended = false;
    cancelMobileNavigation();
  };
}

function findCover(origin?:MobileNavigationOrigin):HTMLElement|null {
  if(!origin?.selectionKey)return null;
  // Coordinates identify a position, not a comic: renaming or editing tags can
  // reorder the list while details are open. Never animate to its new occupant.
  const card=[...document.querySelectorAll<HTMLElement>('.page-panel.is-visible .mobile-resource-card')]
    .find(node=>node.dataset.selectionKey===origin.selectionKey);
  const cover=card?.querySelector<HTMLElement>('.resource-preview');
  if(!card||!cover)return null;
  const r=cover.getBoundingClientRect(),clip=card.closest('.resource-list-scroll')?.getBoundingClientRect();
  if(r.width<=0||r.height<=0||r.right<=Math.max(0,clip?.left??0)||r.left>=Math.min(innerWidth,clip?.right??innerWidth)
    ||r.bottom<=Math.max(0,clip?.top??0)||r.top>=Math.min(innerHeight,clip?.bottom??innerHeight))return null;
  return cover.querySelector<HTMLElement>('img')??cover;
}
function detailCover():HTMLElement|null {
  const cover=document.querySelector<HTMLElement>('.page-panel.is-visible .resource-detail-cover');
  return cover?.querySelector<HTMLElement>('img')??cover;
}

/** Capture the outgoing frame before committing navigation. A newer navigation
 * supersedes a pending capture; it must never be overwritten by an older one. */
export async function mobileNavigate(update: () => void, direction: Direction = 'forward', prepared?: () => Promise<void>, origin?:MobileNavigationOrigin, epoch = motionEpoch): Promise<void> {
  const id = ++serial;
  const previous = active;
  previous?.skipTransition();
  if (previous) await previous.updateCallbackDone.catch(() => undefined);
  if (id !== serial) return;
  activeCleanup?.();activeCleanup=null;
  const root = document.documentElement;
  if (suspended || document.hidden || epoch !== motionEpoch) {
    active = null;
    delete root.dataset.mobileNavigation;
    if (hasAndroidRenderer()) androidNotify('cancelScene', {});
    flushSync(update);
    await prepared?.();
    return;
  }
  const radial=direction==='home-expand'||direction==='home-collapse';
  const setRadialOrigin=()=>{
    const icon=document.querySelector('.omi-home .omi-page-brand .omi-brand-icon')?.getBoundingClientRect();
    if(icon&&icon.width>0&&icon.height>0)homeOrigin={x:icon.left+icon.width/2,y:icon.top+icon.height/2};
    root.style.setProperty('--mobile-home-x',`${homeOrigin.x}px`);root.style.setProperty('--mobile-home-y',`${homeOrigin.y}px`);
    root.style.setProperty('--mobile-home-radius',`${Math.hypot(Math.max(homeOrigin.x,innerWidth-homeOrigin.x),Math.max(homeOrigin.y,innerHeight-homeOrigin.y))+2}px`);
  };
  if(radial)setRadialOrigin();
  const restored:Array<()=>void>=[];
  let restoredOnce=false;
  const restore=()=>{if(restoredOnce)return;restoredOnce=true;for(const undo of restored.reverse())undo();if(radial)for(const name of ['--mobile-home-x','--mobile-home-y','--mobile-home-radius'])root.style.removeProperty(name);};
  const name=(node:HTMLElement|null,value:string)=>{
    if(!node)return;
    const original=node.style.viewTransitionName;
    node.style.viewTransitionName=value;
    restored.push(()=>{node.style.viewTransitionName=original;});
  };
  const clean = () => {
    restore();
    if (id !== serial) return;
    active = null;
    activeCleanup=null;
    delete root.dataset.mobileNavigation;
    for(const name of ['--mobile-home-x','--mobile-home-y','--mobile-home-radius'])root.style.removeProperty(name);
  };
  // Keep named web snapshots for tabs/details. A cold, full-screen WebView
  // reveal can spend its animation time preparing the first composited frame.
  // Android's home reveal starts on RenderThread after that frame is committed.
  const nativeHomeScene=hasAndroidRenderer()&&radial&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
  const webLibraryScene=!nativeHomeScene&&Boolean(document.startViewTransition)&&!root.dataset.nativeReader&&['tab-next','tab-prev','folder','detail','detail-back','home-expand','home-collapse'].includes(direction);
  // A previous native PixelCopy may still be pending. Invalidate its generation
  // before starting a web-only transition, so its late screenshot cannot cover
  // the new UI. A newer native beginScene performs this cleanup itself.
  if(hasAndroidRenderer()&&webLibraryScene)androidNotify('cancelScene',{});
  if(hasAndroidRenderer()&&!webLibraryScene){
    let committed=false;
    try{
      await androidCall('beginScene',{request:id});
      if(id!==serial)return;
      committed=true;flushSync(update);await prepared?.();
      if(id!==serial)return;
      if(suspended||epoch!==motionEpoch){androidNotify('cancelScene',{});return;}
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      if(id!==serial)return;
      if(suspended||epoch!==motionEpoch||matchMedia('(prefers-reduced-motion: reduce)').matches)androidNotify('cancelScene',{});
      else {if(radial)setRadialOrigin();await androidCall('commitScene',{request:id,direction,origin:homeOrigin,viewportWidth:innerWidth});}
    }catch{if(id===serial){if(!committed)flushSync(update);androidNotify('cancelScene',{});}}
    finally{clean();}
    return;
  }
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    flushSync(update);
    clean();
    return;
  }
  root.dataset.mobileNavigation = direction;
  activeCleanup=restore;
  const detail=direction==='detail'||direction==='detail-back';
  let source:HTMLElement|null=null;
  if(detail){source=direction==='detail'?findCover(origin):detailCover();name(source,'mobile-detail-cover');}
  if(direction.startsWith('tab-')||direction==='folder')name(document.querySelector<HTMLElement>('.page-panel.is-visible .sidebar-primary-nav'),'mobile-primary-nav');
  let committed = false;
  try {
    const transition = document.startViewTransition(async () => {
      if (id !== serial) return;
      committed = true;
      if(source)source.style.viewTransitionName='';
      flushSync(update);
      await prepared?.();
      if(id===serial&&radial)setRadialOrigin();
      if(id===serial&&detail)name(direction==='detail'?detailCover():findCover(origin),'mobile-detail-cover');
    });
    active = transition;
    // Rejection is expected when a rapid second navigation skips the capture.
    void transition.ready.catch(() => undefined);
    await transition.finished.catch(() => undefined);
  } catch {
    if (!committed && id === serial) flushSync(update);
  } finally { clean(); }
}

export function cancelMobileNavigation(): void {
  serial++;
  active?.skipTransition();
  activeCleanup?.();activeCleanup=null;
  active = null;
  delete document.documentElement.dataset.mobileNavigation;
  if(hasAndroidRenderer())androidNotify('cancelScene',{});
}
