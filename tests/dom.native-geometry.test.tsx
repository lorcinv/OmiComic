import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import useNativeReaderSurface from '../src/android/useNativeReaderSurface';
import { DEFAULT_ADJUSTMENTS } from '../electron/shared/readerPreferences';

const notify=vi.hoisted(()=>vi.fn());
vi.mock('../src/android/bridge',()=>({androidNotify:notify,hasAndroidRenderer:()=>true}));
const settings={readerMemoryCacheSizeMb:100,readerImageLoadConcurrency:2};
let top=10.12,height=600,nextFrame=0;
let frames:Map<number,FrameRequestCallback>;
let resizeCallbacks:Array<()=>void>;
const box=(left:number,y:number,width:number,h:number)=>({left,top:y,right:left+width,bottom:y+h,width,height:h,x:left,y,toJSON(){}} as DOMRect);
function Reader({active=true,native=true}:{active?:boolean;native?:boolean}){
  const stage=useRef<HTMLDivElement>(null);
  useNativeReaderSurface(stage,71,native,active,settings,DEFAULT_ADJUSTMENTS);
  return <div ref={stage} className="reader-stage"><span data-native-image="page-1" style={{opacity:1}} /></div>;
}
const messages=()=>notify.mock.calls.filter(call=>call[0]==='readerFrame').map(call=>call[1]);
function nextPaint(){act(()=>{const batch=[...frames.values()];frames.clear();batch.forEach(callback=>callback(0));});}
function resized(){act(()=>resizeCallbacks.forEach(callback=>callback()));nextPaint();}

beforeEach(()=>{
  top=10.12;height=600;frames=new Map();resizeCallbacks=[];notify.mockClear();
  vi.stubGlobal('devicePixelRatio',2);
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{const id=++nextFrame;frames.set(id,callback);return id;});
  vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
  vi.stubGlobal('ResizeObserver',class{constructor(callback:()=>void){resizeCallbacks.push(callback);}observe(){}disconnect(){}});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
    return this.classList.contains('reader-stage')?box(0,0,400,height):box(0,top,400,500);
  });
});
afterEach(()=>vi.unstubAllGlobals());

describe('native Android reader layout synchronization',()=>{
  it('tracks PDF and EPUB sessions without enabling the native image canvas',()=>{
    const view=render(<Reader native={false}/>);
    expect(notify).toHaveBeenLastCalledWith('readerConfigure',expect.objectContaining({reading:true,active:false}));
    expect(document.documentElement.dataset.nativeReader).toBeUndefined();
    expect(messages()).toHaveLength(0);
    view.rerender(<Reader native={false} active={false}/>);
    expect(notify).toHaveBeenLastCalledWith('readerConfigure',expect.objectContaining({reading:false,active:false}));
  });
  it('keeps fine lines at a stable physical pixel while CSS layout fractions fluctuate',()=>{
    render(<Reader/>);nextPaint();const first=messages().at(-1);
    expect(first.slots[0].rect).toEqual([0,10,400,510]);
    const count=messages().length;top=10.16;resized();top=10.08;resized();
    expect(messages()).toHaveLength(count);
    top=10.4;resized();const moved=messages().at(-1);
    expect(moved.slots[0].rect).toEqual([0,10.5,400,510.5]);
    expect(moved.sequence).toBeGreaterThan(first.sequence);
  });
  it('updates the native clip after a layout-only resize and stops after leaving the reader',()=>{
    const view=render(<Reader/>);nextPaint();height=520;resized();
    expect(messages().at(-1).clip).toEqual([0,0,400,520]);
    const count=messages().length;view.rerender(<Reader active={false}/>);nextPaint();
    expect(messages()).toHaveLength(count);expect(frames.size).toBe(0);
  });
});
