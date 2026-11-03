import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';
import MobileSheet from './MobileSheet';

export default function QuickTagsDrawer({ tags, allTags, mobile, error, onSave, onClose }: {
  tags: string[]; allTags: string[]; mobile: boolean; error?: string | null; onSave: (tags: string[]) => Promise<boolean>; onClose: () => void;
}) {
  const [upper, setUpper] = useState<string[]>([]), [lower, setLower] = useState<string[]>([]), [busy, setBusy] = useState(false);
  const lock = useRef(false), panel = useRef<HTMLElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const available = allTags.filter(tag => !tags.includes(tag));
  useEffect(() => { setUpper(old => old.filter(tag => tags.includes(tag))); setLower(old => old.filter(tag => allTags.includes(tag) && !tags.includes(tag))); }, [tags, allTags]);
  useEffect(() => {
    if (mobile) return;
    const previous = document.activeElement as HTMLElement | null; panel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!lock.current) close.current(); }
      if (event.key === 'Tab') {
        const controls = [...panel.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        if (event.shiftKey && (document.activeElement === controls[0] || document.activeElement === panel.current)) { event.preventDefault(); controls.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
      }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); previous?.isConnected && previous.focus({ preventScroll: true }); };
  }, [mobile]);
  const toggle = (tag: string, side: 'upper' | 'lower') => { if (!lock.current) (side === 'upper' ? setUpper : setLower)(old => old.includes(tag) ? old.filter(value => value !== tag) : [...old, tag]); };
  async function transfer(add: boolean) {
    if (lock.current || !(add ? lower : upper).length) return;
    lock.current = true; setBusy(true);
    try { if (await onSave(add ? [...new Set([...tags, ...lower.filter(tag => available.includes(tag))])] : tags.filter(tag => !upper.includes(tag)))) { if (add) setLower([]); else setUpper([]); } }
    finally { lock.current = false; setBusy(false); }
  }
  const content = <div className="quick-tags-content">
    <section className="quick-tags-group"><h3>{t('已有标签')}<span>{tags.length}</span></h3><div className="quick-tags-list" role="group" aria-label={t('已有标签')}>
      {tags.map(tag => <button type="button" key={tag} aria-disabled={busy} className={`tag-filter-chip tag-catalogue-chip ${upper.includes(tag) ? 'is-management-selected' : ''}`} aria-pressed={upper.includes(tag)} onClick={() => toggle(tag, 'upper')}>{tag}</button>)}
      {!tags.length && <p className="drawer-muted">{t('这本漫画还没有标签')}</p>}
    </div></section>
    <div className="quick-tags-actions"><button type="button" className="secondary-action" disabled={!lower.length} aria-disabled={busy || !lower.length} onClick={() => void transfer(true)}><svg className="quick-tag-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 12 5-5 5 5"/></svg>{t('加入')}{lower.length ? ` ${lower.length}` : ''}</button><button type="button" className="secondary-action" disabled={!upper.length} aria-disabled={busy || !upper.length} onClick={() => void transfer(false)}>{t('移出')}{upper.length ? ` ${upper.length}` : ''}<svg className="quick-tag-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 8 5 5 5-5"/></svg></button></div>
    <section className="quick-tags-group"><h3>{t('可用标签')}<span>{available.length}</span></h3><div className="quick-tags-list" role="group" aria-label={t('可用标签')}>
      {available.map(tag => <button type="button" key={tag} aria-disabled={busy} className={`tag-filter-chip tag-catalogue-chip ${lower.includes(tag) ? 'is-management-selected' : ''}`} aria-pressed={lower.includes(tag)} onClick={() => toggle(tag, 'lower')}>{tag}</button>)}
      {!available.length && <p className="drawer-muted">{t(allTags.length ? '所有标签都已加入' : '暂无可用标签，请先在标签编辑中添加')}</p>}
    </div></section>
    {error && <p role="alert" className="organize-edit-error">{t(error)}</p>}
  </div>;
  if (mobile) return <MobileSheet side="right" title={t('快速标签')} onClose={onClose} beforeClose={() => !lock.current}>{content}</MobileSheet>;
  return createPortal(<div className="settings-overlay organize-drawer-overlay quick-tags-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <aside ref={panel} className="settings-panel organize-drawer tag-filter-drawer quick-tags-drawer" role="dialog" aria-modal="true" aria-label={t('快速标签')} tabIndex={-1}>
      <header className="quick-tags-heading"><h2>{t('快速标签')}</h2></header>{content}
    </aside>
  </div>, document.body);
}
