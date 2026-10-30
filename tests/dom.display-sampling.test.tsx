import { describe, expect, it, vi } from 'vitest';
import { displaySamplingMoving, displaySamplingSize, holdDisplaySampling, noteDisplaySamplingMotion, queueDisplaySampling } from '../src/reader/displaySampling';

describe('reader display sampling during panorama motion', () => {
  it('does not wait on a lazy HTML image before starting a URL job at rest',async()=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
    let worker:{posted:any[];onmessage?:(event:{data:unknown})=>void}|undefined;
    vi.stubGlobal('Worker',class{posted:any[]=[];onmessage?:(event:{data:unknown})=>void;constructor(){worker=this;}postMessage(value:unknown){this.posted.push(value);}terminate(){}});
    const image=document.createElement('img');image.src='omicomic-image://page/lazy';image.decode=vi.fn();const makeBitmap=vi.fn();vi.stubGlobal('createImageBitmap',makeBitmap);
    try{
      const finish=vi.fn(),cancel=queueDisplaySampling(image,400,600,finish);
      expect(worker!.posted[0]).toMatchObject({url:image.src,width:400,height:600});expect(image.decode).not.toHaveBeenCalled();expect(makeBitmap).not.toHaveBeenCalled();
      worker!.onmessage!({data:{id:worker!.posted[0].id,bitmap:{close:vi.fn()}}});expect(finish).toHaveBeenCalledOnce();cancel();
    }finally{vi.advanceTimersByTime(5000);vi.useRealTimers();vi.unstubAllGlobals();}
  });
  it('loads URL sources off-thread and delivers new pages during a held drag', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout','performance'] });
    let worker: { posted: any[]; onmessage?: (event: { data: unknown }) => void } | undefined;
    vi.stubGlobal('Worker', class { posted: any[] = []; onmessage?: (event: { data: unknown }) => void; constructor() { worker = this; } postMessage(data: unknown) { this.posted.push(data); } terminate() {} });
    const makeBitmap = vi.fn(); vi.stubGlobal('createImageBitmap', makeBitmap);
    const image = document.createElement('img'); image.src = 'omicomic-image://page/authorized-test';
    const release = holdDisplaySampling(), finish = vi.fn();
    try {
      const cancel = queueDisplaySampling(image, 659, 824, finish);
      expect(worker!.posted).toEqual([{ id: expect.any(Number), url: image.src, width: 659, height: 824 }]);
      expect(makeBitmap).not.toHaveBeenCalled();
      const bitmap = { close: vi.fn() };
      worker!.onmessage!({ data: { id: worker!.posted[0].id, bitmap } });
      expect(finish).toHaveBeenCalledWith(bitmap); expect(displaySamplingMoving()).toBe(true);
      cancel();
    } finally { release(); vi.advanceTimersByTime(5000); vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
  it('starts, delivers and resumes work only after the strip rests', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout','performance'] });
    const workers: Array<{ posted: any[]; onmessage?: (event: { data: unknown }) => void }> = [];
    vi.stubGlobal('Worker', class { posted: any[] = []; onmessage?: (event: { data: unknown }) => void; constructor() { workers.push(this); } postMessage(data: unknown) { this.posted.push(data); } terminate() {} });
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ close: vi.fn() })));
    const flush = async () => { for (let n = 0; n < 5; n++) await Promise.resolve(); };
    try {
      const release = holdDisplaySampling(), finish = vi.fn(), source = document.createElement('canvas');
      queueDisplaySampling(source, 10, 10, finish);
      await flush(); expect(workers).toHaveLength(0);
      vi.advanceTimersByTime(1000); await flush(); expect(workers).toHaveLength(0);
      release(); vi.advanceTimersByTime(159); await flush(); expect(workers).toHaveLength(0);
      vi.advanceTimersByTime(1); await flush();
      expect(displaySamplingMoving()).toBe(false); expect(workers[0].posted).toHaveLength(1);
      // A result arriving mid-fling is presented after inertia ends.
      noteDisplaySamplingMotion(); vi.advanceTimersByTime(100); noteDisplaySamplingMotion();
      const bitmap = { close: vi.fn() };
      workers[0].onmessage!({ data: { id: workers[0].posted[0].id, bitmap } });
      vi.advanceTimersByTime(159); expect(finish).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1); expect(finish).toHaveBeenCalledWith(bitmap); expect(bitmap.close).not.toHaveBeenCalled();
    } finally { vi.advanceTimersByTime(5000); vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
  it('places on-screen pages ahead of pages prepared beside the screen', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout','clearTimeout','performance'] });
    const posted: Array<{ width: number }> = [];
    let worker: { onmessage?: (event: { data: unknown }) => void } | undefined;
    vi.stubGlobal('Worker', class { onmessage?: (event: { data: unknown }) => void; constructor() { worker = this; } postMessage(data: { width: number }) { posted.push(data); } terminate() {} });
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ close: vi.fn() })));
    const flush = async () => { for (let n = 0; n < 5; n++) await Promise.resolve(); };
    const cancels:Array<()=>void>=[];
    try {
      const release = holdDisplaySampling(), source = document.createElement('canvas');
      cancels.push(queueDisplaySampling(source, 1, 1, vi.fn(), false));
      cancels.push(queueDisplaySampling(source, 2, 2, vi.fn(), false));
      cancels.push(queueDisplaySampling(source, 3, 3, vi.fn(), true));
      release(); vi.advanceTimersByTime(160); await flush();
      expect(posted.map(task => task.width)).toEqual([3]);
      worker!.onmessage!({ data: { id: (posted[0] as any).id, bitmap: { close: vi.fn() } } }); await flush();
      expect(posted.map(task => task.width)).toEqual([3, 1]);
    } finally { for(const cancel of cancels)cancel();vi.advanceTimersByTime(5000); vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
});

it('yields a display frame between URL uploads while a drag is held', () => {
  vi.useFakeTimers({toFake:['setTimeout','clearTimeout','performance']});
  let worker:any;vi.stubGlobal('Worker',class{posted:any[]=[];onmessage:any;constructor(){worker=this;}postMessage(value:any){this.posted.push(value);}terminate(){}});
  const source=document.createElement('img');source.src='data:image/png;base64,AA==';const release=holdDisplaySampling();
  const one=queueDisplaySampling(source,400,600,vi.fn()),two=queueDisplaySampling(source,401,601,vi.fn());
  try{expect(worker.posted).toHaveLength(1);worker.onmessage({data:{id:worker.posted[0].id,bitmap:{close:vi.fn()}}});expect(worker.posted).toHaveLength(1);vi.advanceTimersByTime(15);expect(worker.posted).toHaveLength(1);vi.advanceTimersByTime(1);expect(worker.posted).toHaveLength(2);}
  finally{one();two();release();vi.advanceTimersByTime(5000);vi.useRealTimers();vi.unstubAllGlobals();}
});

describe('reader display sampling dimensions', () => {
  it('uses physical output pixels at fractional screen density', () => {
    expect(displaySamplingSize(2000,3000,501.3,751.95,1.25)).toEqual({width:627,height:940});
  });
  it('returns the original source for full resolution, enlargement or an unbounded surface', () => {
    expect(displaySamplingSize(800,1200,800,1200,1)).toBeNull();
    expect(displaySamplingSize(800,1200,500,750,2)).toBeNull();
    expect(displaySamplingSize(8000,10000,4000,5000,1)).toBeNull();
    expect(displaySamplingSize(8000,10000,640,800,1)).toEqual({width:640,height:800});
  });
});
