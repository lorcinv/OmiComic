import { useEffect, useState } from 'react';
import { checkForUpdates, type AvailableUpdate, type UpdateResult } from '../updates';
import { t, tr } from '../i18n';
import { isNativeMobile } from '../platform';
import '../styles/updates.css';

function UpdateDetails({ update }: { update: AvailableUpdate }) {
  return <><strong>{tr`发现新版本 ${update.version}`}</strong>{update.notes && <p className="omi-update-notes">{update.notes}</p>}<a href={update.url} target={isNativeMobile() ? undefined : '_blank'} rel="noopener noreferrer">{t('查看更新与下载')} ↗</a></>;
}
export default function UpdateCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [error, setError] = useState(false);
  return <section className="omi-update-check">
    <button type="button" className="omi-about__action omi-about__guide" disabled={busy} onClick={async () => {
      setBusy(true); setError(false); setResult(null);
      try { setResult(await checkForUpdates()); } catch { setError(true); } finally { setBusy(false); }
    }}><strong>{busy ? t('正在检查更新…') : t('检查更新')}</strong><span>{t('有新版本时提醒，由你选择下载。')}</span><span aria-hidden="true">↻</span></button>
    <div className="omi-update-result" role="status" aria-live="polite">
      {error ? <p>{t('暂时无法检查更新，请检查网络后重试。')}</p> : result?.kind === 'available' ? <UpdateDetails update={result.update}/> : result?.kind === 'current' ? <p>{t('当前已是此平台的最新版本。')}</p> : result?.kind === 'unavailable' ? <p>{t('此平台暂未发布可安装的更新包。')}</p> : null}
    </div>
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
