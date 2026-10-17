import { useEffect, useState } from 'react';
import { DESKTOP_FONT_MIN, DESKTOP_FONT_MAX, normalizeDesktopFontSize } from '../../electron/shared/desktopTypography';
import { tr } from '../i18n';

export function FontSizeControl({ label, value, onChange }: { label: string; value: number; onChange: (size: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit(next: unknown) {
    const size = normalizeDesktopFontSize(next, value);
    setDraft(String(size));
    if (size !== value) onChange(size);
  }
  return <div className="font-size-control" role="group" aria-label={label}>
    <button type="button" aria-label={tr`减小${label}`} disabled={value <= DESKTOP_FONT_MIN} onMouseDown={event => event.preventDefault()} onClick={() => commit(normalizeDesktopFontSize(draft, value) - 1)}>−</button>
    <input type="number" aria-label={label} min={DESKTOP_FONT_MIN} max={DESKTOP_FONT_MAX} step={1} value={draft}
      onChange={event => setDraft(event.target.value)} onBlur={() => commit(draft)}
      onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} />
    <button type="button" aria-label={tr`增大${label}`} disabled={value >= DESKTOP_FONT_MAX} onMouseDown={event => event.preventDefault()} onClick={() => commit(normalizeDesktopFontSize(draft, value) + 1)}>＋</button>
  </div>;
}
