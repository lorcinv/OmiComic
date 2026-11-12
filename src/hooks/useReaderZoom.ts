import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { animateReaderMotion, zoomRestoreProgress } from '../reader/transitionAnimation';
import { readerMotionStyle } from '../reader/cssMotion';
import { noteDisplaySamplingMotion } from '../reader/displaySampling';
import { advanceInertia, estimateTouchVelocity, touchInertiaTime, type MotionSample } from '../reader/motion';
import { primaryModifier } from '../platform';

type View = { scale: number; x: number; y: number };
const initial: View = { scale: 1, x: 0, y: 0 };
export const MIN_READER_ZOOM = .5, MAX_READER_ZOOM = 6;
export const READER_DOUBLE_TAP_ZOOM = 2;
export function isReaderCenter(x: number, y: number, box: Pick<DOMRect, 'left'|'top'|'width'|'height'>) {
  const rx=(x-box.left)/box.width,ry=(y-box.top)/box.height;
  return rx>=.25&&rx<=.75&&ry>=.25&&ry<=.75;
}
export default function useReaderZoom(stage: RefObject<HTMLDivElement>, resetKey: string, options: {panorama?: boolean; vertical?: boolean; pageSwipe?: boolean; doubleTapZoom?: boolean; onBegin?:()=>void} = {}) {
  const [view, setView] = useState(initial), current = useRef(initial), config=useRef(options);config.current=options;
  const points = useRef(new Map<number, {x:number;y:number}>());
  const drag = useRef<{x:number;y:number;view:View;distance:number}|null>(null);
  const gesture = useRef(false), pinching = useRef(false), lastTap = useRef({time:0,x:0,y:0});
  const animation = useRef(() => {});
  const zoomAnchor = useRef<{x:number;y:number}|null>(null);
  const momentum = useRef<number | null>(null), samples = useRef<MotionSample[]>([]);
  const panned = useRef(false), caught = useRef(false);
  const stoppedInertiaTap = useRef(false);
  const stopMomentum = () => {
    if(momentum.current!==null)cancelAnimationFrame(momentum.current);
    momentum.current=null;
  };
  const endRestore = () => { stage.current?.removeAttribute('data-reader-restoring'); };
  const interrupt = () => { stopMomentum(); animation.current(); endRestore(); zoomAnchor.current=null; };
  const pageOverflow = useRef<number | null>(null);
  const origin = (box: DOMRect, fit?: {width:number;height:number}) => {
    const element=stage.current,center={x:box.left+box.width/2,y:box.top+box.height/2};
    if(!element||!config.current.doubleTapZoom||config.current.panorama)return center;
    const style=getComputedStyle(element),padding=(key:'paddingLeft'|'paddingRight'|'paddingTop'|'paddingBottom')=>parseFloat(style[key])||0;
    const left=padding('paddingLeft'),right=padding('paddingRight'),top=padding('paddingTop'),bottom=padding('paddingBottom');
    let size=fit;
    if(!size){const spread=element.querySelector('.reader-page-spread')?.getBoundingClientRect(),scale=Number(element.dataset.readerZoom)||current.current.scale;size={width:(spread?.width??0)/scale,height:(spread?.height??0)/scale};}
    // The ordinary Android page is fitted inside stable safe padding. Its
    // transform origin is that fitted box, not the full-bleed canvas centre.
    return {x:box.left+left+Math.max(box.width-left-right,size.width)/2-element.scrollLeft,
      y:box.top+top+Math.max(box.height-top-bottom,size.height)/2-element.scrollTop};
  };
  const constrain = (next: View, fit?: {width:number;height:number}): View => {
    const scale = Math.max(MIN_READER_ZOOM, Math.min(MAX_READER_ZOOM, next.scale));
    const element=stage.current,viewport=element?.getBoundingClientRect();
    const content=element?.querySelector('.reader-page-spread')?.getBoundingClientRect();
    const old=Number(element?.dataset.readerZoom)||current.current.scale;
    const size=fit??{width:(content?.width??0)/old,height:(content?.height??0)/old};
    const maxX=viewport?(size.width*scale-viewport.width)/2:0;
    const maxY=viewport?(size.height*scale-viewport.height)/2:0;
    const center=viewport?origin(viewport,size):null;
    const shiftX=viewport&&center?center.x-viewport.left-viewport.width/2:0,shiftY=viewport&&center?center.y-viewport.top-viewport.height/2:0;
    const panorama=config.current.panorama,vertical=config.current.vertical;
    // Preserve the original fitted pose at 100%, while allowing enlarged
    // content to reach either edge of the full canvas, including the cutout.
    return {scale,x:panorama&&!vertical?0:Math.max(Math.min(0,-maxX-shiftX),Math.min(Math.max(0,maxX-shiftX),next.x)),y:panorama&&vertical?0:Math.max(Math.min(0,-maxY-shiftY),Math.min(Math.max(0,maxY-shiftY),next.y))};
  };
  const apply = (next: View, bounded=true) => {
    const value=bounded?constrain(next):next;
    if(value.scale===current.current.scale&&value.x===current.current.x&&value.y===current.current.y)return;
    // Separate wheel notches belong to one zoom gesture. Do not sharpen the
    // image in each short pause between them.
    noteDisplaySamplingMotion(value.scale !== current.current.scale ? 320 : 160); current.current=value;setView(value);
  };
  const sample = (point: MotionSample) => {
    samples.current.push(point);
    samples.current=samples.current.filter(value=>value.time>=point.time-120);
  };
  const coast = (release: MotionSample) => {
    // Estimate from held movement, then attenuate a pause before UP separately.
    // A delayed/corrected UP must neither reverse the fling nor discard the
    // last two MOVE samples merely because they straddle the sampling window.
    const pause=Math.max(0,release.time-(samples.current.at(-1)?.time??release.time));
    const attenuation=Math.max(0,1-pause/120)**2;
    let vx=Math.max(-4,Math.min(4,estimateTouchVelocity(samples.current,false).x))*attenuation;
    let vy=Math.max(-4,Math.min(4,estimateTouchVelocity(samples.current,true).y))*attenuation;
    if(config.current.panorama){if(config.current.vertical)vy=0;else vx=0;}
    if(Math.abs(vx)<.08)vx=0;if(Math.abs(vy)<.08)vy=0;
    if(!vx&&!vy)return;
    const decay=touchInertiaTime(Math.hypot(vx,vy));let previous=performance.now();
    const frame=(now:number)=>{
      momentum.current=null;
      const elapsed=Math.min(64,Math.max(0,now-previous));previous=now;
      const dx=advanceInertia(vx,elapsed,decay),dy=advanceInertia(vy,elapsed,decay);
      const next={...current.current,x:current.current.x+dx.distance,y:current.current.y+dy.distance};
      apply(next);
      // Stop axes independently at the image edge; inertia never turns a page.
      vx=Math.abs(next.x-current.current.x)>.01?0:dx.velocity;
      vy=Math.abs(next.y-current.current.y)>.01?0:dy.velocity;
      if(Math.abs(vx)>.015||Math.abs(vy)>.015)momentum.current=requestAnimationFrame(frame);
    };
    momentum.current=requestAnimationFrame(frame);
  };
  const reset=(notify=true)=>{
    interrupt();
    if(notify)config.current.onBegin?.();
    const captured=[...points.current.keys()];points.current.clear();drag.current=null;gesture.current=false;pinching.current=false;lastTap.current={time:0,x:0,y:0};
    samples.current=[];panned.current=false;caught.current=false;
    for(const id of captured)if(stage.current?.hasPointerCapture?.(id))stage.current.releasePointerCapture(id);
    const from=current.current;
    if(!notify||from.scale===1&&from.x===0&&from.y===0){current.current=initial;setView(initial);return;}
    stage.current?.setAttribute('data-reader-restoring','true');
    animation.current=animateReaderMotion(300,progress=>{
      const remaining=1-zoomRestoreProgress(progress);
      apply({scale:1+(from.scale-1)*remaining,x:from.x*remaining,y:from.y*remaining},false);
    },endRestore);
  };
  useLayoutEffect(()=>{reset(false);return interrupt;},[resetKey]);
  useEffect(()=>{
    const stop=()=>{interrupt();samples.current=[];};
    const outside=(event:PointerEvent)=>{if(!stage.current?.contains(event.target as Node))stopMomentum();};
    window.addEventListener('blur',stop);window.addEventListener('resize',stop);
    window.addEventListener('pointerdown',outside,true);
    document.addEventListener('visibilitychange',stop);
    return()=>{window.removeEventListener('blur',stop);window.removeEventListener('resize',stop);window.removeEventListener('pointerdown',outside,true);document.removeEventListener('visibilitychange',stop);};
  },[]);
  const setScale=(scale:number)=>{interrupt();config.current.onBegin?.();apply({scale,x:0,y:0});};
  const toggleAt=(clientX:number,clientY:number)=>{
    if(Math.abs(current.current.scale-1)>.001){reset();return;}
    const box=stage.current?.getBoundingClientRect();if(!box)return;
    interrupt();config.current.onBegin?.();
    const center=origin(box),from={...current.current},x=clientX-center.x,y=clientY-center.y;
    const ratio=READER_DOUBLE_TAP_ZOOM/from.scale;
    const target=constrain({scale:READER_DOUBLE_TAP_ZOOM,x:x-(x-from.x)*ratio,y:y-(y-from.y)*ratio});
    zoomAnchor.current={x:clientX,y:clientY};
    animation.current=animateReaderMotion(220,progress=>{
      // Bound the destination once, then interpolate the fitted page and its
      // offset together. Re-clamping against full-bleed edges each frame would
      // switch centres as the growing page crosses its original safe margin.
      const amount=zoomRestoreProgress(progress);
      apply({scale:from.scale+(target.scale-from.scale)*amount,x:from.x+(target.x-from.x)*amount,y:from.y+(target.y-from.y)*amount},false);
    });
  };
  useEffect(()=>{
    const element=stage.current;if(!element)return;
    const wheel=(e:WheelEvent)=>{
      stopMomentum();
      if(!primaryModifier(e))return;
      e.preventDefault();e.stopPropagation();interrupt();config.current.onBegin?.();
      const box=element.getBoundingClientRect(),old=current.current;
      const scale=Math.max(MIN_READER_ZOOM,Math.min(MAX_READER_ZOOM,old.scale*Math.exp(-e.deltaY*.002)));
      const center=origin(box),x=e.clientX-center.x,y=e.clientY-center.y,ratio=scale/old.scale;
      apply({scale,x:x-(x-old.x)*ratio,y:y-(y-old.y)*ratio});
    };
    element.addEventListener('wheel',wheel,{passive:false});
    return()=>element.removeEventListener('wheel',wheel);
  },[stage]);
  const base=()=>{
    const values=[...points.current.values()];if(!values.length)return;
    const a=values[0],b=values[1]??a;
    drag.current={x:(a.x+b.x)/2,y:(a.y+b.y)/2,view:{...current.current},distance:Math.hypot(a.x-b.x,a.y-b.y)};
  };
  const down=(e:ReactPointerEvent<HTMLDivElement>)=>{
    if((e.target as Element).closest('button,input,a,select,textarea')||e.button>0)return false;
    if(!points.current.size){caught.current=momentum.current!==null;panned.current=false;}
    interrupt();
    pageOverflow.current = null;
    points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});base();
    samples.current=[];sample({x:e.clientX,y:e.clientY,time:e.timeStamp});
    if(points.current.size>1)pinching.current=true;
    if(points.current.size>1||!config.current.panorama&&current.current.scale>1){
      if(!gesture.current)config.current.onBegin?.();
      gesture.current=true;e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();return true;
    }
    return false;
  };
  const move=(e:ReactPointerEvent<HTMLDivElement>)=>{
    pageOverflow.current = null;
    if(!points.current.has(e.pointerId))return false;
    points.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    const start=drag.current;if(!start)return false;
    const values=[...points.current.values()],a=values[0],b=values[1]??a;
    if(values.length>1&&start.distance>0){
      samples.current=[];
      const box=stage.current!.getBoundingClientRect(),cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
      const scale=Math.max(MIN_READER_ZOOM,Math.min(MAX_READER_ZOOM,start.view.scale*Math.hypot(a.x-b.x,a.y-b.y)/start.distance)),ratio=scale/start.view.scale;
      const center=origin(box);
      apply({scale,x:cx-center.x-(start.x-center.x-start.view.x)*ratio,y:cy-center.y-(start.y-center.y-start.view.y)*ratio});
      gesture.current=true;e.preventDefault();return true;
    }
    if(config.current.panorama){
      if(gesture.current)return true;
      if(current.current.scale>1){
        apply({...current.current,x:start.view.x+a.x-start.x,y:start.view.y+a.y-start.y});
        sample({x:a.x,y:a.y,time:e.timeStamp});
        if(Math.hypot(a.x-start.x,a.y-start.y)>=8)panned.current=true;
      }
      return false;
    }
    if(current.current.scale>1){
      // Capturing a zoomed page reserves panning, without consuming a tap.
      if(!pinching.current&&!panned.current&&Math.hypot(a.x-start.x,a.y-start.y)<(e.pointerType==='mouse'?4:8))return false;
      const x=start.view.x+a.x-start.x;
      apply({...current.current,x,y:start.view.y+a.y-start.y});
      sample({x:a.x,y:a.y,time:e.timeStamp});panned.current=true;
      if(config.current.pageSwipe&&!pinching.current&&e.pointerType==='touch')pageOverflow.current=x-current.current.x;
      gesture.current=true;e.preventDefault();return true;
    }
    return gesture.current;
  };
  const up=(e:ReactPointerEvent<HTMLDivElement>,allowInertia=true)=>{
    stoppedInertiaTap.current=false;
    if(!points.current.has(e.pointerId))return false;
    const start=drag.current,wasGesture=gesture.current,wasPinch=pinching.current;
    let restored=false;
    if(!config.current.doubleTapZoom&&!caught.current&&!panned.current&&!pinching.current&&e.pointerType==='touch'&&Math.abs(current.current.scale-1)>.001&&points.current.size===1&&start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<8&&isReaderCenter(e.clientX,e.clientY,stage.current!.getBoundingClientRect())){
      const last=lastTap.current;
      if(e.timeStamp-last.time<320&&Math.hypot(e.clientX-last.x,e.clientY-last.y)<30){reset();restored=true;}
      else lastTap.current={time:e.timeStamp,x:e.clientX,y:e.clientY};
    }
    if(!restored&&allowInertia&&!wasPinch&&panned.current&&points.current.size===1&&current.current.scale>1)
      coast({x:e.clientX,y:e.clientY,time:e.timeStamp});
    if(panned.current||caught.current)lastTap.current={time:0,x:0,y:0};
    points.current.delete(e.pointerId);if(points.current.size)base();else{drag.current=null;gesture.current=false;pinching.current=false;}
    const tap=!panned.current&&!wasPinch&&start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<(e.pointerType==='mouse'?4:8);
    stoppedInertiaTap.current=Boolean(caught.current&&tap);
    return (wasGesture&&!tap)||restored||(caught.current&&!panned.current);
  };
  const cancel=(e:ReactPointerEvent<HTMLDivElement>)=>{
    // Normal pointer-up releases capture too. Only an interrupted live gesture
    // cancels momentum; the ensuing lostpointercapture must not kill its fling.
    if(!points.current.has(e.pointerId))return;
    interrupt();samples.current=[];points.current.delete(e.pointerId);
    if(points.current.size)base();else{drag.current=null;gesture.current=false;pinching.current=false;}
  };
  const clampPan=(pan:{x:number;y:number},fit:{width:number;height:number})=>{const value=constrain({...current.current,...pan},fit);return {x:value.x,y:value.y};};
  return {active:Math.abs(view.scale-1)>.001,scale:view.scale,x:view.x,y:view.y,setScale,toggleAt,zoomAnchor,stop:interrupt,canDoubleClick:()=>!panned.current&&!caught.current&&!pinching.current,stoppedInertiaTap:()=>stoppedInertiaTap.current,clampPan,panTo:(x:number,y:number)=>{interrupt();apply({...current.current,x,y});},pageOverflow:()=>pageOverflow.current,reset:()=>reset(),down,move,up,cancel,style:(options.panorama?{scale:'1',translate:`${view.x}px ${view.y}px`}:readerMotionStyle(view.x,view.y,view.scale)) as CSSProperties};
}
