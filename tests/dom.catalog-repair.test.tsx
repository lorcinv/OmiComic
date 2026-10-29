import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLibraryCatalog, cancelLibraryCatalog, observeLibraryDirectory } from '../src/library/libraryCatalog';
import { useRandomBrowse } from '../src/hooks/useRandomBrowse';
import { useLibraryQuery } from '../src/hooks/useLibraryQuery';
import { installMock } from './mock';

const file = (root: string, name: string) => ({ id: root + '/' + name, path: root + '/' + name, name, type: 'archive' as const, extension: 'cbz' });
describe('shared discovery and query generations', () => {
  it('publishes a Windows case-only rename as one replacement without keeping the old hit',async()=>{
    const root='C:/case-1147',old={...file(root,'Case.cbz'),size:1,modifiedAt:1};
    observeLibraryDirectory(root,{path:root,parentPath:null,total:1,items:[old]});
    const predicate=(item:typeof old)=>item.type==='archive',compare=(a:typeof old,b:typeof old)=>a.name.localeCompare(b.name);
    const order={key:(item:typeof old)=>item.path,first:()=>false};
    const view=renderHook(()=>{const catalog=useLibraryCatalog(root,false);return useLibraryQuery(catalog.items as typeof old[],predicate,compare,'case',order);});
    await waitFor(()=>expect(view.result.current.map(item=>item.name)).toEqual(['Case.cbz']));
    const renamed={...old,id:root+'/case.cbz',path:root+'/case.cbz',name:'case.cbz'};
    await act(async()=>{observeLibraryDirectory(root,{path:root,parentPath:null,total:1,items:[renamed]});await new Promise(resolve=>setTimeout(resolve,130));});
    await waitFor(()=>expect(view.result.current.map(item=>item.name)).toEqual(['case.cbz']));
  });
  it('publishes a partial batch and preserves two root caches after a consumer leaves', async () => {
    installMock({count:1});
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const requests = new Map<string, number>();
    const scan = vi.spyOn(window.omicomic, 'scanLibrary').mockImplementation(async root => {
      const number = requests.get(root) ?? 0; requests.set(root, number + 1);
      if (root === '/partial-1142' && number === 1) await gate;
      return { ok: true, data: { items: [file(root, String(number))], directories: number + 1, skipped: 0, scannedAt: Date.now(), complete: root !== '/partial-1142' || number > 0 } };
    });
    const first = renderHook(() => useLibraryCatalog('/partial-1142', true));
    const other = renderHook(() => useLibraryCatalog('/other-1142', true));
    await waitFor(() => expect(first.result.current.items.length).toBe(1));
    expect(first.result.current.loading).toBe(true);
    await waitFor(() => expect(other.result.current.complete).toBe(true));
    first.unmount(); cancelLibraryCatalog('/partial-1142'); release();
    await waitFor(() => expect(requests.get('/partial-1142')).toBe(2));
    const again = renderHook(() => useLibraryCatalog('/other-1142', true));
    expect(again.result.current.items[0].path).toBe('/other-1142/0');
    expect(scan.mock.calls.filter(([root]) => root === '/other-1142')).toHaveLength(1);
  });
  it('keeps a random prefix through capacity changes and ignores discoveries until redraw', () => {
    const items = Array.from({length:100},(_,id) => ({id:String(id)}));
    const view = renderHook(({count}) => useRandomBrowse('prefix-1142',count), {initialProps:{count:8}});
    act(() => view.result.current.toggle());
    const first = view.result.current.select(items,item=>item.id);
    view.rerender({count:3});expect(view.result.current.select(items,item=>item.id)).toEqual(first.slice(0,3));
    view.rerender({count:8});expect(view.result.current.select([...items,{id:'new'}],item=>item.id)).toEqual(first);
    const removed = items.filter(item=>item.id!==first[0].id);
    const replaced = view.result.current.select(removed,item=>item.id);
    expect(replaced).toHaveLength(8);expect(new Set(replaced.map(item=>item.id)).size).toBe(8);expect(replaced).not.toContain(first[0]);
    act(() => view.result.current.redraw()); expect(view.result.current.select([{id:'new'}],item=>item.id)).toEqual([{id:'new'}]);
  });
  it('cancels a large query before stale results can replace the latest generation', async () => {
    const items = Array.from({length:100000},(_,index)=>({index}));
    const old = (item: typeof items[number]) => item.index < 50000;
    const current = (item: typeof items[number]) => item.index >= 99990;
    const compare = (a: typeof items[number],b: typeof items[number])=>a.index-b.index;
    const view = renderHook(({predicate,signature}) => useLibraryQuery(items,predicate,compare,signature),{initialProps:{predicate:old,signature:'old'}});
    view.rerender({predicate:current,signature:'latest'});
    await waitFor(()=>expect(view.result.current).toHaveLength(10));
    expect(view.result.current.map(item=>item.index)).toEqual(Array.from({length:10},(_,n)=>99990+n));
  });
  it('pins each directory batch and shows books before later folders are discovered', async () => {
    const root = '/stable-1144', folder = (name: string) => ({ ...file(root,name), type: 'folder' as const });
    const z = folder('Z folder'), a = folder('A folder'), m = folder('M folder');
    const bookZ = file(root,'Z book'), bookA = file(root,'A book'), book0 = file(root,'0 book');
    const predicate = (item: typeof z | typeof bookZ) => !item.name.startsWith('Other'), compare = (a: typeof z | typeof bookZ,b: typeof z | typeof bookZ) => a.name.localeCompare(b.name);
    const options = { key: (item: typeof z | typeof bookZ) => item.path, first: (item: typeof z | typeof bookZ) => item.type === 'folder' };
    const ready = options;
    const view = renderHook(({items,phase,signature}) => useLibraryQuery(items,predicate,compare,signature,phase), {
      initialProps: {items:[z,bookZ],phase:options,signature:'session'} });
    await waitFor(() => expect(view.result.current.map(item=>item.name)).toEqual(['Z folder','Z book']));
    view.rerender({items:[a,bookA,z,bookZ],phase:options,signature:'session'});
    expect(view.result.current.map(item=>item.name)).toEqual(['Z folder','Z book']);
    await waitFor(() => expect(view.result.current.map(item=>item.name)).toEqual(['Z folder','Z book','A folder','A book']));
    const expanded = [m,...Array.from({length:700},(_,n)=>file(root,'Other '+n)),a,bookA,z,bookZ];
    view.rerender({items:expanded,phase:options,signature:'session'});
    expect(view.result.current.map(item=>item.name)).toEqual(['Z folder','Z book','A folder','A book']);
    await waitFor(() => expect(view.result.current.map(item=>item.name)).toEqual(['Z folder','Z book','A folder','A book','M folder']));
    view.rerender({items:[m,a,bookA,z,bookZ],phase:ready,signature:'session'});
    await waitFor(() => expect(view.result.current.map(item=>item.name)).toEqual(['Z folder','Z book','A folder','A book','M folder']));
    view.rerender({items:[book0,m,a,bookA,z,bookZ],phase:ready,signature:'session'});
    await waitFor(() => expect(view.result.current.map(item=>item.name)).toEqual(['Z folder','Z book','A folder','A book','M folder','0 book']));
    view.rerender({items:[book0,m,a,bookA,z,bookZ],phase:ready,signature:'new query'});
    await waitFor(() => expect(view.result.current.map(item=>item.name)).toEqual(['A folder','M folder','Z folder','0 book','A book','Z book']));
  });
  it('restores the pinned search prefix after a large ordinary random query', async () => {
    const root = '/restore-order-1144', z = {...file(root,'Z folder'),type:'folder' as const}, a = {...file(root,'A folder'),type:'folder' as const};
    const background = Array.from({length:700},(_,n)=>file(root,'Other '+n));
    const predicate = (item: typeof z | typeof background[number]) => item.type === 'folder';
    const compare = (a: typeof z | typeof background[number],b: typeof z | typeof background[number]) => a.name.localeCompare(b.name);
    const phase = {key:(item: typeof z | typeof background[number])=>item.path,first:predicate,complete:true};
    const view = renderHook(({items,signature,options})=>useLibraryQuery(items,predicate,compare,signature,options),{
      initialProps:{items:[z,...background],signature:'search',options:phase as typeof phase | undefined}});
    await waitFor(()=>expect(view.result.current.map(item=>item.name)).toEqual(['Z folder']));
    view.rerender({items:[a,z,...background],signature:'search',options:phase});
    await waitFor(()=>expect(view.result.current.map(item=>item.name)).toEqual(['Z folder','A folder']));
    view.rerender({items:[a,z,...background],signature:'random',options:undefined});
    await waitFor(()=>expect(view.result.current.map(item=>item.name)).toEqual(['A folder','Z folder']));
    view.rerender({items:[a,z,...background],signature:'search',options:phase});
    expect(view.result.current.map(item=>item.name)).toEqual(['Z folder','A folder']);
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});
    expect(view.result.current.map(item=>item.name)).toEqual(['Z folder','A folder']);
  });
  it('keeps a search idle past two minutes and revalidates only on a later entry', async () => {
    installMock({count:1}); vi.useFakeTimers();
    try {
      const scan = vi.spyOn(window.omicomic,'scanLibrary').mockImplementation(async root => ({ok:true,data:{items:[file(root,'Book')],directories:1,skipped:0,scannedAt:Date.now(),complete:true}}));
      const view = renderHook(({enabled}) => useLibraryCatalog('/idle-1144',enabled),{initialProps:{enabled:true}});
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      expect(view.result.current.complete).toBe(true); expect(scan).toHaveBeenCalledTimes(1);
      await act(async () => { await vi.advanceTimersByTimeAsync(360_000); });
      expect(scan).toHaveBeenCalledTimes(1);
      view.rerender({enabled:false}); view.rerender({enabled:true});
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      expect(scan).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
});
