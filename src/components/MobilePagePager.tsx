import { t, tr } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MobileIcon from './MobileIcon';
import MobileSheet from './MobileSheet';

export default function MobilePagePager({ current, total, onPage, label='列表页码', inline=false, detail=false }: {
  current:number; total:number; onPage:(page:number)=>void; label?:string; inline?:boolean; detail?:boolean;
}) {
  const [editing,setEditing]=useState(false), [input,setInput]=useState('');
  function submit() { const page=Number(input); if(!Number.isFinite(page)||page<1)return; onPage(Math.min(total,Math.floor(page)));setEditing(false); }
  return <>
    <nav className={`mobile-page-pill ${inline?'is-inline':''} ${detail?'is-detail-pager':''}`} aria-label={label}>
      <button aria-label={detail?t("上一组预览"):t("上一页资源")} disabled={current<=1} onClick={()=>onPage(current-1)}><MobileIcon name="chevron" style={{transform:'rotate(180deg)'}}/></button>
      <button className="mobile-page-number" aria-label={tr`跳转页码，当前 ${current} / ${total}`} onClick={()=>{setInput(String(current));setEditing(true);}}><output>{current} / {total}</output></button>
      <button aria-label={detail?t("下一组预览"):t("下一页资源")} disabled={current>=total} onClick={()=>onPage(current+1)}><MobileIcon name="chevron"/></button>
    </nav>
    {editing && <MobileSheet title={t("跳转页码")} onClose={()=>setEditing(false)}><form className="mobile-page-jump" onSubmit={event=>{event.preventDefault();submit();}}>
      <label>{t("页码")}<input autoFocus inputMode="numeric" aria-label={t("跳转页码输入")} value={input} onFocus={event=>event.target.select()} onChange={event=>setInput(event.target.value.replace(/\D/g,''))}/><span>/ {total}</span></label>
      <button type="submit" disabled={!Number(input)}>{t("跳转")}</button>
    </form></MobileSheet>}
  </>;
}

export function MobileDetailPager(props: {current:number;total:number;onPage:(page:number)=>void}) {
  const dock=useRef<HTMLDivElement>(null),[past,setPast]=useState(false);
  useEffect(()=>{
    const el=dock.current,root=el?.closest('.resource-detail-page');if(!el||!root)return;
    const observer=new IntersectionObserver(([entry])=>setPast(!entry.isIntersecting&&entry.boundingClientRect.bottom<(entry.rootBounds?.top??0)),{root});
    observer.observe(el);return()=>observer.disconnect();
  },[]);
  return <><div ref={dock} className="mobile-detail-page-dock"><MobilePagePager {...props} label={t("预览分页")} inline detail/></div>
    {past&&createPortal(<MobilePagePager {...props} label={t("浮动预览分页")} detail/>,document.body)}</>;
}
