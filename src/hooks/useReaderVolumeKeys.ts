import { useEffect, useRef } from 'react';

/** Native keys are captured only in the active reader, outside dialogs and text entry. */
export default function useReaderVolumeKeys(enabled: boolean, reversed: boolean, onPrevious: () => void, onNext: () => void) {
  const actions = useRef({ onPrevious, onNext, reversed });
  actions.current = { onPrevious, onNext, reversed };
  useEffect(() => {
    let paused = false, disposed = false;
    const editable = () => document.activeElement instanceof HTMLElement && Boolean(document.activeElement.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]'));
    const active = () => enabled && !paused && !document.hidden && !editable();
    const sync = () => { if (!disposed) void window.omicomic.setReaderVolumeKeys?.(active()); };
    const focus = () => queueMicrotask(sync);
    const pause = () => { paused = true; sync(); };
    const resume = () => { paused = false; sync(); };
    const turn = (up: boolean) => { if (active()) ((up !== actions.current.reversed) ? actions.current.onPrevious : actions.current.onNext)(); };
    const up = () => turn(true), down = () => turn(false);
    window.addEventListener('omi-volume-up', up); window.addEventListener('omi-volume-down', down);
    window.addEventListener('omi-pause', pause); window.addEventListener('omi-resume', resume);
    document.addEventListener('focusin', focus); document.addEventListener('focusout', focus);
    document.addEventListener('visibilitychange', sync); sync();
    return () => {
      disposed = true;
      window.removeEventListener('omi-volume-up', up); window.removeEventListener('omi-volume-down', down);
      window.removeEventListener('omi-pause', pause); window.removeEventListener('omi-resume', resume);
      document.removeEventListener('focusin', focus); document.removeEventListener('focusout', focus);
      document.removeEventListener('visibilitychange', sync);
      void window.omicomic.setReaderVolumeKeys?.(false);
    };
  }, [enabled]);
}
