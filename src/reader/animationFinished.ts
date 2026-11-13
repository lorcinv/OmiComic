/** Android's older WebView implements animate(), but not Animation.finished. */
export function animationFinished(animation: Animation): Promise<Animation> {
  if (animation.finished) return animation.finished;
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      animation.removeEventListener('finish', finish);
      animation.removeEventListener('cancel', cancel);
    };
    const finish = () => { if (settled) return; settled=true; cleanup(); resolve(animation); };
    const cancel = () => { if (settled) return; settled=true; cleanup(); reject(new DOMException('Animation cancelled.', 'AbortError')); };
    // Some old engines omit cancel events as well. Check the play state while
    // pending so interrupted gestures still release overlays and callbacks.
    const check = () => {
      if (animation.playState === 'finished') finish();
      else if (animation.playState === 'idle') cancel();
      else timer=setTimeout(check,32);
    };
    animation.addEventListener('finish',finish);
    animation.addEventListener('cancel',cancel);
    check();
  });
}
