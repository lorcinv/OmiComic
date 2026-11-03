import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties} from 'react';
import {createPortal}from'react-dom';
import {t}from'../i18n';
import {dismissNotice,useNotices}from'../notifications';
import useMobileLayout from '../hooks/useMobileLayout';
import '../styles/notices.css';

export default function NoticeStack(){
  const notices=useNotices(),first=notices[0],mobile=useMobileLayout(),front=useRef<HTMLDivElement>(null);
  const[bounds,setBounds]=useState({left:18,top:58,width:innerWidth-36,height:46});
  useEffect(()=>{
    if(!first?.duration)return;
    const timer=setTimeout(()=>dismissNotice(first.id),first.duration);
    return()=>clearTimeout(timer);
  },[first?.id,first?.duration]);
  useLayoutEffect(()=>{
    if(!first)return;
    let frame=0;
    const measure=()=>{
      const target=document.querySelector<HTMLElement>('.page-panel.is-visible .library-body, .page-panel.is-visible .reader-stage')??document.querySelector<HTMLElement>('.omi-home, .app-content');
      const rect=target?.getBoundingClientRect(),inset=mobile?12:18;
      const next={left:(rect?.left??0)+inset,top:(rect?.top??46)+(mobile?10:12),width:Math.max(120,(rect?.width??innerWidth)-inset*2),height:front.current?.offsetHeight??46};
      setBounds(old=>Object.keys(next).every(key=>old[key as keyof typeof old]===next[key as keyof typeof next])?old:next);
    };
    const mark=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;measure();});};
    measure();const resize=new ResizeObserver(mark);resize.observe(document.documentElement);if(front.current)resize.observe(front.current);
    const changes=new MutationObserver(mark),shell=document.querySelector('.app-shell');if(shell)changes.observe(shell,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
    window.addEventListener('resize',mark);window.visualViewport?.addEventListener('resize',mark);
    return()=>{cancelAnimationFrame(frame);resize.disconnect();changes.disconnect();window.removeEventListener('resize',mark);window.visualViewport?.removeEventListener('resize',mark);};
  },[first?.id,mobile]);
  if(!first)return null;
  return createPortal(<div className="notice-stack" style={{left:bounds.left,top:bounds.top,width:bounds.width,'--notice-height':`${bounds.height}px`} as CSSProperties}>
    {notices.slice(0,3).map((notice,index)=><div key={notice.id} ref={index===0?front:undefined} className={`app-notice notice-${notice.kind} ${index?'is-queued':''} ${notice.className??''}`} role={index?undefined:notice.kind==='error'?'alert':'status'} aria-hidden={index?true:undefined} style={{zIndex:3-index,transform:`translate(${index*4}px,${index*6}px)`}}>
      <span>{notice.className==='directory-drop-notice'?t(notice.text).replace(/[。．.]+$/u,''):t(notice.text)}</span><button type="button" tabIndex={index?-1:0} aria-label={t(notice.closeLabel)} onClick={()=>dismissNotice(notice.id)}>×</button>
    </div>)}
  </div>,document.body);
}
