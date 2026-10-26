import { useState } from 'react';
import { t } from '../i18n';
import { defaultHomeArtwork, publishHomeArtwork, useHomeArtwork } from '../hooks/useHomeArtwork';
import HomeArtworkCrop from './HomeArtworkCrop';
import type { HomeArtwork } from '../types';
import { HomeArtworkPalette } from './HomeArtworkDecor';

export default function HomeArtworkSettings() {
  const artwork = useHomeArtwork();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<HomeArtwork | null>(null);
  const change = async (reset: boolean) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (reset) {
        const result = await window.omicomic.resetHomeArtwork!();
        if (!result.ok) throw new Error(result.error.message);
        publishHomeArtwork(null);
      } else {
        const result = await window.omicomic.selectHomeArtwork!();
        if (!result.ok) throw new Error(result.error.message);
        if (result.data) setDraft(result.data);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '主页看板娘保存失败，请重试。'); }
    finally { setBusy(false); }
  };
  return <section className="home-artwork-setting" aria-label={t('主页看板娘')}>
    <HomeArtworkPalette id="omi-settings-palette" />
    <h3>{t('主页看板娘')}</h3>
    <div className="home-artwork-setting__content">
      <img src={artwork?.url ?? defaultHomeArtwork} alt={t('主页看板娘预览')} style={{ filter: artwork ? undefined : 'url(#omi-settings-palette)' }} onError={event => { if (event.currentTarget.src !== defaultHomeArtwork) { event.currentTarget.src = defaultHomeArtwork; event.currentTarget.style.filter = 'url(#omi-settings-palette)'; } }} />
      <div className="home-artwork-setting__controls">
        <span className="home-artwork-setting__name" title={artwork?.name}>{artwork?.name ?? t('默认看板娘')}</span>
        <div className="home-artwork-setting__actions">
          <button type="button" disabled={busy || !window.omicomic.selectHomeArtwork} onClick={() => void change(false)}>{t('选择图片')}</button>
          <button type="button" disabled={busy || !artwork} onClick={() => { if (artwork) setDraft(artwork); }}>{t('调整裁剪')}</button>
          <button type="button" disabled={busy || !artwork} onClick={() => void change(true)}>{t('恢复默认')}</button>
        </div>
      </div>
    </div>
    {error && <p className="home-artwork-setting__error" role="alert">{t(error)}</p>}
    {draft && <HomeArtworkCrop artwork={draft} onClose={() => setDraft(null)} onSave={async crop => {
      const result = await window.omicomic.saveHomeArtwork!({ name: draft.name, sourceUrl: draft.sourceUrl ?? draft.url, crop });
      if (!result.ok) throw new Error(result.error.message);
      publishHomeArtwork(result.data); setDraft(null);
    }} />}
  </section>;
}
