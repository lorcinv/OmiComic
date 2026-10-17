import { t, tr } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { consumeDismissGesture } from '../hooks/consumeDismissGesture';
import MobileIcon from './MobileIcon';
import MobileSheet from './MobileSheet';

type MetadataPatch = { tags?: string[]; note?: string };
export default function DetailMetadata({ tags, note, error, onSave, mobile = true }: {
  tags: string[]; note: string; error?: string | null; mobile?: boolean;
  onSave: (patch: MetadataPatch) => Promise<boolean>;
}) {
  const [tagEdit, setTagEdit] = useState(false), [adding, setAdding] = useState(false);
  const [noteEdit, setNoteEdit] = useState(false), [draft, setDraft] = useState(note);
  const [input, setInput] = useState(''), [saving, setSaving] = useState(false);
  const tagRegion = useRef<HTMLDivElement>(null), noteRegion = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(), start = useRef({ x: 0, y: 0 }), held = useRef(false);
  const busy = useRef(false);
  const cancel = () => clearTimeout(timer.current);
  useEffect(() => () => cancel(), []);
  useEffect(() => { if (!noteEdit) setDraft(note); }, [note, noteEdit]);

  async function save(patch: MetadataPatch) {
    if (busy.current) return false;
    busy.current = true; setSaving(true);
    try { return await onSave(patch); } finally { busy.current = false; setSaving(false); }
  }
  async function finishNote() {
    if (draft.trim() === note || await save({ note: draft.trim() })) setNoteEdit(false);
  }
  useEffect(() => {
    if (!tagEdit && !noteEdit) return;
    const outside = (event: PointerEvent) => {
      if ((adding && mobile) || document.querySelector('.mobile-sheet-overlay,.root-delete-overlay')) return;
      const target = event.target as Node;
      const exitTags = tagEdit && !tagRegion.current?.contains(target);
      const exitNote = noteEdit && !noteRegion.current?.contains(target);
      if (!exitTags && !exitNote) return;
      if (mobile) consumeDismissGesture(event);
      if (exitTags) { setTagEdit(false); setAdding(false); }
      if (exitNote) void finishNote();
    };
    const back = (event: Event) => {
      if (document.querySelector('.mobile-sheet-overlay,.root-delete-overlay')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (adding) { setAdding(false); return; }
      setTagEdit(false); if (noteEdit) void finishNote();
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') back(event); };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('omi-library-back', back, true);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('omi-library-back', back, true);
      window.removeEventListener('keydown', key, true);
    };
  }, [tagEdit, noteEdit, adding, draft, note, mobile, saving]);

  async function add() {
    const next = [...new Set([...tags, ...input.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)])];
    if (await save({ tags: next })) { setInput(''); setAdding(false); }
  }
  const addForm = <form className="mobile-tag-add-form" onSubmit={event => { event.preventDefault(); void add(); }}>
    <input autoFocus aria-label={t("新标签")} placeholder={t("输入标签，逗号分隔")} value={input} onChange={event => setInput(event.target.value)} />
    <button type="submit" disabled={saving || !input.trim()}>{t("添加")}</button>
  </form>;
  return <section className={`resource-detail-direct-editor ${mobile ? 'mobile-detail-metadata' : 'desktop-detail-metadata'}`}>
    <div className="resource-detail-direct-tags" ref={tagRegion} aria-label={t("资源标签")} onDoubleClick={() => { if (!mobile) setTagEdit(true); }}>
      <div className="resource-detail-field-label">{t("标签")}</div>
      <div className="resource-tag-editor resource-detail-tag-editor">{tags.length ? tags.map(tag => <button key={tag} className="tag-chip" aria-label={tagEdit ? tr`移除标签：${tag}` : tag} disabled={saving}
        onPointerDown={event => {
          if (!mobile || event.button !== 0) return;
          cancel(); held.current = false; start.current = { x: event.clientX, y: event.clientY };
          timer.current = setTimeout(() => { held.current = true; setTagEdit(true); }, 450);
        }}
        onPointerMove={event => { if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > 9) cancel(); }} onPointerUp={cancel} onPointerCancel={cancel}
        onContextMenu={event => { if (mobile) { event.preventDefault(); cancel(); held.current = true; setTagEdit(true); } }}
        onClick={() => { if (held.current) { held.current = false; return; } if (tagEdit) void save({ tags: tags.filter(t => t !== tag) }); }}>
        {tag}{tagEdit && <MobileIcon name="close" />}</button>) : <span className="drawer-muted">{t("未设置标签")}</span>}
        <button className="tag-chip tag-add-button" aria-label={t("添加标签")} onClick={() => { setTagEdit(true); setInput(''); setAdding(true); }}><MobileIcon name="add" />{t("添加标签")}</button>
      </div>
      {adding && !mobile && <div className="detail-tag-add-inline">{addForm}<button onClick={() => setAdding(false)}>{t("取消")}</button></div>}
    </div>
    <div className="resource-detail-direct-summary" ref={noteRegion} aria-label={t("资源简介区域")} onDoubleClick={() => { if (!mobile) setNoteEdit(true); }}>
      <div className="resource-detail-field-label">{t("简介")}{mobile && <button className="mobile-edit-summary" disabled={saving} aria-label={noteEdit ? t("保存简介") : t("编辑简介")} onClick={() => { if (noteEdit) void finishNote(); else setNoteEdit(true); }}>{noteEdit ? t("保存") : t("编辑")}</button>}</div>
      {noteEdit ? <textarea autoFocus aria-label={t("资源简介")} value={draft} rows={4} maxLength={2000} onChange={event => setDraft(event.target.value)} /> : <p className={note ? '' : 'is-empty'}
        onPointerDown={event => { if (!mobile || event.button !== 0) return; cancel(); start.current={x:event.clientX,y:event.clientY}; timer.current=setTimeout(()=>setNoteEdit(true),450); }}
        onPointerMove={event => { if(Math.hypot(event.clientX-start.current.x,event.clientY-start.current.y)>9)cancel(); }} onPointerUp={cancel} onPointerCancel={cancel}
        onContextMenu={event => { if(mobile){event.preventDefault();cancel();setNoteEdit(true);} }}>{note || t("暂无简介")}</p>}
    </div>
    {error && !adding && <p className="organize-edit-error" role="alert">{t(error ?? '')}</p>}
    {adding && mobile && <MobileSheet title={t("添加标签")} showClose={false} onClose={() => setAdding(false)}>{addForm}{error && <p className="organize-edit-error" role="alert">{t(error ?? '')}</p>}</MobileSheet>}
  </section>;
}
