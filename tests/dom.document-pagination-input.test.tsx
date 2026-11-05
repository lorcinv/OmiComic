import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {paginateChapter} from '../src/reader/androidChapterLayout';

const input=vi.hoisted(()=>({moving:false}));
vi.mock('../src/reader/displaySampling',()=>({displaySamplingMoving:()=>input.moving}));
beforeEach(()=>Object.defineProperty(HTMLIFrameElement.prototype,'sandbox',{configurable:true,get(){return this.classList;}}));
afterEach(()=>{input.moving=false;vi.restoreAllMocks();document.querySelectorAll('iframe').forEach(frame=>frame.remove());delete (HTMLIFrameElement.prototype as any).sandbox;});

function prepareFrame(paragraphs=1){
  const frame=document.querySelector('iframe')!,doc=frame.contentDocument!;
  doc.body.innerHTML='<div class="omi-text-flow">'+'<p>文字分页需要让输入和画面继续响应。</p>'.repeat(paragraphs)+'</div>';
  Object.defineProperty(doc,'fonts',{value:{ready:Promise.resolve()}});
  const rectangle={left:0,top:36,right:100,bottom:56,width:100,height:20,x:0,y:36,toJSON:()=>({})} as DOMRect;
  let reads=0;
  const create=doc.createRange.bind(doc);
  vi.spyOn(doc,'createRange').mockImplementation(()=>{const range=create();range.getClientRects=()=>{reads++;return [rectangle] as unknown as DOMRectList;};range.getBoundingClientRect=()=>rectangle;return range;});
  return{frame,doc,reads:()=>reads,load:()=>frame.onload!(new Event('load'))};
}

it('waits for a drag to finish before measuring chapter ranges',async()=>{
  input.moving=true;const controller=new AbortController(),layout=paginateChapter('<p>正文</p>',controller.signal),probe=prepareFrame();probe.load();
  await new Promise(resolve=>setTimeout(resolve,12));expect(probe.reads()).toBe(0);
  input.moving=false;const result=await layout;expect(probe.reads()).toBeGreaterThan(0);expect(result.pages[0]).toContain('文字分页需要');result.dispose?.();
});

it('cancels and removes the measuring iframe while paused for input',async()=>{
  input.moving=true;const controller=new AbortController(),layout=paginateChapter('<p>正文</p>',controller.signal),rejected=expect(layout).rejects.toMatchObject({name:'AbortError'}),probe=prepareFrame();probe.load();
  await new Promise(resolve=>setTimeout(resolve,5));controller.abort(new DOMException('Cancelled','AbortError'));await rejected;
  expect(probe.reads()).toBe(0);expect(probe.frame.isConnected).toBe(false);
});

it('yields between measurement batches and preserves the complete chapter text',async()=>{
  let clock=0;vi.spyOn(performance,'now').mockImplementation(()=>clock+=.5);
  const layout=paginateChapter('<p>正文</p>',new AbortController().signal),probe=prepareFrame(180);let measuredAtHeartbeat=-1;
  const heartbeat=new Promise<void>(resolve=>setTimeout(()=>{measuredAtHeartbeat=probe.reads();resolve();},0));probe.load();await heartbeat;
  expect(measuredAtHeartbeat).toBeGreaterThan(0);expect(measuredAtHeartbeat).toBeLessThan(180);
  const result=await layout,body=new DOMParser().parseFromString(result.pages[0],'text/html').body;
  expect(body.textContent).toBe('文字分页需要让输入和画面继续响应。'.repeat(180));result.dispose?.();
});
