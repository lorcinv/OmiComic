const mascots = {
  peek: new URL('../assets/home-omi-peek.webp', import.meta.url).href,
  side: new URL('../assets/home-omi-side.webp', import.meta.url).href,
  signature: new URL('../assets/home-omi-signature.webp', import.meta.url).href,
};
const signatureForeground = new URL('../assets/home-omi-signature-front.webp', import.meta.url).href;
const decor = {
  peek: new URL('../assets/home-omi-peek-decor.webp', import.meta.url).href,
  signature: new URL('../assets/home-omi-signature-decor.webp', import.meta.url).href,
};

/** Map the original ink and paper to the active theme without changing the drawing's alpha. */
export function HomeArtworkPalette({ id }: { id: string }) {
  return <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none' }}>
    <defs><filter id={id} colorInterpolationFilters="sRGB">
      <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="luminance" />
      <feComposite in="luminance" in2="SourceAlpha" operator="in" result="paperAlpha" />
      <feComposite in="SourceAlpha" in2="paperAlpha" operator="arithmetic" k2="1" k3="-1" result="inkAlpha" />
      <feFlood floodColor="var(--首页插画墨色)" result="inkColor" />
      <feComposite in="inkColor" in2="inkAlpha" operator="in" result="ink" />
      <feFlood floodColor="var(--首页插画纸色)" result="paperColor" />
      <feComposite in="paperColor" in2="paperAlpha" operator="in" result="paper" />
      <feComposite in="ink" in2="paper" operator="arithmetic" k2="1" k3="1" result="drawing" />
    </filter>
    <filter id={`${id}-decor`} colorInterpolationFilters="sRGB">
      <feFlood floodColor="var(--首页插画装饰墨色)" result="decorColor" />
      <feComposite in="decorColor" in2="SourceAlpha" operator="in" />
    </filter></defs>
  </svg>;
}

export function HomeMascot({ name, foreground = false }: { name: keyof typeof mascots; foreground?: boolean }) {
  return <>
    <img className={`${foreground ? 'omi-home__mascot-front' : 'omi-home__mascot'} omi-home__mascot--${name}`} src={foreground ? signatureForeground : mascots[name]} alt="" aria-hidden="true" draggable={false} />
    {!foreground && name !== 'side' && <img className={`omi-home__mascot-decor omi-home__mascot-decor--${name}`} src={decor[name]} alt="" aria-hidden="true" draggable={false} />}
  </>;
}
