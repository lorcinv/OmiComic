// Keep the closing gesture from reaching controls revealed by an unmounted popup.
export function consumeDismissGesture(event: Event): void {
  if (document.documentElement.dataset.platform !== 'android' && !window.matchMedia('(max-width:760px), (pointer:coarse)').matches) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (event.type !== 'pointerdown' && event.type !== 'mousedown') return;
  let timer: ReturnType<typeof setTimeout>;
  const cleanup=() => { clearTimeout(timer); window.removeEventListener('click',click,true); window.removeEventListener('pointerup',up,true); window.removeEventListener('pointerdown',cleanup,true); };
  const click=(e: Event) => { e.preventDefault(); e.stopImmediatePropagation(); cleanup(); };
  const up=(e: Event) => { e.stopImmediatePropagation(); timer=setTimeout(cleanup,450); };
  window.addEventListener('click',click,true); window.addEventListener('pointerup',up,true);
  window.addEventListener('pointerdown',cleanup,true); timer=setTimeout(cleanup,1500);
}
