import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMobileCoverQueue } from '../src/hooks/useMobileCoverQueue';
import type { 文件条目, 操作结果, 缩略图结果 } from '../src/types';

const read=vi.hoisted(()=>vi.fn());vi.mock('../src/reader/thumbnailClient',()=>({getResourceThumbnail:read}));
const file=(name:string):文件条目=>({id:name,name,path:'/'+name,type:'archive',extension:'cbz',size:100,modifiedAt:1});
let pending:Map<string,{resolve:(v:操作结果<缩略图结果>)=>void;signal:AbortSignal}>;
const flush=()=>act(async()=>{for(let i=0;i<8;i++)await Promise.resolve();});
const publish=vi.fn();
function Queue({names,enabled=true}:{names:string[];enabled?:boolean}){useMobileCoverQueue(names.map(file),enabled,publish);return null;}
beforeEach(()=>{pending=new Map();publish.mockClear();read.mockReset();read.mockImplementation((input,signal)=>new Promise(resolve=>pending.set(input.path,{resolve,signal})));});
describe('mobile visible cover demand',()=>{
  it('publishes each completed cover immediately and keeps overlapping work during scrolling',async()=>{
    const view=render(<Queue names={['a','b','c','d']}/>);await flush();expect([...pending.keys()]).toEqual(['/a','/b']);
    pending.get('/b')!.resolve({ok:true,data:{url:'b-cover'}});await flush();expect(publish).toHaveBeenCalledTimes(1);expect(publish.mock.calls[0][0].path).toBe('/b');
    expect([...pending.keys()]).toEqual(['/a','/b','/c']);
    const oldA=pending.get('/a')!,oldC=pending.get('/c')!;
    view.rerender(<Queue names={['c','d','e']}/>);await flush();
    expect(oldA.signal.aborted).toBe(true);expect(oldC.signal.aborted).toBe(false);
    expect(read.mock.calls.filter(call=>call[0].path==='/c')).toHaveLength(1);
    oldA.resolve({ok:true,data:{url:'obsolete'}});await flush();expect(publish).toHaveBeenCalledTimes(1);
    oldC.resolve({ok:true,data:{url:'c-cover'}});await flush();expect(publish).toHaveBeenCalledTimes(2);
  });
  it('pauses cover work for reader opening and invalidates only affected cached results',async()=>{
    const view=render(<Queue names={['a','b']}/>);await flush();pending.get('/a')!.resolve({ok:true,data:{url:'a-cover'}});await flush();
    const oldB=pending.get('/b')!;view.rerender(<Queue names={['a','b']} enabled={false}/>);await flush();expect(oldB.signal.aborted).toBe(true);
    view.rerender(<Queue names={['a','b']}/>);await flush();expect(read.mock.calls.filter(call=>call[0].path==='/a')).toHaveLength(1);
    await act(async()=>{window.dispatchEvent(new CustomEvent('omi-thumbnail-invalidated',{detail:'/a'}));});await flush();
    expect(read.mock.calls.filter(call=>call[0].path==='/a')).toHaveLength(2);
  });
});
