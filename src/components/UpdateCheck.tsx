import { useEffect, useState } from 'react';
import { checkForUpdates, type AvailableUpdate, type UpdateResult } from '../updates';
import { t, tr } from '../i18n';
import { isNativeMobile } from '../platform';
import '../styles/updates.css';

export default function UpdateCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [error, setError] = useState(false);
  const update = result?.kind === 'available' ? result.update : null;
  const content = <>
    <strong>{busy ? t('正在检查更新…') : t('检查更新')}</strong>
    <span className="omi-update-result" role="status" aria-live="polite">
      {error ? t('暂时无法检查更新，请检查网络后重试。') : update ? <>
        <span>{tr`发现新版本 ${update.version}`}</span>
        {update.notes && <span className="omi-update-notes">{update.notes}</span>}
        <span>{t('查看更新与下载')}</span>
      </> : result?.kind === 'current' ? t('当前已是此平台的最新版本。') : result?.kind === 'unavailable' ? t('此平台暂未发布可安装的更新包。') : t('有新版本时提醒，由你选择下载。')}
    </span>
    <span aria-hidden="true">{update ? '↗' : '↻'}</span>
  </>;
  return <section className="omi-update-check">
    {update ? <a className="omi-about__action omi-update-action" href={update.url} target={isNativeMobile() ? undefined : '_blank'} rel="noopener noreferrer">{content}</a> :
    <button type="button" className="omi-about__action omi-update-action" disabled={busy} onClick={async () => {
      setBusy(true); setError(false); setResult(null);
      try { setResult(await checkForUpdates()); } catch { setError(true); } finally { setBusy(false); }
    }}>{content}</button>}
  </section>;
}
export function UpdateReminder() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => { void checkForUpdates(true).then(result => {
      if (active && result?.kind === 'available') setUpdate(result.update);
    }).catch(() => { /* Automatic checks never interrupt reading on network failure. */ }); }, 15000);
    return () => { active = false; clearTimeout(timer); };
  }, []);
  if (!update) return null;
  return <aside className="omi-update-reminder" aria-label={t('版本更新')} role="status"><strong>{tr`发现新版本 ${update.version}`}</strong><a href={update.url} target={isNativeMobile() ? undefined : '_blank'} rel="noopener noreferrer">{t('查看更新与下载')} ↗</a><button type="button" onClick={() => setUpdate(null)}>{t('稍后')}</button></aside>;
}
