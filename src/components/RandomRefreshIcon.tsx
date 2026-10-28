/** Music-player shuffle with separated crossings at small sizes. */
export default function RandomRefreshIcon({ busy = false }: { busy?: boolean }) {
  return <svg className={`random-refresh-icon ${busy ? 'is-spinning' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 6.5h2c4.5 0 8.5 11 13 11h2M18 15l2.5 2.5L18 20M3.5 17.5h2c1.8 0 3.5-1.9 5.1-4.2m2.8-3.6c1.7-2 3.4-3.2 5.1-3.2h2M18 4l2.5 2.5L18 9"/>
  </svg>;
}
