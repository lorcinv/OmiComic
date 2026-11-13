import React,{useRef} from 'react';
import {act,render} from '@testing-library/react';
import {beforeEach,afterEach,expect,test,vi} from 'vitest';
import useReaderZoom from '../src/hooks/useReaderZoom';

let zoom:ReturnType<typeof useReaderZoom>,clock=1000,sequence=0;
let frames=new Map<number,FrameRequestCallback>();
function Harness({book='one',panorama=false,vertical=false}) {
  const ref=useRef<HTMLDivElement>(null);zoom=useReaderZoom(ref,book,{panorama,vertical});
  return <div ref={ref} data-reader-zoom={zoom.scale}><div className="reader-page-spread" style={zoom.style}/></div>;
}
beforeEach(()=>{
  clock=1000;sequence=0;frames=new Map();
  vi.spyOn(performance,'now').mockImplementation(()=>clock);
  vi.stubGlobal('requestAnimationFrame',(cb:FrameRequestCallback)=>{frames.set(++sequence,cb);return sequence;});
  vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
    const size=this.classList.contains('reader-page-spread')?400*zoom.scale:400;
    return {x:0,y:0,left:0,top:0,width:size,height:size,right:size,bottom:size,toJSON(){}};
  });
});
afterEach(()=>{vi.unstubAllGlobals();delete document.documentElement.dataset.platform;});
function tick(ms=16){act(()=>{clock+=ms;const pending=[...frames.values()];frames.clear();for(const cb of pending)cb(clock);});}
function event(x:number,y:number,id=1,type='touch'){
  const node=document.querySelector('[data-reader-zoom]')!;
  return {pointerId:id,pointerType:type,clientX:x,clientY:y,button:0,timeStamp:clock,target:node,currentTarget:{setPointerCapture(){},hasPointerCapture(){return false;}},preventDefault(){}} as any;
}
function setup(panorama=false,vertical=false){const view=render(<Harness panorama={panorama} vertical={vertical}/>);act(()=>zoom.setScale(3));return view;}
function drag(){act(()=>zoom.down(event(200,200)));for(let n=1;n<=5;n++){clock+=16;act(()=>zoom.move(event(200-n*12,200-n*10)));}}

test('Command-wheel zooms on Mac and preserves ordinary wheel navigation elsewhere',()=>{
  render(<Harness/>);
  const stage=document.querySelector('[data-reader-zoom]')!;
  const wheel=()=>new WheelEvent('wheel',{metaKey:true,deltaY:-120,clientX:200,clientY:200,bubbles:true,cancelable:true});
  document.documentElement.dataset.platform='win32';
  const windowsEvent=wheel();act(()=>stage.dispatchEvent(windowsEvent));
  expect(zoom.scale).toBe(1);expect(windowsEvent.defaultPrevented).toBe(false);
  document.documentElement.dataset.platform='darwin';
  const macEvent=wheel();act(()=>stage.dispatchEvent(macEvent));
  expect(zoom.scale).toBeGreaterThan(1);expect(macEvent.defaultPrevented).toBe(true);
});

test('two axes coast monotonically, a corrected UP cannot reverse them, and lost capture after UP preserves momentum',()=>{
  setup();drag();const held={x:zoom.x,y:zoom.y};clock+=5;
  act(()=>zoom.up(event(180,190)));act(()=>zoom.cancel(event(180,190)));
  tick(32);expect(zoom.x).toBeLessThan(held.x);expect(zoom.y).toBeLessThan(held.y);
  for(let n=0;n<8;n++){const before={x:zoom.x,y:zoom.y};tick();expect(zoom.x).toBeLessThanOrEqual(before.x);expect(zoom.y).toBeLessThanOrEqual(before.y);}
});
test('a paused release and pointer cancellation do not coast',()=>{
  setup();drag();const held=zoom.y;clock+=180;act(()=>zoom.up(event(140,150)));tick(64);expect(zoom.y).toBe(held);
  drag();act(()=>zoom.cancel(event(140,150)));const cancelled=zoom.y;tick(64);expect(zoom.y).toBe(cancelled);
});
test('catching inertia consumes the stop tap; subsequent pinch and book reset leave no stale fling',()=>{
  const view=setup();drag();act(()=>zoom.up(event(140,150)));tick(32);
  act(()=>zoom.down(event(200,200)));const caught=zoom.y;tick(64);expect(zoom.y).toBe(caught);
  let consumed=false;act(()=>{consumed=zoom.up(event(200,200));});expect(consumed).toBe(true);expect(zoom.stoppedInertiaTap()).toBe(true);tick(64);expect(zoom.y).toBe(caught);
  drag();act(()=>zoom.up(event(140,150)));tick();act(()=>{zoom.down(event(170,200));zoom.down(event(230,200,2));});
  clock+=16;act(()=>zoom.move(event(250,200,2)));act(()=>{zoom.up(event(250,200,2));zoom.up(event(170,200));});
  expect(zoom.stoppedInertiaTap()).toBe(false);
  const pinched={x:zoom.x,y:zoom.y,scale:zoom.scale};tick(64);expect({x:zoom.x,y:zoom.y,scale:zoom.scale}).toEqual(pinched);
  drag();act(()=>zoom.up(event(140,150)));tick();view.rerender(<Harness book="two"/>);tick(64);expect(zoom.scale).toBe(1);expect(zoom.x).toBe(0);expect(zoom.y).toBe(0);
});
test('a page swipe owns release; bounds stop each axis and unmount cancels every frame',()=>{
  const view=setup();drag();act(()=>zoom.up(event(140,150),false));const held=zoom.y;tick(64);expect(zoom.y).toBe(held);
  act(()=>zoom.panTo(-390,0));drag();act(()=>zoom.up(event(140,150)));tick(32);expect(zoom.x).toBe(-400);const y=zoom.y;tick(32);expect(zoom.y).toBeLessThan(y);
  view.unmount();expect(frames.size).toBe(0);
});
for(const vertical of [false,true])test(`panorama only coasts across its reading axis (${vertical})`,()=>{
  setup(true,vertical);drag();act(()=>zoom.up(event(140,150)));const held={x:zoom.x,y:zoom.y};tick(32);
  if(vertical){expect(zoom.y).toBe(0);expect(zoom.x).toBeLessThan(held.x);}else{expect(zoom.x).toBe(0);expect(zoom.y).toBeLessThan(held.y);}
});

for (const [panorama,vertical] of [[false,false],[true,false],[true,true]]) {
  test(`zoom clamps at 25%, remains centred and resets (${panorama}/${vertical})`,()=>{
    const view=render(<Harness panorama={panorama} vertical={vertical}/>);
    act(()=>zoom.setScale(.1));expect(zoom.scale).toBe(.25);expect(zoom.active).toBe(true);
    act(()=>zoom.panTo(200,-200));expect(zoom.x).toBe(0);expect(zoom.y).toBe(0);
    act(()=>zoom.setScale(8));expect(zoom.scale).toBe(6);
    act(()=>zoom.reset());tick(320);expect(zoom.scale).toBe(1);expect(zoom.active).toBe(false);
    act(()=>zoom.setScale(.25));view.rerender(<Harness book="next" panorama={panorama} vertical={vertical}/>);
    expect(zoom.scale).toBe(1);
  });
}
test('Ctrl-wheel reaches 25% and a subsequent zoom-in still works',()=>{
  render(<Harness/>);document.documentElement.dataset.platform='win32';
  const stage=document.querySelector('[data-reader-zoom]')!;
  const wheel=(deltaY:number)=>new WheelEvent('wheel',{ctrlKey:true,deltaY,clientX:200,clientY:200,bubbles:true,cancelable:true});
  act(()=>stage.dispatchEvent(wheel(2000)));expect(zoom.scale).toBe(.25);
  act(()=>stage.dispatchEvent(wheel(120)));expect(zoom.scale).toBe(.25);
  act(()=>stage.dispatchEvent(wheel(-120)));expect(zoom.scale).toBeGreaterThan(.25);
});
test('Android pinch reaches 25%, stays there after release and can expand again',()=>{
  render(<Harness/>);document.documentElement.dataset.platform='android';
  act(()=>{zoom.down(event(40,200,1));zoom.down(event(360,200,2));});
  act(()=>zoom.move(event(168,200,1)));act(()=>zoom.move(event(232,200,2)));
  expect(zoom.scale).toBe(.25);
  act(()=>{zoom.up(event(168,200,1));zoom.up(event(232,200,2));});tick(100);expect(zoom.scale).toBe(.25);
  act(()=>{zoom.down(event(168,200,1));zoom.down(event(232,200,2));});
  act(()=>zoom.move(event(100,200,1)));act(()=>zoom.move(event(300,200,2)));
  expect(zoom.scale).toBeGreaterThan(.25);
  act(()=>{zoom.cancel(event(100,200,1));zoom.cancel(event(300,200,2));});
});
