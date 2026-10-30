import { useRef } from 'react';
import { act, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import useReaderDisplaySampling from '../src/hooks/useReaderDisplaySampling';
import { holdDisplaySampling, noteDisplaySamplingMotion } from '../src/reader/displaySampling';
import { imageFilter } from '../src/components/ReaderImageEffects';
import { DEFAULT_ADJUSTMENTS } from '../electron/shared/readerPreferences';

it('uses no compositor colour filter for neutral adjustments while retaining real adjustments',()=>{
  expect(imageFilter({...DEFAULT_ADJUSTMENTS,enabled:true},'gamma')).toBe('none');
  expect(imageFilter({...DEFAULT_ADJUSTMENTS,enabled:true,brightness:120},'gamma')).toContain('brightness(1.2)');
});

const jobs=vi.hoisted(()=>[] as Array<(bitmap:ImageBitmap)=>void>);
vi.mock('../src/reader/displaySampling',async original=>({
  ...await original<typeof import('../src/reader/displaySampling')>(),
  queueDisplaySampling:(_source:unknown,_width:number,_height:number,finish:(bitmap:ImageBitmap)=>void)=>{jobs.push(finish);return vi.fn();},
}));
function Page({name,report,sourceWidth=0,sourceHeight=0}:{name:string;report:(bytes:number)=>void;sourceWidth?:number;sourceHeight?:number}){
  const host=useRef<HTMLDivElement>(null),sample=useReaderDisplaySampling(host,name,true,false,report,{width:sourceWidth,height:sourceHeight});
  return <div ref={host} data-pending={sample.pending} data-ready={sample.ready}><div className="reader-effects-original"><img src="data:image/png;base64,AA=="/></div><canvas ref={sample.canvas} width={0} height={0}/></div>;
}
it('falls back to the original after a failed pixel copy instead of keeping the reader hidden',async()=>{
  const originalWorker=globalThis.Worker,originalBitmap=globalThis.createImageBitmap;
  vi.stubGlobal('Worker',class{});vi.stubGlobal('createImageBitmap',vi.fn());vi.useFakeTimers();
  vi.spyOn(HTMLImageElement.prototype,'naturalWidth','get').mockReturnValue(1000);vi.spyOn(HTMLImageElement.prototype,'naturalHeight','get').mockReturnValue(1500);
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:400,bottom:600,x:0,y:0,width:400,height:600,toJSON(){}});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage(){throw new Error('Lost pixels');}} as any);
  const start=jobs.length,view=render(<Page name="failed-copy" report={vi.fn()}/>);
  try{await act(async()=>{await Promise.resolve();vi.advanceTimersByTime(45);});const bitmap={close:vi.fn()};act(()=>jobs[start](bitmap as any));expect(view.container.firstElementChild?.getAttribute('data-pending')).toBe('false');expect(view.container.firstElementChild?.getAttribute('data-ready')).toBe('false');expect(bitmap.close).toHaveBeenCalledOnce();}
  finally{view.unmount();vi.useRealTimers();vi.stubGlobal('Worker',originalWorker);vi.stubGlobal('createImageBitmap',originalBitmap);}
});
it('prepares a lazy page from known header dimensions before the browser decodes its original',async()=>{
  const originalWorker=globalThis.Worker,originalBitmap=globalThis.createImageBitmap;
  vi.stubGlobal('Worker',class{});vi.stubGlobal('createImageBitmap',vi.fn());vi.useFakeTimers();
  vi.spyOn(HTMLImageElement.prototype,'naturalWidth','get').mockReturnValue(0);vi.spyOn(HTMLImageElement.prototype,'naturalHeight','get').mockReturnValue(0);
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:400,bottom:600,x:0,y:0,width:400,height:600,toJSON(){}});
  const start=jobs.length,view=render(<Page name="lazy" report={vi.fn()} sourceWidth={1000} sourceHeight={1500}/>);
  try{await act(async()=>{await Promise.resolve();vi.advanceTimersByTime(45);});expect(jobs).toHaveLength(start+1);}
  finally{view.unmount();vi.useRealTimers();vi.stubGlobal('Worker',originalWorker);vi.stubGlobal('createImageBitmap',originalBitmap);}
});
it('keeps a pending filter after repeated same-size notifications and owns the delivered pixels',async()=>{
  const originalWorker=globalThis.Worker,originalBitmap=globalThis.createImageBitmap;
  vi.useFakeTimers();vi.stubGlobal('Worker',class{});vi.stubGlobal('createImageBitmap',vi.fn());
  vi.spyOn(HTMLImageElement.prototype,'naturalWidth','get').mockReturnValue(8000);vi.spyOn(HTMLImageElement.prototype,'naturalHeight','get').mockReturnValue(10000);
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:659,bottom:824,x:0,y:0,width:659,height:824,toJSON(){}});
  const drawImage=vi.fn();vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage} as any);
  const start=jobs.length,report=vi.fn(),view=render(<Page name="dense" report={report}/>);
  try{
    await act(async()=>{await Promise.resolve();});
    act(()=>{vi.advanceTimersByTime(20);window.dispatchEvent(new Event('resize'));});
    act(()=>{vi.advanceTimersByTime(200);});expect(jobs).toHaveLength(start+1);
    const bitmap={close:vi.fn()};act(()=>jobs[start](bitmap as any));
    expect(drawImage).toHaveBeenCalledWith(bitmap,0,0);expect(bitmap.close).toHaveBeenCalledOnce();
    expect(report).toHaveBeenLastCalledWith(659*824*4);
  }finally{view.unmount();vi.useRealTimers();vi.stubGlobal('Worker',originalWorker);vi.stubGlobal('createImageBitmap',originalBitmap);}
});
it('releases each book allocation through its own owner and rejects a late result',async()=>{
  const originalWorker=globalThis.Worker,originalBitmap=globalThis.createImageBitmap;
  vi.stubGlobal('Worker',class {});vi.stubGlobal('createImageBitmap',vi.fn());vi.useFakeTimers();
  vi.spyOn(HTMLImageElement.prototype,'naturalWidth','get').mockReturnValue(1000);
  vi.spyOn(HTMLImageElement.prototype,'naturalHeight','get').mockReturnValue(1500);
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:400,bottom:600,width:400,height:600,x:0,y:0,toJSON(){}});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as any);
  const first=vi.fn(),second=vi.fn(),start=jobs.length;
  try{
    const view=render(<Page name="first" report={first}/>);
    await act(async()=>{await Promise.resolve();vi.advanceTimersByTime(45);});
    expect(jobs).toHaveLength(start+1);act(()=>jobs[start]({close:vi.fn()} as any));expect(first).toHaveBeenLastCalledWith(960000);
    view.rerender(<Page name="second" report={second}/>);expect(first).toHaveBeenLastCalledWith(0);
    const late={close:vi.fn()};act(()=>jobs[start](late as any));expect(late.close).toHaveBeenCalledOnce();
    await act(async()=>{await Promise.resolve();vi.advanceTimersByTime(45);});expect(jobs).toHaveLength(start+2);
    act(()=>jobs[start+1]({close:vi.fn()} as any));expect(second).toHaveBeenLastCalledWith(960000);
    view.unmount();expect(second).toHaveBeenLastCalledWith(0);
  }finally{vi.useRealTimers();vi.stubGlobal('Worker',originalWorker);vi.stubGlobal('createImageBitmap',originalBitmap);}
});
it('waits for the panorama to rest before filtering a page or releasing one that left the screen',async()=>{
  const originalWorker=globalThis.Worker,originalBitmap=globalThis.createImageBitmap,originalObserver=globalThis.IntersectionObserver;
  let change=(_visible:boolean)=>{};
  vi.stubGlobal('IntersectionObserver',class { constructor(callback:IntersectionObserverCallback,options?:IntersectionObserverInit){if(options?.rootMargin)change=visible=>callback([{isIntersecting:visible} as IntersectionObserverEntry],this as unknown as IntersectionObserver);} observe(){} unobserve(){} disconnect(){} });
  vi.stubGlobal('Worker',class {});vi.stubGlobal('createImageBitmap',vi.fn());vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
  vi.spyOn(HTMLImageElement.prototype,'naturalWidth','get').mockReturnValue(1000);
  vi.spyOn(HTMLImageElement.prototype,'naturalHeight','get').mockReturnValue(1500);
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:400,bottom:600,width:400,height:600,x:0,y:0,toJSON(){}});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as any);
  const report=vi.fn(),start=jobs.length;
  try{
    const view=render(<Page name="moving" report={report}/>);
    const release=holdDisplaySampling();
    act(()=>change(true));act(()=>{vi.advanceTimersByTime(1000);});expect(jobs).toHaveLength(start);
    release();act(()=>{vi.advanceTimersByTime(160);});act(()=>{vi.advanceTimersByTime(45);});
    expect(jobs).toHaveLength(start+1);act(()=>jobs[start]({close:vi.fn()} as any));expect(report).toHaveBeenLastCalledWith(960000);
    noteDisplaySamplingMotion();act(()=>change(false));expect(report).toHaveBeenLastCalledWith(960000);
    act(()=>{vi.advanceTimersByTime(160);});expect(report).toHaveBeenLastCalledWith(0);
    view.unmount();
  }finally{vi.advanceTimersByTime(5000);vi.useRealTimers();vi.stubGlobal('Worker',originalWorker);vi.stubGlobal('createImageBitmap',originalBitmap);vi.stubGlobal('IntersectionObserver',originalObserver);}
});

it('retains ready pixels across the original-size cutoff and samples only the final restored size', async () => {
  const originalWorker = globalThis.Worker, originalBitmap = globalThis.createImageBitmap;
  vi.stubGlobal('Worker', class {}); vi.stubGlobal('createImageBitmap', vi.fn());
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1000);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(1500);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const scale = Number(this.closest<HTMLElement>('.reader-page-spread')?.style.scale) || 1;
    return { left: 0, top: 0, right: 400 * scale, bottom: 600 * scale, width: 400 * scale, height: 600 * scale, x: 0, y: 0, toJSON() {} };
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as any);
  const report = vi.fn(), start = jobs.length;
  const content = (scale: number) => <div className="reader-page-spread" style={{ scale: String(scale) }}><Page name="restoring" report={report}/></div>;
  const view = render(content(1)); let release = () => {};
  try {
    await act(async () => { await Promise.resolve(); vi.advanceTimersByTime(45); });
    act(() => jobs[start]({ close: vi.fn() } as any));
    const host = view.container.querySelector('[data-ready]')!, canvas = host.querySelector('canvas')!;
    expect(canvas.width).toBe(400); expect(host.getAttribute('data-ready')).toBe('true');
    release = holdDisplaySampling();
    view.rerender(content(3));
    await act(async () => { await Promise.resolve(); vi.advanceTimersByTime(100); });
    expect(canvas.width).toBe(400); expect(host.getAttribute('data-pending')).toBe('false');
    view.rerender(content(.5));
    await act(async () => { await Promise.resolve(); vi.advanceTimersByTime(100); });
    expect(canvas.width).toBe(400); expect(jobs).toHaveLength(start + 1);
    release(); act(() => { vi.advanceTimersByTime(160); vi.advanceTimersByTime(45); });
    expect(jobs).toHaveLength(start + 2);
    act(() => jobs[start + 1]({ close: vi.fn() } as any));
    expect(canvas.width).toBe(200); expect(canvas.height).toBe(300); expect(host.getAttribute('data-ready')).toBe('true');
    view.rerender(content(3));
    await act(async () => { await Promise.resolve(); });
    expect(canvas.width).toBe(0); expect(host.getAttribute('data-pending')).toBe('false');
    release = holdDisplaySampling(); view.rerender(content(1));
    await act(async () => { await Promise.resolve(); });
    release(); act(() => { vi.advanceTimersByTime(160); vi.advanceTimersByTime(45); });
    expect(jobs).toHaveLength(start + 3);
    // Original pixels remain visible even after the animation, until the new
    // filtered bitmap has actually arrived; starting its job must not hide them.
    expect(host.getAttribute('data-pending')).toBe('false');
    act(() => jobs[start + 2]({ close: vi.fn() } as any)); expect(canvas.width).toBe(400);
  } finally {
    release(); view.unmount(); vi.advanceTimersByTime(5000); vi.useRealTimers();
    vi.stubGlobal('Worker', originalWorker); vi.stubGlobal('createImageBitmap', originalBitmap);
  }
});
