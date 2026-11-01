import { useLayoutEffect,useState,type RefObject } from 'react';
import type { 阅读页面项 } from '../types';
import DetailPagePreview from './DetailPagePreview';

/** One continuous scrollbar with a bounded number of real thumbnail controls. */
export default function ContinuousDetailPreviews({container,pages,columns,initialIndex,onOpen}:{container:RefObject<HTMLDivElement>;pages:阅读页面项[];columns:number;initialIndex:number;onOpen:(index:number)=>void}) {
  const [view,setView]=useState({top:0,height:600,row:300});
  useLayoutEffect(()=>{
    const root=container.current;if(!root)return;
    let frame=0;
    const read=()=>{
      frame=0;const first=root.querySelector<HTMLElement>('.resource-detail-thumbnail');
      const style=getComputedStyle(root),gap=Number.parseFloat(style.rowGap)||10;
      const width=(root.clientWidth-8-(columns-1)*gap)/columns;
      const row=(first?.getBoundingClientRect().height || Math.max(1,(width-12)*4/3+34))+gap;
      setView(old=>old.top===root.scrollTop&&old.height===root.clientHeight&&Math.abs(old.row-row)<.25?old:{top:root.scrollTop,height:root.clientHeight,row});
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(read);};
    const resize=new ResizeObserver(schedule);resize.observe(root);
    root.addEventListener('scroll',schedule,{passive:true});read();
    return()=>{cancelAnimationFrame(frame);resize.disconnect();root.removeEventListener('scroll',schedule);};
  },[container,pages,columns]);
  useLayoutEffect(()=>{
    const root=container.current;if(!root||initialIndex<1)return;
    root.scrollTop=Math.floor(initialIndex/columns)*view.row;
    setView(old=>({...old,top:root.scrollTop}));
  },[container,pages,initialIndex,columns]);
  const rows=Math.ceil(pages.length/columns),first=Math.max(0,Math.floor(view.top/view.row)-2);
  const end=Math.min(rows,Math.ceil((view.top+Math.max(1,view.height))/view.row)+2);
  return <>
    {first>0&&<div aria-hidden="true" style={{gridColumn:'1 / -1',height:Math.max(0,first*view.row-10),overflowAnchor:'none'}}/>}
    {pages.slice(first*columns,end*columns).map(page=><DetailPagePreview key={page.pageId??`${page.sourcePath}:${page.archiveInnerPath??page.name}`} page={page} selected={false} selectable={false} onSelect={()=>{}} onOpen={()=>onOpen(page.index)}/>)}
    {end<rows&&<div aria-hidden="true" style={{gridColumn:'1 / -1',height:Math.max(0,(rows-end)*view.row-10),overflowAnchor:'none'}}/>}
  </>;
}
