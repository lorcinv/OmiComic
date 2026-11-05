// A short touch press remains visible after a fast tap. Scrolling cancels it.
if (typeof document !== 'undefined') {
  let pressed: HTMLElement | undefined, origin: {id:number;x:number;y:number} | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { clearTimeout(timer); pressed?.removeAttribute('data-omi-pressed'); pressed=undefined; origin=undefined; };
  document.addEventListener('pointerdown', event => {
    if (document.documentElement.dataset.platform !== 'android' || event.button !== 0 || !event.isPrimary) return;
    clear();
    const button=(event.target as Element)?.closest<HTMLElement>('button:not(:disabled),.mobile-resource-card');
    if (!button || button.closest('.reader-progress-rail,.mobile-sheet-grab-area')) return;
    pressed=button; origin={id:event.pointerId,x:event.clientX,y:event.clientY}; button.dataset.omiPressed='true';
  }, true);
  document.addEventListener('pointermove', event => { if(origin?.id===event.pointerId && Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>10)clear(); }, true);
  document.addEventListener('pointerup', event => { if(origin?.id!==event.pointerId)return;origin=undefined; timer=setTimeout(clear,pressed?.matches('.mobile-resource-card,.omi-home__book')?180:120); }, true);
  document.addEventListener('pointercancel', event => {if(origin?.id===event.pointerId)clear();}, true);
  window.addEventListener('blur', clear);
}
