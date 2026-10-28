import { useEffect, useState } from 'react';

export function adaptiveLibraryColumns(base: number, width: number) {
  return width < 600 ? base : Math.min(8, Math.max(base, Math.round(width * base / 390)));
}
export function useResponsiveLibrary(base: number, enabled: boolean) {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    if (!enabled) return;
    const update = () => setWidth(window.innerWidth);
    update(); window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [enabled]);
  return { columns: enabled ? adaptiveLibraryColumns(base, width) : base,
    listColumns: enabled && width >= 1000 ? 2 : 1, wide: enabled && width >= 600 };
}
