import { useCallback, useEffect, useRef, useState } from "react";
import type { AutoReadOptions } from "../../electron/shared/readerPreferences";

interface Options {
  active: boolean; modeKey: string; pageKey: string; ready: boolean; failed: boolean;
  continuous: boolean; atEnd: boolean; settings: AutoReadOptions;
  keepPlayingOnInteraction?: boolean;
  advance: () => void;
  displayReady: () => boolean;
  scroll: (pixels: number) => "moved" | "loading" | "end";
}
function hasVisibleMenu() {
  return [...document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"], details[open], [aria-expanded="true"]')].some(el => (el as HTMLElement).getClientRects().length > 0);
}
export function useAutoRead(options: Options) {
  const [running, setRunning] = useState(false);
  const runningRef = useRef(false), latest = useRef(options);
  const interaction = useRef({ pointers:new Set<number>(), until:0, menu:false });
  latest.current = options;
  const pause = useCallback(() => { runningRef.current = false; interaction.current.pointers.clear(); interaction.current.until=0; setRunning(false); }, []);
  const toggle = useCallback(() => {
    if (runningRef.current) { pause(); return; }
    const current = latest.current;
    if (!current.active || current.failed || (!current.continuous && current.atEnd) || document.hidden) return;
    // A menu may have closed while playback was stopped in the background.
    interaction.current.menu = hasVisibleMenu();
    runningRef.current = true; setRunning(true);
  }, [pause]);
  useEffect(() => { if (!options.active) pause(); }, [options.active, pause]);
  useEffect(() => { if (!options.keepPlayingOnInteraction) pause(); }, [options.modeKey, options.keepPlayingOnInteraction, pause]);
  useEffect(() => {
    const manual = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-reader-auto-play]')) return;
      if (!latest.current.keepPlayingOnInteraction) { pause(); return; }
      // Touching the comic or seeking keeps playback enabled. Hold motion while
      // a gesture is in progress, then continue from the manually selected page.
      if(event.type==='pointerdown')interaction.current.pointers.add((event as PointerEvent).pointerId);
      interaction.current.until=performance.now()+350;
    };
    const release = (event:PointerEvent) => { interaction.current.pointers.delete(event.pointerId); interaction.current.until=performance.now()+350; };
    const background = () => { if (document.hidden) pause(); };
    const menus = () => {
      if(!runningRef.current)return;
      interaction.current.menu=hasVisibleMenu();
      if(interaction.current.menu && !latest.current.keepPlayingOnInteraction)pause();
    };
    document.addEventListener('pointerdown', manual, true);
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    document.addEventListener('wheel', manual, { capture: true, passive: true });
    document.addEventListener('keydown', manual, true);
    document.addEventListener('visibilitychange', background);
    window.addEventListener('blur', pause);
    window.addEventListener('omi-pause', pause);
    const observer = new MutationObserver(menus);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'aria-expanded'] });
    return () => {
      runningRef.current = false; observer.disconnect();
      document.removeEventListener('pointerdown', manual, true);
      document.removeEventListener('pointerup', release, true);
      document.removeEventListener('pointercancel', release, true);
      document.removeEventListener('wheel', manual, true);
      document.removeEventListener('keydown', manual, true);
      document.removeEventListener('visibilitychange', background);
      window.removeEventListener('blur', pause); window.removeEventListener('omi-pause', pause);
    };
  }, [pause]);
  useEffect(() => {
    if (!running) return;
    let frame = 0, previous = performance.now(), elapsed = 0, pageKey = latest.current.pageKey;
    let awaitingPage = false;
    const tick = (time: number) => {
      if (!runningRef.current) return;
      const current = latest.current;
      const dt = Math.min(64, Math.max(0, time - previous)); previous = time;
      if (!current.active || current.failed || document.hidden) { pause(); return; }
      if (pageKey !== current.pageKey) { pageKey = current.pageKey; elapsed = 0; awaitingPage = false; }
      const held=current.keepPlayingOnInteraction && (interaction.current.menu || interaction.current.pointers.size>0 || time<interaction.current.until);
      if (held || !current.ready || !current.displayReady()) elapsed = 0;
      else if (current.continuous) {
        if (dt > 0 && current.scroll(current.settings.scrollPixelsPerSecond * dt / 1000) === 'end') { pause(); return; }
      } else if (current.atEnd) { pause(); return; }
      else if (!awaitingPage) {
        elapsed += dt;
        if (elapsed >= current.settings.intervalSeconds * 1000) { elapsed = 0; awaitingPage = true; current.advance(); }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, pause]);
  return { running, pause, toggle };
}
