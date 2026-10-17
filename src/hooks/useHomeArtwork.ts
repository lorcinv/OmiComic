import { useEffect, useState } from 'react';
import type { HomeArtwork } from '../types';

export const defaultHomeArtwork = new URL('../assets/home-scene.webp', import.meta.url).href;
const changed = 'omicomic-home-artwork-changed';

export function publishHomeArtwork(artwork: HomeArtwork | null) {
  window.dispatchEvent(new CustomEvent(changed, { detail: artwork }));
}

export function useHomeArtwork(enabled = true) {
  const [artwork, setArtwork] = useState<HomeArtwork | null>(null);
  useEffect(() => {
    if (!enabled || !window.omicomic.getHomeArtwork) return;
    let disposed = false, updated = false;
    const receive = (event: Event) => { updated = true; setArtwork((event as CustomEvent<HomeArtwork | null>).detail); };
    window.addEventListener(changed, receive);
    void window.omicomic.getHomeArtwork().then(result => {
      if (!disposed && !updated && result.ok) setArtwork(result.data);
    }).catch(() => undefined);
    return () => { disposed = true; window.removeEventListener(changed, receive); };
  }, [enabled]);
  return artwork;
}
