import { useEffect, useRef, useState } from "react";
import type { OmiComicAppData } from "../types";

export interface LocalFileTarget { path: string; title: string; mode: "rename" | "delete" }

export default function LocalFileDialog({ target, onClose, onChanged }: {
  target: LocalFileTarget;
  onClose: () => void;
  onChanged: (data: OmiComicAppData) => void | Promise<void>;
}) {
  const [name, setName] = useState(target.path.split(/[\\/]/).pop() ?? target.title);
  const [deleteSource, setDeleteSource] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const android = document.documentElement.dataset.platform === "android";
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input,button")?.focus();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const back = () => { if (!busy) onClose(); };
    window.addEventListener("omi-library-back",back);
    return () => window.removeEventListener("omi-library-back",back);
  }, [busy,onClose]);
  async function submit() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await window.omicomic.changeLocalResource({ path: target.path,
        action: target.mode === "rename" ? "rename" : deleteSource ? "trash" : "index", name });
      if (!result.ok) { setError(result.error.message); return; }
      await onChanged(result.data.appData);
      onClose();
    } catch { setError("操作未完成，请刷新后检查文件状态。"); }
    finally { setBusy(false); }
  }
  return <div className="root-delete-overlay local-file-overlay" role="dialog" aria-modal="true" aria-labelledby="local-file-title"
    onClick={() => !busy && onClose()} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape" && !busy) onClose();
      if (event.key === "Tab") {
        const items = [...(panel.current?.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)') ?? [])];
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    }}>
    <div className="root-delete-dialog local-file-dialog" ref={panel} onClick={event => event.stopPropagation()}>
      <h2 id="local-file-title">{target.mode === "rename" ? "重命名本地文件" : "删除资源"}</h2>
      <p className="local-file-path">{target.path}</p>
      {target.mode === "rename" ? <>
        <label className="local-file-name">新名称<input aria-label="新文件名" value={name} disabled={busy} maxLength={180} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void submit(); }} /></label>
        <p>直接修改本地名称，保留扩展名。收藏、书签、书架和阅读进度会同步更新。</p>
      </> : <>
        <label className={`local-file-option ${!deleteSource ? "is-selected" : ""}`}><input type="radio" name="delete-mode" checked={!deleteSource} disabled={busy} onChange={() => setDeleteSource(false)} /><span><strong>仅移除索引</strong><small>保留本地文件，移除 Omi 中的资源及关联记录。可在资源库恢复文件索引。</small></span></label>
        <label className={`local-file-option ${deleteSource ? "is-selected" : ""}`}><input type="radio" name="delete-mode" checked={deleteSource} disabled={busy} onChange={() => setDeleteSource(true)} /><span><strong>{android ? "删除本地文件" : "同时删除本地文件（回收站）"}</strong><small>{android ? "永久删除手机中的文件或整个文件夹及其内容，无法通过 Omi 恢复。" : "文件或整个文件夹移入 Windows 回收站，同时移除关联记录。"}</small></span></label>
      </>}
      {error && <p role="alert" className="local-file-error">{error}</p>}
      <div className="root-delete-actions">
        <button disabled={busy} onClick={onClose}>取消</button>
        <button className={target.mode === "delete" && deleteSource ? "danger-action" : "primary-action"} disabled={busy || !name.trim()} onClick={() => void submit()}>
          {busy ? "正在处理…" : target.mode === "rename" ? "确认重命名" : deleteSource ? android ? "永久删除" : "移入回收站" : "移除索引"}
        </button>
      </div>
    </div>
  </div>;
}
