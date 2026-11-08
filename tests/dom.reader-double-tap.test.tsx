import React, {useRef} from 'react';
import {act, render} from '@testing-library/react';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import useReaderDoubleTap, {READER_DOUBLE_TAP_MS,READER_DOUBLE_TAP_MIN_MS} from '../src/hooks/useReaderDoubleTap';
import useReaderZoom from '../src/hooks/useReaderZoom';

let taps: ReturnType<typeof useReaderDoubleTap>, zoom: ReturnType<typeof useReaderZoom>;
const single=vi.fn(), double=vi.fn();
function Harness({enabled=true,book='one'}) {
  const ref=useRef<HTMLDivElement>(null);
  zoom=useReaderZoom(ref,book,{doubleTapZoom:true});
  taps=useReaderDoubleTap(ref,enabled,book,single,(x,y)=>{double(x,y);zoom.toggleAt(x,y);});
  return <div ref={ref} data-reader-zoom={zoom.scale}><div className="reader-page-spread" style={zoom.style}/></div>;
}
function event(x=100,y=120,time=1000,extra={}) {
  const node=document.querySelector('[data-reader-zoom]')!;
  return {pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:x,clientY:y,timeStamp:time,target:node,...extra} as any;
}
function tap(x=100,y=120,time=1000){act(()=>{taps.down(event(x,y,time));taps.tap(event(x,y,time+30));});}
beforeEach(()=>{
  vi.useFakeTimers();single.mockClear();double.mockClear();
  vi.spyOn(window,'matchMedia').mockImplementation(query=>({matches:query.includes('prefers-reduced-motion')} as any));
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
    const size=this.classList.contains('reader-page-spread')?400*zoom.scale:400;
    return {x:0,y:0,left:0,top:0,width:size,height:size,right:size,bottom:size,toJSON(){}};
  });
});
afterEach(()=>{vi.useRealTimers();document.documentElement.style.removeProperty('--android-reader-safe-top');});
test('a single tap waits once; a nearby double tap zooms at the touched content and never pages',()=>{
  render(<Harness/>);tap();act(()=>vi.advanceTimersByTime(READER_DOUBLE_TAP_MIN_MS-1));expect(single).not.toHaveBeenCalled();
  act(()=>vi.advanceTimersByTime(1));expect(single).toHaveBeenCalledExactlyOnceWith(100,120);single.mockClear();
  tap(100,120,2000);tap(104,122,2100);
  expect(double).toHaveBeenCalledExactlyOnceWith(104,122);expect(zoom.scale).toBe(2);
  expect(zoom.x).toBe(96);expect(zoom.y).toBe(78);
  act(()=>vi.advanceTimersByTime(500));expect(single).not.toHaveBeenCalled();
  tap(380,360,3000);tap(380,360,3100);expect(zoom.scale).toBe(1);expect(zoom.x).toBe(0);expect(zoom.y).toBe(0);
});
test('second down reserves the tap across the timer deadline; normal lost capture preserves a pending tap',()=>{
  render(<Harness/>);tap();act(()=>taps.lostCapture(event()));
  act(()=>vi.advanceTimersByTime(170));act(()=>taps.down(event(100,120,1200)));
  act(()=>vi.advanceTimersByTime(200));expect(single).not.toHaveBeenCalled();
  act(()=>taps.tap(event(100,120,1450)));expect(double).toHaveBeenCalledOnce();
});
test('separate positions or a late second tap stay single taps',()=>{
  render(<Harness/>);tap();tap(300,300,1100);act(()=>vi.advanceTimersByTime(300));
  expect(single).toHaveBeenCalledTimes(2);expect(double).not.toHaveBeenCalled();
  single.mockClear();tap(100,120,2000);tap(100,120,2400);act(()=>vi.advanceTimersByTime(300));
  expect(single).toHaveBeenCalledTimes(2);expect(double).not.toHaveBeenCalled();
});
test('a 170 ms gap still doubles; a 190 ms gap is already a confirmed single tap',()=>{
  render(<Harness/>);tap(100,120,1000);
  act(()=>vi.advanceTimersByTime(170));tap(100,120,1200);
  expect(double).toHaveBeenCalledOnce();expect(single).not.toHaveBeenCalled();
  double.mockClear();tap(100,120,2000);act(()=>vi.advanceTimersByTime(190));
  expect(single).toHaveBeenCalledOnce();tap(100,120,2220);act(()=>vi.advanceTimersByTime(200));
  expect(single).toHaveBeenCalledTimes(2);expect(double).not.toHaveBeenCalled();
});

test.each([[0,200],[10,190],[20,180],[150,180],[390,180]])('a %i ms press leaves %i ms for the second tap', (held,delay)=>{
  render(<Harness/>);act(()=>{taps.down(event());taps.tap(event(100,120,1000+held));});
  act(()=>vi.advanceTimersByTime(delay-1));expect(single).not.toHaveBeenCalled();
  act(()=>vi.advanceTimersByTime(1));expect(single).toHaveBeenCalledExactlyOnceWith(100,120);
  expect(delay).toBeLessThanOrEqual(READER_DOUBLE_TAP_MS);expect(delay).toBeGreaterThanOrEqual(READER_DOUBLE_TAP_MIN_MS);
});
test('an expired second down cannot zoom even when the main thread has delayed the timer',()=>{
  render(<Harness/>);tap();tap(100,120,1211);
  expect(single).toHaveBeenCalledOnce();expect(double).not.toHaveBeenCalled();
  act(()=>vi.advanceTimersByTime(180));expect(single).toHaveBeenCalledTimes(2);
});
test('turning double tap off bypasses waiting for every tap and cancels a queued tap',()=>{
  const view=render(<Harness/>);tap();view.rerender(<Harness enabled={false}/>);
  for(const time of [2000,2100])act(()=>{taps.down(event(100,120,time));if(!taps.tap(event(100,120,time+30)))single(100,120);});
  expect(single).toHaveBeenCalledTimes(2);expect(double).not.toHaveBeenCalled();
  act(()=>vi.advanceTimersByTime(400));expect(single).toHaveBeenCalledTimes(2);
  view.rerender(<Harness/>);tap(100,120,3000);tap(100,120,3100);expect(double).toHaveBeenCalledOnce();
});
test('a tap that stops inertia can start a double tap without ever becoming a page turn',()=>{
  render(<Harness/>);act(()=>zoom.setScale(2));
  act(()=>{taps.down(event());taps.tap(event(100,120,1030),true);});
  act(()=>vi.advanceTimersByTime(200));expect(single).not.toHaveBeenCalled();expect(zoom.scale).toBe(2);
  act(()=>{taps.down(event(100,120,2000));taps.tap(event(100,120,2030),true);});
  tap(100,120,2130);expect(double).toHaveBeenCalledOnce();expect(zoom.scale).toBe(1);
  act(()=>vi.advanceTimersByTime(300));expect(single).not.toHaveBeenCalled();
});
test.each(['top','left'])('Android %s safe padding stays fixed throughout zoom and restore',edge=>{
  let frameId=0,now=0;
  const left=edge==='left'?60:0,top=edge==='top'?60:0,width=400+left,height=400+top;
  const frames=new Map<number,FrameRequestCallback>();
  vi.spyOn(window,'matchMedia').mockReturnValue({matches:false} as any);
  vi.spyOn(performance,'now').mockImplementation(()=>now);
  vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{frames.set(++frameId,callback);return frameId;});
  vi.spyOn(window,'cancelAnimationFrame').mockImplementation(id=>{frames.delete(id);});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
    const content=this.classList.contains('reader-page-spread'),size=400*zoom.scale;
    return content?new DOMRect(left+200+zoom.x-size/2,top+200+zoom.y-size/2,size,size):new DOMRect(0,0,width,height);
  });
  const tick=(time:number)=>act(()=>{now=time;const pending=[...frames.values()];frames.clear();pending.forEach(frame=>frame(now));});
  render(<Harness/>);
  const stage=document.querySelector<HTMLElement>('[data-reader-zoom]')!,spread=stage.querySelector<HTMLElement>('.reader-page-spread')!;
  stage.style.paddingLeft=`${left}px`;stage.style.paddingTop=`${top}px`;
  act(()=>zoom.toggleAt(left+160,top+160));
  for(let time=20;time<=220;time+=20){tick(time);const r=spread.getBoundingClientRect();expect(r.x+r.width*.4).toBeCloseTo(left+160);expect(r.y+r.height*.4).toBeCloseTo(top+160);}
  expect(zoom.scale).toBe(2);
  // Either edge can be reached even though fitting keeps a camera margin.
  act(()=>zoom.panTo(10000,10000));let r=spread.getBoundingClientRect();expect(r.x).toBe(0);expect(r.y).toBe(0);
  act(()=>zoom.panTo(-10000,-10000));r=spread.getBoundingClientRect();expect(r.right).toBe(width);expect(r.bottom).toBe(height);
  act(()=>zoom.reset());let previous=r.y;
  for(let time=240;time<=520;time+=20){tick(time);r=spread.getBoundingClientRect();expect(r.y).toBeGreaterThanOrEqual(previous);previous=r.y;}
  expect(zoom.scale).toBe(1);expect(r.x).toBe(left);expect(r.y).toBe(top);expect(stage.getBoundingClientRect().height).toBe(height);
});
test('drag, pinch, pointer cancellation and an outside control cancel queued taps',()=>{
  render(<Harness/>);
  for(const cancel of [()=>taps.move(event(130,120,1150)),()=>taps.down(event(130,120,1150,{isPrimary:false,pointerId:2})),()=>taps.cancel(),()=>window.dispatchEvent(new Event('blur'))]) {
    tap();act(()=>{taps.down(event(100,120,1100));cancel();});act(()=>vi.advanceTimersByTime(400));
  }
  tap();act(()=>document.body.dispatchEvent(new Event('pointerdown',{bubbles:true})));act(()=>vi.advanceTimersByTime(400));
  expect(single).not.toHaveBeenCalled();expect(double).not.toHaveBeenCalled();
});
test('page changes, deactivation and unmount leave no delayed navigation',()=>{
  const view=render(<Harness/>);tap();view.rerender(<Harness book="two"/>);act(()=>vi.advanceTimersByTime(400));
  tap();view.rerender(<Harness book="two" enabled={false}/>);act(()=>vi.advanceTimersByTime(400));
  view.rerender(<Harness/>);tap();view.unmount();act(()=>vi.advanceTimersByTime(400));expect(single).not.toHaveBeenCalled();
});
test('desktop and mouse input bypass the touch delay; a pinch zoom returns directly to fit',()=>{
  const view=render(<Harness enabled={false}/>);expect(taps.tap(event())).toBe(false);
  view.rerender(<Harness/>);expect(taps.tap(event(100,120,1000,{pointerType:'mouse'}))).toBe(false);
  act(()=>zoom.setScale(2.7));tap();tap(100,120,1100);expect(zoom.scale).toBe(1);
});
