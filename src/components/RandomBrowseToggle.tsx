import { t } from '../i18n';

export default function RandomBrowseToggle({ active, onChange, disabled = false }: { active: boolean; onChange: () => void; disabled?: boolean }) {
  return <button type="button" role="switch" aria-label={t('随机阅读')} aria-checked={active}
    className={`random-browse-toggle ${active ? 'is-active' : ''}`} onClick={onChange} disabled={disabled} data-tooltip-disabled>
    <span>{t('随机阅读')}</span><span className="random-browse-track" aria-hidden="true"><span /></span>
  </button>;
}
