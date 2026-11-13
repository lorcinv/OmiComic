import { memo, useLayoutEffect, useRef, type CSSProperties } from "react";

interface Props {
  html: string;
  title: string;
  width: number;
  height: number;
  style: CSSProperties;
  onPrepared?: ()=>void;
}

function AndroidChapter({html,title,width,height,style,onPrepared}:Props){
  const host=useRef<HTMLDivElement>(null);
  const prepared=useRef(onPrepared);prepared.current=onPrepared;
  useLayoutEffect(()=>{
    const element=host.current;if(!element)return;
    const root=element.shadowRoot??element.attachShadow({mode:'open'});
    const chapter=new DOMParser().parseFromString(html,'text/html');
    // Android chapter HTML is sanitized before this point. A shadow tree keeps
    // its styles contained and paints text synchronously during a page handoff.
    const body=chapter.body;
    while(root.firstChild)root.removeChild(root.firstChild);
    for(const style of chapter.head.querySelectorAll('style'))root.appendChild(style.cloneNode(true));
    root.appendChild(body);
    if(document.documentElement.dataset.colorTheme==='night'){
      const palette=getComputedStyle(document.documentElement);
      body.style.backgroundColor=palette.getPropertyValue('--面板色');body.style.color=palette.getPropertyValue('--主文字');
    }
    const images=[...body.querySelectorAll('img')];
    if(!images.length)prepared.current?.();else void Promise.all(images.map(image=>image.decode().catch(()=>undefined))).then(()=>prepared.current?.());
  },[html]);
  const shownWidth=typeof style.width==='number'?style.width:typeof style.width==='string'&&style.width.endsWith('px')?parseFloat(style.width):width;
  const scale=shownWidth/width;
  return <div className="reader-chapter" role="document" aria-label={title} style={{width:shownWidth,height:height*scale,overflow:'hidden'}}><div ref={host} style={{width,height,transform:`scale(${scale})`,transformOrigin:'top left',pointerEvents:'none'}}/></div>;
}
function ReaderChapter({ html, title, width, height, style, onPrepared }: Props) {
  const prepared=useRef(onPrepared);prepared.current=onPrepared;
  if(document.documentElement.dataset.platform==='android')return <AndroidChapter {...{html,title,width,height,style,onPrepared}}/>;
  const shownWidth = typeof style.width === "string" && style.width.endsWith("px")
    ? Number.parseFloat(style.width) : width;
  const scale = shownWidth / width;
  return <div className="reader-chapter" style={{ width: shownWidth, height: height * scale }}>
    <iframe title={title} srcDoc={html} sandbox="allow-same-origin" referrerPolicy="no-referrer" tabIndex={-1}
      onLoad={event => {
        const frame=event.currentTarget,chapter = frame.contentDocument;
        if (!chapter) return;
        // Keep the previous page until this mounted iframe has its images,
        // fonts and theme. Parsing srcDoc alone is not a painted page.
        void Promise.all([chapter.fonts?.ready,...[...chapter.images].map(image=>image.decode().catch(()=>undefined))]).then(()=>{
          requestAnimationFrame(()=>requestAnimationFrame(()=>{if(frame.isConnected&&frame.contentDocument===chapter)prepared.current?.();}));
        });
        if (document.documentElement.dataset.omiLayout === 'desktop') {
          const selectionStyle = chapter.createElement('style');
          selectionStyle.textContent = '* { user-select: none !important; -webkit-user-select: none !important; }';
          chapter.head.append(selectionStyle);
        }
        for (const name of ['pointerdown', 'wheel', 'keydown']) chapter.addEventListener(name, () => window.dispatchEvent(new Event('omi-pause')), { passive: true });
        if (chapter.body.dataset.omiImagePage==='true'||document.documentElement.dataset.colorTheme !== "night") return;
        const palette = getComputedStyle(document.documentElement);
        chapter.documentElement.style.colorScheme = "dark";
        chapter.body.style.backgroundColor = palette.getPropertyValue("--面板色");
        chapter.body.style.color = palette.getPropertyValue("--主文字");
      }}
      style={{ width, height, transform: `scale(${scale})` }} />
  </div>;
}

export default memo(ReaderChapter, (a, b) => a.html === b.html && a.title === b.title
  && a.width === b.width && a.height === b.height && a.style.width === b.style.width && a.style.height === b.style.height);
