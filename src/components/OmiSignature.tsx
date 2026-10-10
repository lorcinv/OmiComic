/** 静态的首页签名，沿用品牌的开口圆环与双眼，不参与按钮动画。 */
export default function OmiSignature() {
  return (
    <div className="omi-home__signature" aria-label="OmiComic 品牌签名">
      <svg viewBox="0 0 100 100" aria-hidden="true" className="omi-home__signature-mark">
        <circle cx="50" cy="50" r="37" fill="none" stroke="currentColor" strokeWidth=".6" opacity=".3" />
        <path d="M73.3 26.7a33 33 0 1 0 0 46.6" fill="none" stroke="currentColor" strokeWidth="11" />
        <path d="M74 21 81 27M74 79 81 73" stroke="currentColor" strokeWidth=".8" opacity=".6" />
        <rect x="39" y="42" width="6" height="16" rx="3" fill="currentColor" />
        <rect x="54" y="42" width="6" height="16" rx="3" fill="currentColor" />
        <path d="M84 39v10m-5-5h10" stroke="currentColor" strokeWidth=".9" opacity=".7" />
        <circle cx="14" cy="77" r="1.5" fill="currentColor" opacity=".55" />
      </svg>
      <span className="omi-home__signature-word">Omi<span>Comic</span><i>.</i></span>
      <span className="omi-home__signature-rule" aria-hidden="true" />
    </div>
  );
}
