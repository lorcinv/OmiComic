import { t } from '../i18n';
import ModalOverlay from './ModalOverlay';
import { useEffect, useState } from 'react';
import type { BookmarkItem } from '../types';

export default function RenameBookmarkDialog({ bookmark, onClose, onSaved }: { bookmark: BookmarkItem; onClose: () => void; onSaved: (item: BookmarkItem) => void }) {
  const [name,setName]=useState(bookmark.bookmarkTitle ?? bookmark.title), [busy,setBusy]=useState(false), [error,setError]=useState('');
  useEffect(() => { const back=(event: Event) => {event.preventDefault();event.stopImmediatePropagation();if(!busy) onClose();}; window.addEventListener('omi-library-back',back,true); return () => window.removeEventListener('omi-library-back',back,true); },[busy,onClose]);
  async function save() { if(busy || !name.trim()) return; setBusy(true); try { const result=await window.omicomic.updateBookmarkMeta(bookmark.id,{bookmarkTitle:name.trim()}); if(result.ok) {onSaved(result.data);onClose();} else setError(result.error.message); } catch {setError('书签名称保存失败。');} finally{setBusy(false);} }
  return <ModalOverlay className="root-delete-overlay bookmark-rename-overlay" role="dialog" aria-modal="true" aria-label={t("重命名书签")} onClick={event => {event.stopPropagation();if(event.target===event.currentTarget && !busy) onClose();}} onKeyDown={event => {event.stopPropagation();if(event.key==='Escape' && !busy) onClose();}}>
    <form className="root-delete-dialog" onSubmit={event => {event.preventDefault();void save();}}><h2>{t("重命名书签")}</h2><label className="local-file-name">{t("书签名称")}<input autoFocus aria-label={t("书签名称")} value={name} maxLength={180} disabled={busy} onChange={event => setName(event.target.value)}/></label>{error && <p role="alert">{t(error ?? '')}</p>}<div className="root-delete-actions"><button type="button" disabled={busy} onClick={onClose}>{t("取消")}</button><button className="primary-action" disabled={busy || !name.trim()} type="submit">{t("保存")}</button></div></form>
  </ModalOverlay>;
}
