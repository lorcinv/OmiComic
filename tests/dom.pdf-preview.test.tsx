import { afterEach, expect, it, vi } from 'vitest';
import { DocumentSource } from '../src/reader/documentSource';
import { holdDisplaySampling } from '../src/reader/displaySampling';

const pdf=vi.hoisted(()=>({getPage:vi.fn(),getDocument:vi.fn()}));
vi.mock('../src/reader/pdfRuntime',()=>({getSharedPdfWorker:()=>undefined,getDocument:pdf.getDocument,PDFDataRangeTransport:class{constructor(..._args:unknown[]){}abort(){}}}));
afterEach(()=>vi.restoreAllMocks());
it('publishes a ready body preview while an obsolete thumbnail render still owns the preview queue',async()=>{
  const finish=new Map<number,()=>void>();
  const render=vi.fn((index:number)=>({promise:new Promise<void>(resolve=>finish.set(index,resolve)),cancel(){finish.get(index)?.();}}));
  pdf.getPage.mockImplementation(async(index:number)=>({getViewport:({scale}:{scale:number})=>({width:600*scale,height:800*scale}),render:()=>render(index),cleanup(){}}));
  pdf.getDocument.mockReturnValue({promise:Promise.resolve({numPages:6,getPage:pdf.getPage}),destroy:async()=>{}});
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage(){}} as any);
  vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/jpeg;base64,ready');
  window.omicomic={openDocument:async()=>({ok:true,data:{size:64,chapters:[]}}),readDocumentRange:async()=>({ok:true,data:new Uint8Array(64)}),closeDocument:async()=>({ok:true,data:null})} as any;
  const source=new DocumentSource({key:'pdf:test',resourceKey:'pdf:test',sourcePath:'/test.pdf',sourceType:'pdf',title:'test',pages:[],total:0});
  await source.open();const old=source.readPreview(0);for(let i=0;i<8;i++)await Promise.resolve();expect(finish.has(1)).toBe(true);
  const body=source.readPage(5);for(let i=0;i<8;i++)await Promise.resolve();
  const target=source.readPreview(5);finish.get(6)!();await body;
  await expect(target).resolves.toContain('ready');expect(render.mock.calls.map(([index])=>index)).toEqual([1,6]);
  finish.get(1)!();await old;source.dispose();
});

it('yields mobile PDF drawing during motion and cancels a deferred slice when the reader closes',async()=>{
  vi.useFakeTimers();document.documentElement.dataset.platform='android';
  let finish!:()=>void;
  const task={promise:new Promise<void>(resolve=>finish=resolve),cancel:vi.fn(()=>finish()),onContinue:undefined as undefined|((resume:()=>void)=>void)};
  pdf.getPage.mockResolvedValue({getViewport:({scale}:{scale:number})=>({width:600*scale,height:800*scale}),render:()=>task,cleanup(){}});
  pdf.getDocument.mockReturnValue({promise:Promise.resolve({numPages:6,getPage:pdf.getPage}),destroy:async()=>{}});
  window.omicomic={openDocument:async()=>({ok:true,data:{size:64,chapters:[]}}),readDocumentRange:async()=>({ok:true,data:new Uint8Array(64)}),closeDocument:async()=>({ok:true,data:null})} as any;
  const source=new DocumentSource({key:'pdf:motion',resourceKey:'pdf:motion',sourcePath:'/motion.pdf',sourceType:'pdf',title:'motion',pages:[],total:0});
  let release=()=>{};
  try{
    await source.open();const body=source.readPage(0);for(let i=0;i<8;i++)await Promise.resolve();
    const resume=vi.fn();task.onContinue!(resume);expect(resume).toHaveBeenCalledTimes(1);
    release=holdDisplaySampling();task.onContinue!(resume);expect(resume).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(16);expect(resume).toHaveBeenCalledTimes(2);
    task.onContinue!(resume);source.dispose();await expect(body).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(32);expect(resume).toHaveBeenCalledTimes(2);expect(task.cancel).toHaveBeenCalled();
  }finally{source.dispose();release();await vi.advanceTimersByTimeAsync(200);delete document.documentElement.dataset.platform;vi.useRealTimers();}
});
