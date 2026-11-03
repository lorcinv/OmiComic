import { forwardRef,useImperativeHandle,useLayoutEffect,useRef,useState,type RefObject } from 'react';
import type { 阅读页面项 } from '../types';
import DetailPagePreview from './DetailPagePreview';
import type {DocumentSource} from '../reader/documentSource';

export interface DetailPreviewNavigation { scrollToIndex:(index:number)=>void; }
/** One continuous scrollbar with a bounded number of real thumbnail controls. */
export default forwardRef<DetailPreviewNavigation,{
  container:RefObject<HTMLDivElement>;scrollContainer?:RefObject<HTMLElement>;pages:阅读页面项[];
  columns:number;initialIndex:number;onOpen:(index:number)=>void;onGroupChange?:(group:number)=>void;
  selectedIndex?:number;onSelect?:(index:number)=>void;
  documentSource?:DocumentSource;
}>(function ContinuousDetailPreviews({container,scrollContainer,pages,columns,initialIndex,onOpen,onGroupChange,selectedIndex,onSelect,documentSource},navigation) {
  const [view,setView]=useState({top:0,height:600,row:300,gap:10,columns});
  const metrics=useRef({row:300,offset:0,columns}),initial=useRef(initialIndex),notify=useRef(onGroupChange);notify.current=onGroupChange;
  const scrollToIndex=(index:number)=>{
    const scroller=scrollContainer?.current??container.current;if(!scroller)return;
    scroller.scrollTo({top:metrics.current.offset+Math.floor(Math.max(0,Math.min(pages.length-1,index))/metrics.current.columns)*metrics.current.row,behavior:'instant'});
  };
  useImperativeHandle(navigation,()=>({scrollToIndex}));
  useLayoutEffect(()=>{
    const root=container.current,scroller=scrollContainer?.current??root;if(!root||!scroller)return;
    let frame=0;
    const read=()=>{
      frame=0;const first=root.querySelector<HTMLElement>('.resource-detail-thumbnail');
      const style=getComputedStyle(root),gap=Number.parseFloat(style.rowGap)||10;
      // Android density styles can choose a different column count from the
      // desktop scale. Use the rendered grid for both virtualization and jumps.
      const actualColumns=style.gridTemplateColumns.split(/\s+/).filter(track=>/^[\d.]+px$/.test(track)).length||columns;
      const width=(root.clientWidth-(Number.parseFloat(style.paddingLeft)||0)-(Number.parseFloat(style.paddingRight)||0)-(actualColumns-1)*gap)/actualColumns;
      const row=(first?.getBoundingClientRect().height || Math.max(1,(width-12)*4/3+34))+gap;
      const offset=root===scroller?0:root.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop-scroller.clientTop;
      metrics.current={row,offset,columns:actualColumns};
      const top=Math.max(0,scroller.scrollTop-offset),height=scroller.clientHeight;
      setView(old=>old.top===top&&old.height===height&&Math.abs(old.row-row)<.25&&old.gap===gap&&old.columns===actualColumns?old:{top,height,row,gap,columns:actualColumns});
      const lastGroup=Math.max(0,Math.ceil(pages.length/48)-1);
      const atEnd=scroller.scrollTop>0&&scroller.scrollHeight-scroller.scrollTop-height<=1;
      // scrollTop is rounded to device pixels; tolerate a subpixel row boundary.
      notify.current?.(atEnd?lastGroup:Math.min(lastGroup,Math.floor((Math.floor((top+1)/row)*actualColumns+actualColumns-1)/48)));
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(read);};
    const resize=new ResizeObserver(schedule);resize.observe(root);if(scroller!==root)resize.observe(scroller);
    scroller.addEventListener('scroll',schedule,{passive:true});read();
    if(initial.current>0){scrollToIndex(initial.current);initial.current=0;read();}
    return()=>{cancelAnimationFrame(frame);resize.disconnect();scroller.removeEventListener('scroll',schedule);};
  },[container,scrollContainer,pages,columns]);
  const rows=Math.ceil(pages.length/view.columns),first=Math.max(0,Math.floor(view.top/view.row)-2);
  const end=Math.min(rows,Math.ceil((view.top+Math.max(1,view.height))/view.row)+2);
  return <>
    {first>0&&<div aria-hidden="true" style={{gridColumn:'1 / -1',height:Math.max(0,first*view.row-view.gap),overflowAnchor:'none'}}/>}
    {pages.slice(first*view.columns,end*view.columns).map(page=><DetailPagePreview key={page.pageId??`${page.sourcePath}:${page.archiveInnerPath??page.name}`} page={page} documentSource={documentSource} previewPriority={Math.max(0,Math.abs(page.index-Math.floor(view.top/view.row)*view.columns)-view.columns)} selected={page.index===selectedIndex} selectable={!!onSelect} onSelect={()=>onSelect?.(page.index)} onOpen={()=>onOpen(page.index)}/>)}
    {end<rows&&<div aria-hidden="true" style={{gridColumn:'1 / -1',height:Math.max(0,(rows-end)*view.row-view.gap),overflowAnchor:'none'}}/>}
  </>;
});
