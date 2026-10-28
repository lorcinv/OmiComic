import { describe, expect, it } from 'vitest';
import { createProgressiveSearch, updateProgressiveSearch, progressiveSearchMetrics } from '../src/library/progressiveSearch';

type Item = { id: string; name: string; folder?: boolean; note?: string };
const order = { key: (item: Item) => item.id, first: (item: Item) => !!item.folder };
const compare = (a: Item,b: Item) => a.name.localeCompare(b.name);
const all = () => true;

describe('directory-by-directory progressive search', () => {
  it('shows books immediately and pins them when later folders arrive', async () => {
    const state = createProgressiveSearch<Item>('same query');
    const folder = {id:'folder',name:'Z folder',folder:true}, book = {id:'book',name:'Z book'};
    await updateProgressiveSearch(state,[book,folder],all,compare,order,()=>true,()=>{});
    expect(state.items.map(item=>item.id)).toEqual(['folder','book']);
    const lateFolder = {id:'late',name:'A folder',folder:true}, lateBook = {id:'late-book',name:'A book'};
    await updateProgressiveSearch(state,[lateBook,lateFolder,folder,book],all,compare,order,()=>true,()=>{});
    expect(state.items.map(item=>item.id)).toEqual(['folder','book','late','late-book']);
  });
  it('only re-matches new or edited entries and sorts the new tail', async () => {
    const source = Array.from({length:1000},(_,id)=>({id:String(id),name:'Book '+String(id).padStart(4,'0')}));
    const state = createProgressiveSearch<Item>('cached');
    let comparisons=0; const counted = (a: Item,b: Item) => { comparisons++; return compare(a,b); };
    await updateProgressiveSearch(state,source,all,counted,order,()=>true,()=>{});
    const before = progressiveSearchMetrics.evaluated; comparisons=0;
    const edited = {...source[20],name:'Renamed'}, fresh = {id:'fresh',name:'A new book'};
    const next = [...source]; next[20]=edited;
    await updateProgressiveSearch(state,[fresh,...next],all,counted,order,()=>true,()=>{});
    expect(progressiveSearchMetrics.evaluated-before).toBe(2);
    expect(comparisons).toBe(0); // One new hit needs no sort; existing hits are untouched.
    expect(state.items[20]).toBe(edited); expect(state.items.at(-1)).toBe(fresh);
    expect(state.items.slice(0,20)).toEqual(source.slice(0,20));
  });
  it('rechecks metadata-dependent predicates and removes only real misses or deletions', async () => {
    const state = createProgressiveSearch<Item>('metadata'), a={id:'a',name:'A'}, b={id:'b',name:'B'};
    await updateProgressiveSearch(state,[a,b],all,compare,order,()=>true,()=>{});
    const notes = new Set(['b']);
    await updateProgressiveSearch(state,[a,b],item=>notes.has(item.id),compare,order,()=>true,()=>{});
    expect(state.items).toEqual([b]);
    await updateProgressiveSearch(state,[],all,compare,order,()=>true,()=>{});
    expect(state.items).toEqual([]); expect(state.evaluated.size).toBe(0);
  });
  it('publishes before a large snapshot ends and safely resumes a cancelled partial pass', async () => {
    const source = Array.from({length:5000},(_,id)=>({id:String(id),name:'Book '+id}));
    const state=createProgressiveSearch<Item>('cancel'); let active=true,calls=0,firstEvaluations=0;
    const matches=()=>{calls++;return true;};
    await updateProgressiveSearch(state,source,matches,compare,order,()=>active,()=>{firstEvaluations=calls;active=false;});
    expect(firstEvaluations).toBeGreaterThan(0); expect(firstEvaluations).toBeLessThan(source.length);
    expect(state.items.length).toBeLessThan(source.length);
    const prefix=state.items.slice(); active=true;
    await updateProgressiveSearch(state,source,matches,compare,order,()=>active,()=>{});
    expect(state.items).toHaveLength(5000); expect(new Set(state.items.map(item=>item.id)).size).toBe(5000);
    expect(state.items.slice(0,prefix.length)).toEqual(prefix);
  });
});
