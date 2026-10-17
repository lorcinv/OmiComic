import { t, tr } from '../i18n';
import ModalOverlay from './ModalOverlay';
import { useEffect, useRef, useState } from "react";
import type { OmiComicAppData } from "../types";

export interface LocalFileTarget { path: string; paths?: string[]; title: string; mode: "rename" | "delete" }

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
  const completed = useRef(new Set<string>());
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
      const paths = target.mode === "delete" ? target.paths ?? [target.path] : [target.path];
      let latest: OmiComicAppData | null = null;
      let failure = "";
      for (const path of paths) {
        if (completed.current.has(path)) continue;
        const result = await window.omicomic.changeLocalResource({ path,
          action: target.mode === "rename" ? "rename" : deleteSource ? "trash" : "index", name });
        if (!result.ok) { failure = result.error.message; break; }
        completed.current.add(path);
        latest = result.data.appData;
      }
      if (latest) await onChanged(latest);
      if (failure) { setError(`${completed.current.size ? `已处理 ${completed.current.size} 项；` : ""}${failure}`); return; }
      onClose();
    } catch { setError("操作未完成，请刷新后检查文件状态。"); }
    finally { setBusy(false); }
  }
  return <ModalOverlay className="root-delete-overlay local-file-overlay" role="dialog" aria-modal="true" aria-labelledby="local-file-title"
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
      <h2 id="local-file-title">{target.mode === "rename" ? t("重命名本地文件") : t("删除资源")}</h2>
      <p className="local-file-path">{target.paths && target.paths.length > 1 ? tr`已选择 ${target.paths.length} 个资源` : target.path}</p>
      {target.mode === "rename" ? <>
        <label className="local-file-name">{t("新名称")}<input aria-label={t("新文件名")} value={name} disabled={busy} maxLength={180} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void submit(); }} /></label>
        <p>{t("直接修改本地名称，保留扩展名。收藏、书签、书架和阅读进度会同步更新。")}</p>
      </> : <>
        <label className={`local-file-option ${!deleteSource ? "is-selected" : ""}`}><input type="radio" name="delete-mode" checked={!deleteSource} disabled={busy} onChange={() => setDeleteSource(false)} /><span><strong>{t("仅移除索引")}</strong><small>{t("保留本地文件，移除 Omi 中的资源及关联记录。可在资源库恢复文件索引。")}</small></span></label>
        <label className={`local-file-option ${deleteSource ? "is-selected" : ""}`}><input type="radio" name="delete-mode" checked={deleteSource} disabled={busy} onChange={() => setDeleteSource(true)} /><span><strong>{android ? t("删除本地文件") : t("同时删除本地文件（回收站）")}</strong><small>{android ? t("永久删除手机中的文件或整个文件夹及其内容，无法通过 Omi 恢复。") : t("文件或整个文件夹移入 Windows 回收站，同时移除关联记录。")}</small></span></label>
      </>}
      {error && <p role="alert" className="local-file-error">{t(error ?? '')}</p>}
      <div className="root-delete-actions">
        <button disabled={busy} onClick={onClose}>{t("取消")}</button>
        <button className={target.mode === "delete" && deleteSource ? "danger-action" : "primary-action"} disabled={busy || !name.trim()} onClick={() => void submit()}>
          {busy ? t("正在处理…") : target.mode === "rename" ? t("确认重命名") : deleteSource ? android ? t("永久删除") : t("移入回收站") : t("移除索引")}
        </button>
      </div>
    </div>
  </ModalOverlay>;
}
