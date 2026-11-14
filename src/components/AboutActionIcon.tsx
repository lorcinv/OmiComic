export default function AboutActionIcon({ kind }: { kind: 'external' | 'next' | 'refresh' }) {
  return <svg className="omi-about__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {kind === 'external' ? <path d="M7 17 17 7M7 7h10v10" /> : kind === 'next' ? <path d="m9 6 6 6-6 6" /> : <path d="M19 10a7.2 7.2 0 1 0 .1 4M19 5v5h-5" />}
  </svg>;
}
