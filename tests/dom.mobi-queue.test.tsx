import {afterEach,expect,it,vi} from 'vitest';
import {MobiClient} from '../src/reader/mobiClient';

const workers:TestWorker[]=[];
class TestWorker {
  onmessage?:({data}:{data:any})=>void;onerror?:()=>void;
  sent:any[]=[];terminate=vi.fn();
  constructor(){workers.push(this);}
  postMessage(data:any){this.sent.push(data);}
  finish(){const request=this.sent.at(-1);this.onmessage?.({data:{id:request.id,data:request.method==='preview'?null:{html:`<p>chapter ${request.index}</p>`,images:[]}}});}
}
afterEach(()=>{workers.length=0;vi.unstubAllGlobals();vi.useRealTimers();});
function client(){vi.stubGlobal('Worker',TestWorker);const client=new MobiClient();return {client,worker:workers.at(-1)!};}

it('quick jumps wait for the parser and put the newest foreground chapter ahead of previews',async()=>{
  const {client:c,worker:w}=client();
  const first=c.chapter(0),preview=c.preview(1),old=c.chapter(2),destination=c.chapter(8);c.focus(8);
  expect(w.sent.map(r=>r.index)).toEqual([0]);
  w.finish();expect(w.sent.map(r=>r.index)).toEqual([0,8]);
  w.finish();expect(w.sent.at(-1).index).toBe(2);
  w.finish();expect(w.sent.at(-1).method).toBe('preview');w.finish();
  const result=await Promise.all([first,preview,old,destination]);expect(result[1]).toBeNull();expect(result[3]).toContain('chapter 8');c.close();
});
it('waiting behind another chapter does not consume a queued chapter timeout',async()=>{
  vi.useFakeTimers();const {client:c,worker:w}=client();const first=c.chapter(0),next=c.chapter(1);
  await vi.advanceTimersByTimeAsync(29000);w.finish();await vi.advanceTimersByTimeAsync(2000);expect(w.terminate).not.toHaveBeenCalled();w.finish();await Promise.all([first,next]);c.close();
});
it('closing a book releases both active and queued chapter readers',async()=>{
  const {client:c,worker:w}=client(),first=c.chapter(0),next=c.chapter(1),preview=c.preview(2);
  const settled=Promise.allSettled([first,next,preview]);c.close();
  expect((await settled).every(result=>result.status==='rejected')).toBe(true);expect(w.terminate).toHaveBeenCalledOnce();expect(w.sent).toHaveLength(1);
});
