import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { 阅读页面项 } from '../src/types';
import { clearMobilePagePreviews, requestMobilePagePreview } from '../src/reader/mobilePagePreviews';
import MobileReaderPreviews from '../src/components/MobileReaderPreviews';
import DetailPagePreview from '../src/components/DetailPagePreview';

class PendingImage {
  static all: PendingImage[] = [];
  src = ''; decoding = ''; fetchPriority = ''; naturalWidth = 120; naturalHeight = 180;
  onload: (() => void) | null = null; onerror: (() => void) | null = null;
  decode = vi.fn(async () => {});
  constructor() { PendingImage.all.push(this); }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  finish() { this.onload?.(); }
}
const page = (index: number, modifiedAt = 1): 阅读页面项 => ({ index, sourcePath: '/book.cbz', archiveInnerPath: `${index}.png`, name: `${index}.png`, type: 'archive-image', modifiedAt });
const flush = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const BrowserImage = globalThis.Image;
let reads: string[];

beforeEach(() => {
  clearMobilePagePreviews(); PendingImage.all = []; reads = [];
  document.documentElement.dataset.platform = 'android';
  Object.defineProperty(globalThis, 'Image', { configurable: true, writable: true, value: PendingImage });
  window.omicomic = { getPageImage: vi.fn(async input => {
    reads.push(input.archiveInnerPath!);
    return { ok: true, data: { url: `https://omi.local/media/${input.archiveInnerPath}` } };
  }) } as unknown as Window['omicomic'];
});
afterEach(() => { clearMobilePagePreviews(); delete document.documentElement.dataset.platform; globalThis.Image = BrowserImage; });

describe('Android page preview scheduling', () => {
  it('does not wait for pages outside the directional native preload window',async()=>{
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(390);
    const pages=Array.from({length:30},(_,i)=>page(i));
    const nativeImages=Object.fromEntries([9,10,11,12,13].map(index=>[index,{url:`native:${index}`,native:true}]));
    render(<MobileReaderPreviews pages={pages} current={10} width={88} onPage={()=>{}} nativeImage="native:10" nativeImages={nativeImages} nativePages={[10,11,9,12,13]} nativeRadius={2}/>);
    await flush();
    expect(reads).toContain('8.png');
    expect(reads).not.toContain('9.png');
  });
  it('allows thumbnail fallback when speculative clear decoding fails',async()=>{
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(390);
    const pages=Array.from({length:30},(_,i)=>page(i));
    const nativeImages={10:{url:'native:10',native:true},11:{url:'',prefetchFailed:true}};
    render(<MobileReaderPreviews pages={pages} current={10} width={88} onPage={()=>{}} nativeImage="native:10" nativeImages={nativeImages} nativePages={[10,11]} nativeRadius={2}/>);
    await flush();
    expect(reads).toContain('11.png');
    PendingImage.all.forEach(image=>image.finish());await flush();
    expect(reads).toContain('8.png');
  });
  it('keeps following native momentum after a delayed scroll event',async()=>{
    vi.useFakeTimers();
    try{
      const pages=Array.from({length:200},(_,index)=>page(index)),onPage=vi.fn();
      const props={pages,width:88,onPage,nativeImage:null};
      const view=render(<MobileReaderPreviews {...props} current={20}/>);
      await act(async()=>{vi.advanceTimersByTime(40);});
      const rail=view.container.querySelector('.mobile-reader-filmstrip') as HTMLElement;
      fireEvent.pointerDown(rail);rail.scrollLeft=40*96;fireEvent.scroll(rail);
      view.rerender(<MobileReaderPreviews {...props} current={40}/>);
      await act(async()=>{vi.advanceTimersByTime(240);});
      // A slow frame/decode does not mean Android has finished flinging.
      rail.scrollLeft=70*96;fireEvent.scroll(rail);
      expect(onPage).toHaveBeenLastCalledWith(70);
      expect(view.container.querySelector('[aria-label="第 71 页：70.png"]')).not.toBeNull();
    }finally{vi.useRealTimers();}
  });
  it('does not suppress user scroll when a programmatic scroll frame is interrupted',()=>{
    let next=0;const frames=new Map<number,FrameRequestCallback>();
    const raf=vi.spyOn(globalThis,'requestAnimationFrame').mockImplementation((fn:FrameRequestCallback)=>{frames.set(++next,fn);return next;});
    const cancel=vi.spyOn(globalThis,'cancelAnimationFrame').mockImplementation((id:number)=>{frames.delete(id);});
    try{
      const pages=Array.from({length:200},(_,index)=>page(index)),onPage=vi.fn();
      const props={pages,width:88,onPage,nativeImage:null};
      const view=render(<MobileReaderPreviews {...props} current={20}/>);
      const rail=view.container.querySelector('.mobile-reader-filmstrip') as HTMLElement;
      fireEvent.pointerDown(rail);
      view.rerender(<MobileReaderPreviews {...props} current={21}/>);
      rail.scrollLeft=40*96;fireEvent.scroll(rail);
      expect(onPage).toHaveBeenLastCalledWith(40);
    }finally{raf.mockRestore();cancel.mockRestore();}
  });
  it('shares both neighbours on each side without a second thumbnail request',async()=>{
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(390);
    const pages=Array.from({length:40},(_,index)=>page(index));
    const nativeImages=Object.fromEntries([18,19,20,21,22].map(index=>[index,{url:`native-${index}`,native:true}]));
    const view=render(<MobileReaderPreviews pages={pages} current={20} width={88} nativeImage="native-20" nativeImages={nativeImages} nativeRadius={2} onPage={()=>{}}/>);
    await flush();
    expect([...view.container.querySelectorAll('[data-native-preview]')].map(node=>node.getAttribute('data-native-preview'))).toEqual(['native-18','native-19','native-20','native-21','native-22']);
    expect(reads.some(name=>/^(18|19|20|21|22)\.png$/.test(name))).toBe(false);
  });
  it('prioritizes a newly adjacent page over distant reads even when the selected image is native',async()=>{
    requestMobilePagePreview(page(1),4);requestMobilePagePreview(page(2),3);await flush();
    const near=requestMobilePagePreview(page(18),1);await flush();
    expect(reads).toEqual(['2.png','1.png','18.png']);
    expect(PendingImage.all[1].src).toBe('');
    PendingImage.all[2].finish();await flush();await expect(near.promise).resolves.toContain('/18.png');
  });
  it('defers distant archive reads until the native neighbours settle, including a failed neighbour',async()=>{
    vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(390);
    const pages=Array.from({length:40},(_,index)=>page(index));
    const props={pages,current:20,width:88,nativeImage:'native-20',nativeRadius:2,onPage:()=>{}};
    const view=render(<MobileReaderPreviews {...props} nativeImages={{20:{url:'native-20',native:true}}}/>);
    await flush();expect(reads).toEqual([]);
    const nativeImages=Object.fromEntries([18,19,20,21].map(index=>[index,{url:`native-${index}`,native:true}]));
    view.rerender(<MobileReaderPreviews {...props} nativeImages={{...nativeImages,22:{url:'',error:'unreadable'}}}/>);
    await flush();expect(reads).toContain('22.png');expect(reads.some(name=>/^(16|17|23|24)\.png$/.test(name))).toBe(true);
  });
  it('falls back to bounded thumbnails if a neighbour was discarded under a small memory budget',async()=>{
    const pages=Array.from({length:40},(_,index)=>page(index));
    const props={pages,current:20,width:88,nativeImage:'native-20',nativeRadius:2,onPage:()=>{}};
    const nativeImages=Object.fromEntries([18,19,20,21,22].map(index=>[index,{url:`native-${index}`,native:true}]));
    const view=render(<MobileReaderPreviews {...props} nativeImages={nativeImages}/>);await flush();
    view.rerender(<MobileReaderPreviews {...props} nativeImages={{20:nativeImages[20]}}/>);await flush();
    expect(reads.slice(-2)).toEqual(['19.png','21.png']);
  });
  it('uses the displayed native image without another selected-page read, including while pending', async () => {
    const view=render(<DetailPagePreview page={page(7)} selected eager nativeImage={null} onSelect={()=>{}} onOpen={()=>{}}/>);
    await flush();expect(reads).toEqual([]);expect(PendingImage.all).toHaveLength(0);
    view.rerender(<DetailPagePreview page={page(7)} selected eager nativeImage="https://omi.local/media/body-page-7" onSelect={()=>{}} onOpen={()=>{}}/>);
    expect(document.querySelector('[data-native-preview]')?.getAttribute('data-native-preview')).toBe('https://omi.local/media/body-page-7');
    expect(document.querySelector('img')).toBeNull();await flush();expect(reads).toEqual([]);
    view.rerender(<DetailPagePreview page={page(7)} selected={false} eager onSelect={()=>{}} onOpen={()=>{}}/>);
    await flush();expect(reads).toEqual(['7.png']);
  });
  it('starts the selected page first and holds slots until image decode, not URL registration', async () => {
    requestMobilePagePreview(page(8), 2);
    requestMobilePagePreview(page(9), 1);
    requestMobilePagePreview(page(10), 0);
    await flush();
    expect(reads).toEqual(['10.png', '9.png']);
    let decoded!: () => void;
    PendingImage.all[0].decode.mockImplementation(() => new Promise<void>(resolve => { decoded = resolve; }));
    PendingImage.all[0].finish(); await flush();
    expect(reads).toEqual(['10.png', '9.png']);
    decoded(); await flush();
    expect(reads).toEqual(['10.png', '9.png', '8.png']);
  });

  it('preempts an off-centre image for a new target without waiting for the slow old decode', async () => {
    const oldTarget = requestMobilePagePreview(page(10), 0);
    requestMobilePagePreview(page(11), 1);
    await flush();
    oldTarget.setPriority(20);
    const selected = requestMobilePagePreview(page(30), 0);
    await flush();
    expect(reads).toEqual(['10.png', '11.png', '30.png']);
    expect(PendingImage.all[0].src).toBe('');
    PendingImage.all[2].finish(); await flush();
    await expect(selected.promise).resolves.toContain('/30.png');
  });

  it('cancels both queued and in-flight obsolete pages after a long scrub', async () => {
    const stale = [0, 1, 2, 3].map(index => requestMobilePagePreview(page(index), index));
    await flush(); expect(reads).toEqual(['0.png', '1.png']);
    stale.forEach(request => request.cancel());
    const current = requestMobilePagePreview(page(240), 0);
    await flush();
    expect(reads).toEqual(['0.png', '1.png', '240.png']);
    expect(PendingImage.all.slice(0, 2).every(image => image.src === '')).toBe(true);
    PendingImage.all[2].finish(); await flush();
    await expect(current.promise).resolves.toContain('/240.png');
  });

  it('shares active work, reuses a decoded preview on reopen and invalidates changed file metadata', async () => {
    const first = requestMobilePagePreview(page(4), 0), other = requestMobilePagePreview(page(4), 0);
    first.cancel(); await flush(); expect(reads).toEqual(['4.png']);
    PendingImage.all[0].finish(); await flush(); await other.promise;
    await requestMobilePagePreview(page(4), 0).promise;
    expect(reads).toEqual(['4.png']);
    requestMobilePagePreview(page(4, 2), 0); await flush(); expect(reads).toHaveLength(2);
    clearMobilePagePreviews('/book.cbz');
    requestMobilePagePreview(page(4), 0); await flush(); expect(reads).toHaveLength(3);
  });

  it('bounds retained decoded images instead of accumulating pages from old comics', async () => {
    for (let index = 0; index < 30; index++) {
      const request = requestMobilePagePreview(page(index), 0); await flush();
      const image = PendingImage.all.at(-1)!;
      image.naturalWidth = image.naturalHeight = 480;
      image.finish(); await flush(); await request.promise;
    }
    expect(PendingImage.all.filter(image => image.src)).toHaveLength(9);
    expect(PendingImage.all[0].src).toBe('');
  });

  it('mounts the current filmstrip window immediately and drops its previous window on a distant seek', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
    const pages = Array.from({ length: 500 }, (_, index) => page(index));
    const props = { pages, width: 96, onPage: vi.fn() };
    const view = render(<MobileReaderPreviews {...props} current={120} />);
    await flush();
    expect(reads[0]).toBe('120.png');
    expect(view.container.querySelectorAll('.mobile-filmstrip-page')).toHaveLength(7);
    view.rerender(<MobileReaderPreviews {...props} current={350} />);
    await flush();
    expect(reads[2]).toBe('350.png');
    expect(view.container.querySelector('[aria-pressed="true"]')?.getAttribute('aria-label')).toContain('351');
    PendingImage.all[2].finish(); await flush();
    await waitFor(() => expect(view.container.querySelector('[aria-pressed="true"] img')?.getAttribute('src')).toContain('/350.png'));
  });

  it('cancels offscreen detail reads, retries on return and preserves completed previews', async () => {
    const original = globalThis.IntersectionObserver;
    let change!: (visible: boolean) => void;
    class VisibilityObserver {
      constructor(callback: IntersectionObserverCallback) {
        change = visible => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      observe() {} disconnect() {}
    }
    Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, writable: true, value: VisibilityObserver });
    try {
      const view = render(<DetailPagePreview page={page(7)} selected={false} onSelect={() => {}} onOpen={() => {}} />);
      await act(async () => change(true)); await flush(); expect(reads).toEqual(['7.png']);
      await act(async () => change(false)); await flush(); expect(PendingImage.all[0].src).toBe('');
      await act(async () => change(true)); await flush(); expect(reads).toHaveLength(2);
      PendingImage.all[1].finish(); await flush();
      expect(view.container.querySelector('img')).not.toBeNull();
      await act(async () => { change(false); change(true); }); await flush();
      expect(reads).toHaveLength(2);
      expect(view.container.querySelector('img')).not.toBeNull();
    } finally { globalThis.IntersectionObserver = original; }
  });

  it('leaves desktop preview loading on the existing code path', async () => {
    delete document.documentElement.dataset.platform;
    const view = render(<DetailPagePreview page={page(2)} selected onSelect={() => {}} onOpen={() => {}} />);
    await flush();
    view.rerender(<DetailPagePreview page={page(2, 3)} selected onSelect={() => {}} onOpen={() => {}} />);
    await flush();
    expect(reads).toEqual(['2.png']);
    expect(PendingImage.all).toHaveLength(0);
  });
});
