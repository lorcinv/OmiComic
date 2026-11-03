import { useEffect, useRef, useState } from 'react';
import { backupLocations, backupPlatform, type DataImportOptions, type DataImportPreview } from '../../electron/shared/dataBackup';
import type { OmiComicAppData } from '../types';
import { t } from '../i18n';
import GlassSelect from '../GlassSelect';

export default function DataManagement({ onImported, beforeOperation }: { onImported: (data: OmiComicAppData) => void; beforeOperation?: () => Promise<unknown> }) {
  const [preview, setPreview] = useState<DataImportPreview | null>(null), [mappings, setMappings] = useState<Record<string, string>>({});
  const [platform, setPlatform] = useState(''), [mode, setMode] = useState<'merge' | 'replace'>('merge'), [prefer, setPrefer] = useState<'local' | 'imported'>('local');
  const [includeSettings, setIncludeSettings] = useState(false), [canRestore, setCanRestore] = useState(false), [confirmRestore, setConfirmRestore] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    void window.omicomic.getAppInfo().then(info => { if (mounted.current) setPlatform(backupPlatform(info.platform)); }).catch(() => {});
    void window.omicomic.hasDataImportBackup?.().then(result => { if (mounted.current && result.ok) setCanRestore(result.data); }).catch(() => {});
    return () => { mounted.current = false; };
  }, []);
  async function run(action: () => Promise<void>) {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setMessage('');
    try { await beforeOperation?.(); await action(); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : t('数据操作失败，请重试。')); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  const locations = preview ? backupLocations(preview.backup.data) : [];
  const crossPlatform = !!preview && preview.backup.platform !== platform;
  async function read() {
    setPreview(null); setConfirmRestore(false);
    const result = await window.omicomic.readDataBackup!();
    if (!result.ok) throw new Error(result.error.message);
    if (result.data) { setMappings(Object.fromEntries((result.data.matches ?? []).map(match => [match.from, match.to]))); setMode('merge'); setPrefer('local'); setIncludeSettings(false); setPreview(result.data); }
  }
  async function apply() {
    if (!preview) return;
    const options: DataImportOptions = { mode, prefer, includeSettings, mappings: Object.entries(mappings).filter(([, to]) => to).map(([from, to]) => ({ from, to })) };
    const result = await window.omicomic.applyDataBackup!(preview.token, options);
    if (!result.ok) throw new Error(result.error.message);
    setPreview(null); setCanRestore(true); setMessage(t('数据已导入，导入前的记录已自动备份。')); onImported(result.data);
  }
  return <div className="data-management" aria-busy={busy}>
    <div className="data-backup-row">
      <button type="button" className="secondary-action" disabled={busy || !window.omicomic.exportDataBackup} onClick={() => void run(async () => {
        const result = await window.omicomic.exportDataBackup!(); if (!result.ok) throw new Error(result.error.message); if (result.data) setMessage(t('数据备份已导出。'));
      })}>{t('导出数据')}</button>
      <span>{t('导出阅读进度、收藏、书签、书架、标签、备注和设置。')}</span>
    </div>
    <div className="data-backup-row">
      <button type="button" className="secondary-action" disabled={busy || !window.omicomic.readDataBackup} onClick={() => void run(read)}>{t('导入数据')}</button>
      <span>{t('导入OmiComic数据')}</span>
    </div>
    {preview && <section className="data-import-preview" aria-label={t('导入预览')}>
      <h3>{t('导入预览')}</h3>
      <p className="data-import-origin">OmiComic {preview.backup.appVersion} · {preview.backup.platform} · {new Date(preview.backup.exportedAt).toLocaleString()}</p>
      <dl className="data-import-counts">{([
        ['阅读进度', Object.keys(preview.backup.data.readingProgress).length], ['收藏', preview.backup.data.favorites.length], ['书签', preview.backup.data.bookmarks.length], ['书架', preview.backup.data.virtualFolders.length],
      ] as const).map(([label, count]) => <div key={label}><dt>{t(label)}</dt><dd>{count}</dd></div>)}</dl>
      <div className="settings-row"><span>{t('导入方式')}</span><GlassSelect ariaLabel={t('导入方式')} value={mode} options={[{ value: 'merge', label: t('合并现有记录') }, { value: 'replace', label: t('替换现有记录') }]} onChange={setMode}/></div>
      {mode === 'merge' ? <div className="settings-row"><span>{t('相同记录冲突时')}</span><GlassSelect ariaLabel={t('相同记录冲突时')} value={prefer} options={[{ value: 'local', label: t('保留本机记录') }, { value: 'imported', label: t('采用导入记录') }]} onChange={setPrefer}/></div> : <p className="settings-hint">{t('替换将覆盖当前进度、收藏、书签和书架。可使用导入前备份恢复。')}</p>}
      <label className="settings-toggle"><span>{t('同时导入软件设置')}</span><input type="checkbox" disabled={busy} checked={includeSettings} onChange={event => setIncludeSettings(event.target.checked)}/></label>
      {crossPlatform && <p className="settings-hint">{t('跨平台只导入通用设置，保留本机显示、操作和性能设置。')}</p>}
      {locations.length > 0 && <details className="data-directory-details" open={locations.some(location => !mappings[location.path])}>
      <summary>{t('目录匹配')}<span>{locations.filter(location=>!!mappings[location.path]).length} / {locations.length}</span></summary>
      <p className="settings-hint">{t('已自动查找原目录和本机资源库。唯一对应的目录会自动匹配，未匹配的目录可手动选择，也可保留记录后再处理。')}</p>
      <div className="data-root-mappings">{locations.map(location => <div key={location.path} className="data-root-mapping">
        <strong>{location.name}{location.external ? ` · ${t('目录外记录')}` : ''}</strong><small title={location.path}>{location.path}</small>
        <div><span title={mappings[location.path]}>{mappings[location.path] || t(crossPlatform ? '未配对，保留为待匹配记录' : '沿用原路径')}</span><button type="button" className="secondary-action" disabled={busy} onClick={() => void run(async () => {
          const selected = await window.omicomic.selectFolder(); if (!selected.ok) throw new Error(selected.error.message); if (selected.data) setMappings(old => ({ ...old, [location.path]: selected.data! }));
        })}>{t('选择目录')}</button>{mappings[location.path] && <button type="button" className="data-mapping-clear" aria-label={t('清除目录配对')} disabled={busy} onClick={() => setMappings(old => ({ ...old, [location.path]: '' }))}>×</button>}</div>
      </div>)}</div>
      </details>}
      <div className="data-management-actions"><button type="button" className="primary-action" disabled={busy || !platform} onClick={() => void run(apply)}>{busy ? t('正在处理…') : t('确认导入')}</button><button type="button" className="secondary-action" disabled={busy} onClick={() => setPreview(null)}>{t('取消')}</button></div>
    </section>}
    {canRestore && <section className="data-restore"><h3>{t('导入前备份')}</h3><p className="settings-hint">{t('恢复后将回到上次导入前，导入之后新增或修改的记录会被覆盖。')}</p>
      {!confirmRestore ? <button type="button" className="secondary-action" disabled={busy} onClick={() => setConfirmRestore(true)}>{t('恢复导入前数据')}</button> : <div className="data-management-actions"><button type="button" className="primary-action" disabled={busy} onClick={() => void run(async () => {
        const result = await window.omicomic.restoreDataBackup!(); if (!result.ok) throw new Error(result.error.message); setCanRestore(false); setConfirmRestore(false); setPreview(null); setMessage(t('已恢复导入前数据。')); onImported(result.data);
      })}>{t('确认恢复')}</button><button type="button" className="secondary-action" disabled={busy} onClick={() => setConfirmRestore(false)}>{t('取消')}</button></div>}
    </section>}
    {message && <p className="data-operation-message" role="status">{message}</p>}{error && <p className="organize-edit-error" role="alert">{t(error)}</p>}
  </div>;
}
