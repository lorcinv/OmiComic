import React,{useRef} from 'react';
import {act,cleanup,render} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import useNativeReaderSurface from '../src/android/useNativeReaderSurface';
import {DEFAULT_ADJUSTMENTS} from '../electron/shared/readerPreferences';

const bridge=vi.hoisted(()=>({notify:vi.fn()}));
vi.mock('../src/android/bridge',()=>({hasAndroidRenderer:()=>true,androidNotify:bridge.notify}));
let callbacks:Map<number,FrameRequestCallback>,frameSequence=0,left=10.25,styleReads:ReturnType<typeof vi.spyOn>;
let resize:{observe:ReturnType<typeof vi.fn>;unobserve:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>};

function Scene(){
  const stage=useRef<HTMLDivElement>(null);
  useNativeReaderSurface(stage,17,true,true,{readerMemoryCacheSizeMb:100,readerImageLoadConcurrency:2},DEFAULT_ADJUSTMENTS);
  return <section className="reader-layout"><div className="reader-toolbar"><span data-testid="counter">1</span></div><div ref={stage} className="reader-stage"><div className="reader-page-spread"><figure className="reader-page-frame"><span data-native-image="a"/></figure><figure className="reader-page-frame"><span data-native-image="b"/></figure><figure className="reader-page-frame"><span data-native-image="offscreen"/></figure></div></div></section>;
}
function geometry(){return bridge.notify.mock.calls.filter(call=>call[0]==='readerFrame').at(-1)?.[1];}
function nextFrame(){const [id,run]=callbacks.entries().next().value!;callbacks.delete(id);act(()=>run(0));}
async function mutations(run:()=>void){await act(async()=>{run();await Promise.resolve();});}

beforeEach(()=>{
  bridge.notify.mockClear();callbacks=new Map();left=10.25;
  vi.stubGlobal('requestAnimationFrame',(run:FrameRequestCallback)=>{const id=++frameSequence;callbacks.set(id,run);return id;});
  vi.stubGlobal('cancelAnimationFrame',(id:number)=>callbacks.delete(id));
  vi.stubGlobal('ResizeObserver',class{observe=vi.fn();unobserve=vi.fn();disconnect=vi.fn();constructor(){resize=this;}});
  styleReads=vi.spyOn(window,'getComputedStyle').mockImplementation(node=>({opacity:node.classList.contains('reader-page-spread')?'.5':'1',visibility:node.closest('[aria-hidden="true"],[data-reader-entry-pending]')?'hidden':'visible',getPropertyValue:()=> '#efefed'} as unknown as CSSStyleDeclaration));
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(){
    if(this.classList.contains('reader-stage'))return new DOMRect(0,0,500,500);
    const image=this.getAttribute('data-native-image');return new DOMRect(image==='offscreen'?800:image==='a'?left:130,0,image?100:500,image?200:500);
  });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});

it('reads shared ancestor styles once per frame and skips offscreen raster styles',()=>{
  const view=render(<Scene/>),spread=view.container.querySelector('.reader-page-spread')!,offscreen=view.container.querySelector('[data-native-image="offscreen"]')!;
  expect(styleReads.mock.calls.filter(([node])=>node===spread)).toHaveLength(1);
  expect(styleReads.mock.calls.some(([node])=>node===offscreen)).toBe(false);
  expect(geometry().slots.map((slot:any)=>[slot.url,slot.alpha])).toEqual([['a',.5],['b',.5]]);
  nextFrame();expect(styleReads.mock.calls.filter(([node])=>node===spread)).toHaveLength(2);
});

it('keeps resize subscriptions through toolbar changes and observes only newly added native pages',async()=>{
  const view=render(<Scene/>),spread=view.container.querySelector('.reader-page-spread')!,counter=view.getByTestId('counter');
  const initial=resize.observe.mock.calls.length;nextFrame();nextFrame();
  await mutations(()=>{counter.textContent='2';counter.setAttribute('data-progress-value','2');});
  nextFrame();expect(resize.observe).toHaveBeenCalledTimes(initial);expect(resize.disconnect).not.toHaveBeenCalled();
  const image=document.createElement('span');image.dataset.nativeImage='new-page';
  await mutations(()=>spread.append(image));expect(resize.observe).toHaveBeenCalledTimes(initial+1);expect(resize.observe).toHaveBeenLastCalledWith(image);
  await mutations(()=>image.remove());expect(resize.unobserve).toHaveBeenCalledWith(image);expect(resize.disconnect).not.toHaveBeenCalled();
});

it('keeps reading moving geometry during animation and responds to inherited visibility and zoom changes',async()=>{
  const view=render(<Scene/>),stage=view.container.querySelector<HTMLElement>('.reader-stage')!,first=view.container.querySelector('[data-native-image="a"]')!.closest('figure')!;
  const size=geometry().slots[0].rect[2]-geometry().slots[0].rect[0];
  await mutations(()=>{stage.dataset.panoramaJumpPhase='arriving';});
  left+=2.25;nextFrame();const before=geometry().slots[0].rect;
  left+=3.25;nextFrame();const after=geometry().slots[0].rect;
  expect(after[0]).toBeGreaterThan(before[0]);expect(after[2]-after[0]).toBe(size);
  await mutations(()=>{first.setAttribute('aria-hidden','true');stage.dataset.readerZoom='1.75';});nextFrame();
  expect(geometry().slots.map((slot:any)=>slot.url)).toEqual(['b']);expect(geometry().zoom).toBe(1.75);
  await mutations(()=>first.removeAttribute('aria-hidden'));nextFrame();expect(geometry().slots.map((slot:any)=>slot.url)).toEqual(['a','b']);
});
