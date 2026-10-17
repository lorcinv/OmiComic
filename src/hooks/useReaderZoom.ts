import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

type View = { scale: number; x: number; y: number };
const initial: View = { scale: 1, x: 0, y: 0 };
export default function useReaderZoom(stage: RefObject<HTMLDivElement>, resetKey: string) {
  const [view, setView] = useState(initial), current = useRef(initial);
  const points = useRef(new Map<number, {x:number;y:number}>());
  const drag = useRef<{x:number;y:number;view:View;distance:number}|null>(null);
  const gesture = useRef(false), lastTap = useRef({time:0,x:0,y:0});
  const apply = (next: View) => {
    const scale = Math.max(1, Math.min(6, next.scale));
    const viewport = stage.current?.getBoundingClientRect();
    const content = stage.current?.querySelector('.reader-page-spread')?.getBoundingClientRect();
    const old = current.current.scale;
    const maxX = viewport && content ? Math.max(0, (content.width/old*scale-viewport.width)/2) : Infinity;
    const maxY = viewport && content ? Math.max(0, (content.height/old*scale-viewport.height)/2) : Infinity;
    current.current = {scale,x:Math.max(-maxX,Math.min(maxX,next.x)),y:Math.max(-maxY,Math.min(maxY,next.y))};
    setView(current.current);
  };
  const reset = () => { current.current=initial;setView(initial);drag.current=null; };
  useEffect(reset,[resetKey]);
  useEffect(() => {
    const element=stage.current;if(!element)return;
    const wheel=(e:WheelEvent)=>{
      if(!e.ctrlKey)return;
      e.preventDefault();e.stopPropagation();
      const box=element.getBoundingClientRect(),old=current.current;
      const scale=Math.max(1,Math.min(6,old.scale*Math.exp(-e.deltaY*.002)));
      const x=e.clientX-box.left-box.width/2,y=e.clientY-box.top-box.height/2,ratio=scale/old.scale;
      apply({scale,x:x-(x-old.x)*ratio,y:y-(y-old.y)*ratio});
    };
    element.addEventListener('wheel',wheel,{passive:false});
    return()=>element.removeEventListener('wheel',wheel);
  },[stage]);
  const base = () => {
    const values=[...points.current.values()];if(!values.length)return;
    const a=values[0],b=values[1]??a;
    drag.current={x:(a.x+b.x)/2,y:(a.y+b.y)/2,view:{...current.current},distance:Math.hypot(a.x-b.x,a.y-b.y)};
  };
  const down=(e:ReactPointerEvent<HTMLDivElement>)=>{
    if((e.target as Element).closest('button,input')||e.button>0)return false;
    points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});base();
    if(points.current.size>1||current.current.scale>1){gesture.current=true;e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();return true;}
    return false;
  };
  const move=(e:ReactPointerEvent<HTMLDivElement>)=>{
    if(!points.current.has(e.pointerId))return false;
    points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const start=drag.current;if(!start)return false;
    const values=[...points.current.values()],a=values[0],b=values[1]??a;
    if(values.length>1&&start.distance>0){
      const box=stage.current!.getBoundingClientRect(),cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
      const scale=Math.max(1,Math.min(6,start.view.scale*Math.hypot(a.x-b.x,a.y-b.y)/start.distance)),ratio=scale/start.view.scale;
      apply({scale,x:cx-box.left-box.width/2-(start.x-box.left-box.width/2-start.view.x)*ratio,y:cy-box.top-box.height/2-(start.y-box.top-box.height/2-start.view.y)*ratio});
      gesture.current=true;e.preventDefault();return true;
    }
    if(current.current.scale>1){apply({...current.current,x:start.view.x+a.x-start.x,y:start.view.y+a.y-start.y});gesture.current=true;e.preventDefault();return true;}
    return gesture.current;
  };
  const up=(e:ReactPointerEvent<HTMLDivElement>)=>{
    const start=drag.current,wasGesture=gesture.current;
    if(e.pointerType==='touch'&&current.current.scale>1&&start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<10){
      const last=lastTap.current;if(e.timeStamp-last.time<320&&Math.hypot(e.clientX-last.x,e.clientY-last.y)<30)reset();
      lastTap.current={time:e.timeStamp,x:e.clientX,y:e.clientY};
    }
    points.current.delete(e.pointerId);if(points.current.size)base();else{drag.current=null;gesture.current=false;}
    return wasGesture;
  };
  const cancel=(e:ReactPointerEvent<HTMLDivElement>)=>{points.current.delete(e.pointerId);if(!points.current.size){drag.current=null;gesture.current=false;}};
  return {active:view.scale>1,reset,down,move,up,cancel,style:{scale:String(view.scale),translate:`${view.x}px ${view.y}px`} as CSSProperties};
}
