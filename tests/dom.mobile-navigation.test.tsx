import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ available: false, call: vi.fn(), notify: vi.fn() }));
vi.mock('../src/android/bridge', () => ({ hasAndroidRenderer: () => native.available, androidCall: native.call, androidNotify: native.notify }));
import { cancelMobileNavigation, mobileNavigate, mobileNavigationEpoch, observeMobileNavigationLifecycle, type MobileNavigationOrigin } from '../src/hooks/mobileNavigation';

type Capture = { before: string[]; after: string[] };
const originalTransition = document.startViewTransition;
let captures: Capture[];
let stopLifecycle: (() => void) | undefined;
const named = () => [...document.querySelectorAll<HTMLElement>('[id]')]
  .filter(element => element.style.viewTransitionName === 'mobile-detail-cover').map(element => element.id);
function installWebTransitions() {
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: (update: () => Promise<void>) => {
    const capture = { before: named(), after: [] as string[] }; captures.push(capture);
    const done = Promise.resolve().then(update).then(() => { capture.after = named(); });
    return { updateCallbackDone: done, ready: done, finished: done, skipTransition() {} } as ViewTransition;
  } });
}
function cover(id: string, key: string, top: number, left = 20) {
  const card = document.createElement('button'); card.className = 'mobile-resource-card'; card.dataset.selectionKey = key;
  card.innerHTML = `<span class="resource-preview"><img id="${id}" alt=""></span>`;
  vi.spyOn(card.firstElementChild!, 'getBoundingClientRect').mockReturnValue(new DOMRect(left, top, 100, 150));
  return card;
}
function list(...cards: HTMLElement[]) {
  document.body.innerHTML = '<div class="page-panel is-visible"></div>';
  document.body.firstElementChild!.append(...cards);
}
function details() {
  document.body.innerHTML = '<div class="page-panel is-visible"><div class="resource-detail-cover"><img id="detail-cover" alt=""></div></div>';
}
const origin: MobileNavigationOrigin = { left: 20, top: 100, width: 100, height: 150, selectionKey: 'book-a' };

beforeEach(() => {
  native.available = false; native.call.mockReset(); native.notify.mockReset();
  cancelMobileNavigation(); captures = [];
  delete document.documentElement.dataset.nativeReader;
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
  installWebTransitions();
});
afterEach(() => {
  stopLifecycle?.(); stopLifecycle = undefined;
  cancelMobileNavigation(); document.body.innerHTML = '';
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: originalTransition });
});

describe('mobile transition interruption and cover identity', () => {
  it.each(['home-expand','home-collapse'] as const)('prepares %s before the native reveal even when web transitions are available',async direction=>{
    native.available=true;native.call.mockResolvedValue(undefined);
    let release!:()=>void;
    const ready=new Promise<void>(resolve=>{release=resolve;}),update=vi.fn();
    const navigation=mobileNavigate(update,direction,()=>ready);
    await Promise.resolve();
    expect(update).toHaveBeenCalledOnce();
    expect(native.call.mock.calls.map(call=>call[0])).toEqual(['beginScene']);
    expect(captures).toHaveLength(0);
    release();await navigation;
    expect(native.call.mock.calls.map(call=>call[0])).toEqual(['beginScene','commitScene']);
    expect(native.call).toHaveBeenLastCalledWith('commitScene',expect.objectContaining({direction}));
    expect(document.documentElement.dataset.mobileNavigation).toBeUndefined();
  });

  it('keeps reduced-motion home navigation immediate without a native screenshot',async()=>{
    native.available=true;native.call.mockResolvedValue(undefined);
    vi.mocked(window.matchMedia).mockReturnValue({matches:true} as MediaQueryList);
    const update=vi.fn();await mobileNavigate(update,'home-expand');
    expect(update).toHaveBeenCalledOnce();expect(captures).toHaveLength(0);expect(native.call).not.toHaveBeenCalled();
  });

  it.each([false, true])('settles data requested before backgrounding and animates new input afterwards (native=%s)', async available => {
    native.available = available; native.call.mockResolvedValue(undefined);
    stopLifecycle = observeMobileNavigationLifecycle();
    const epoch = mobileNavigationEpoch(), update = vi.fn(), prepared = vi.fn().mockResolvedValue(undefined);
    window.dispatchEvent(new Event('omi-app-pause'));
    window.dispatchEvent(new Event('omi-app-resume'));
    await mobileNavigate(update, 'forward', prepared, undefined, epoch);
    expect(update).toHaveBeenCalledOnce(); expect(prepared).toHaveBeenCalledOnce();
    expect(captures).toHaveLength(0); expect(native.call).not.toHaveBeenCalled();
    await mobileNavigate(update, 'forward');
    expect(update).toHaveBeenCalledTimes(2);
    if (available) expect(native.call).toHaveBeenLastCalledWith('commitScene', expect.objectContaining({ direction: 'forward' }));
    else expect(captures).toHaveLength(1);
  });

  it('does not animate queued web navigation that crossed a pause/resume while waiting for the previous update', async () => {
    stopLifecycle = observeMobileNavigationLifecycle();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const firstUpdate = vi.fn(), secondUpdate = vi.fn();
    const first = mobileNavigate(firstUpdate, 'home-expand', () => held);
    await Promise.resolve();
    const second = mobileNavigate(secondUpdate, 'home-collapse');
    window.dispatchEvent(new Event('omi-app-pause'));
    window.dispatchEvent(new Event('omi-app-resume'));
    release(); await Promise.all([first, second]);
    expect(firstUpdate).toHaveBeenCalledOnce(); expect(secondUpdate).toHaveBeenCalledOnce();
    expect(captures).toHaveLength(1);
    expect(document.documentElement.dataset.mobileNavigation).toBeUndefined();
    await mobileNavigate(() => {}, 'home-expand');
    expect(captures).toHaveLength(2);
  });

  it('does not confuse an EPUB autoplay pause with backgrounding the app', async () => {
    native.available = true; native.call.mockResolvedValue(undefined);
    stopLifecycle = observeMobileNavigationLifecycle();
    window.dispatchEvent(new Event('omi-pause'));
    const update = vi.fn(); await mobileNavigate(update, 'back');
    expect(update).toHaveBeenCalledOnce();
    expect(native.call).toHaveBeenLastCalledWith('commitScene', expect.objectContaining({ direction: 'back' }));
  });
  it('commits a pending navigation once but does not replay its native transition after background return', async () => {
    native.available = true;
    stopLifecycle = observeMobileNavigationLifecycle();
    let release!: () => void;
    native.call.mockImplementation(method => method === 'beginScene' ? new Promise<void>(resolve => { release = resolve; }) : Promise.resolve());
    const update = vi.fn();
    const navigation = mobileNavigate(update);
    window.dispatchEvent(new Event('omi-app-pause'));
    window.dispatchEvent(new Event('omi-app-resume'));
    release(); await navigation;
    expect(update).toHaveBeenCalledOnce();
    expect(native.call.mock.calls.map(call => call[0])).toEqual(['beginScene']);
    expect(native.notify).toHaveBeenCalledWith('cancelScene', {});
  });

  it('settles a prepared reader while backgrounded and leaves the next foreground navigation usable', async () => {
    native.available = true;
    native.call.mockResolvedValue(undefined);
    stopLifecycle = observeMobileNavigationLifecycle();
    let release!: () => void;
    const prepare = new Promise<void>(resolve => { release = resolve; });
    const old = mobileNavigate(() => {}, 'forward', () => prepare);
    await Promise.resolve();
    window.dispatchEvent(new Event('omi-app-pause'));
    release(); await old;
    const update = vi.fn();
    await mobileNavigate(update, 'back');
    expect(update).toHaveBeenCalledOnce();
    expect(native.call).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('omi-app-resume'));
    await mobileNavigate(update, 'back');
    expect(native.call).toHaveBeenLastCalledWith('commitScene', expect.objectContaining({ direction: 'back' }));
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('skips a web animation on backgrounding without cancelling its requested page change', async () => {
    stopLifecycle = observeMobileNavigationLifecycle();
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const skip = vi.fn();
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: (update: () => Promise<void>) => {
      const done = pending.then(update);
      return { updateCallbackDone: done, ready: done, finished: done, skipTransition: skip } as ViewTransition;
    } });
    const update = vi.fn();
    const navigation = mobileNavigate(update, 'tab-next');
    window.dispatchEvent(new Event('omi-app-pause'));
    expect(skip).toHaveBeenCalledOnce();
    release(); await navigation;
    expect(update).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.mobileNavigation).toBeUndefined();
  });
  it('expands from the home icon and collapses to its new position after rotation',async()=>{
    const home=(x:number,y:number)=>{document.body.innerHTML='<div class="omi-home"><div class="omi-page-brand"><span class="omi-brand-icon"></span></div></div>';vi.spyOn(document.querySelector('.omi-brand-icon')!,'getBoundingClientRect').mockReturnValue(new DOMRect(x,y,40,40));};
    home(16,22);let expansion='';
    await mobileNavigate(()=>{expansion=document.documentElement.style.getPropertyValue('--mobile-home-x');document.body.innerHTML='<main>Library</main>';},'home-expand');
    expect(expansion).toBe('36px');
    let captured='';
    Object.defineProperty(document,'startViewTransition',{configurable:true,value:(update:()=>Promise<void>)=>{const done=Promise.resolve().then(update).then(()=>{captured=document.documentElement.style.getPropertyValue('--mobile-home-x');});return {updateCallbackDone:done,ready:done,finished:done,skipTransition(){}} as ViewTransition;}});
    await mobileNavigate(()=>home(40,18),'home-collapse');expect(captured).toBe('60px');
    expect(document.documentElement.style.getPropertyValue('--mobile-home-x')).toBe('');
  });
  it('cancels a pending native capture before a web scene and rejects its late snapshot', async () => {
    native.available = true;
    let generation = 0, snapshot = false, release!: () => void;
    native.notify.mockImplementation(method => { if (method === 'cancelScene') { generation++; snapshot = false; } });
    native.call.mockImplementation(method => {
      if (method !== 'beginScene') return Promise.resolve();
      const expected = generation;
      return new Promise<void>(resolve => { release = () => { if (expected === generation) snapshot = true; resolve(); }; });
    });
    const oldUpdate = vi.fn(), newUpdate = vi.fn();
    const pending = mobileNavigate(oldUpdate, 'forward');
    await mobileNavigate(newUpdate, 'tab-next');
    expect(native.notify).toHaveBeenCalledWith('cancelScene', {});
    release(); await pending;
    expect(snapshot).toBe(false);
    expect(oldUpdate).not.toHaveBeenCalled();
    expect(newUpdate).toHaveBeenCalledOnce();
    expect(native.call.mock.calls.map(call => call[0])).toEqual(['beginScene']);
    expect(document.documentElement.dataset.mobileNavigation).toBeUndefined();
  });

  it('clears an already captured native scene when its preparation is overtaken by a folder transition', async () => {
    native.available = true;
    let snapshot = false, release!: () => void;
    const prepared = new Promise<void>(resolve => { release = resolve; });
    native.call.mockImplementation(async method => { if (method === 'beginScene') snapshot = true; });
    native.notify.mockImplementation(method => { if (method === 'cancelScene') snapshot = false; });
    const oldUpdate = vi.fn();
    const old = mobileNavigate(oldUpdate, 'forward', () => prepared);
    await Promise.resolve(); expect(oldUpdate).toHaveBeenCalledOnce(); expect(snapshot).toBe(true);
    await mobileNavigate(() => {}, 'folder'); expect(snapshot).toBe(false);
    release(); await old;
    expect(native.call.mock.calls.some(call => call[0] === 'commitScene')).toBe(false);
  });

  it('uses the clicked card identity going in and restores all temporary names afterwards', async () => {
    const selected = cover('book-a-image', 'book-a', 100), other = cover('book-b-image', 'book-b', 100, 150);
    list(selected, other);
    const image = selected.querySelector('img')!; image.style.viewTransitionName = 'original-name';
    await mobileNavigate(details, 'detail', undefined, origin);
    expect(captures[0]).toEqual({ before: ['book-a-image'], after: ['detail-cover'] });
    expect(image.style.viewTransitionName).toBe('original-name');
    expect(document.getElementById('detail-cover')!.style.viewTransitionName).toBe('');
    expect(document.documentElement.dataset.mobileNavigation).toBeUndefined();
  });

  it('returns to the same resource after reordering instead of the card occupying its old position', async () => {
    details();
    await mobileNavigate(() => list(cover('wrong-image', 'book-b', 100), cover('book-a-image', 'book-a', 300)), 'detail-back', undefined, origin);
    expect(captures[0]).toEqual({ before: ['detail-cover'], after: ['book-a-image'] });
  });

  it('does not share a cover when the original resource disappeared or is clipped out of view', async () => {
    details();
    await mobileNavigate(() => list(cover('replacement-image', 'book-b', 100)), 'detail-back', undefined, origin);
    expect(captures[0].after).toEqual([]);
    details();
    await mobileNavigate(() => {
      const scroll = document.createElement('div'); scroll.className = 'resource-list-scroll';
      vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 80, 390, 420));
      scroll.append(cover('offscreen-image', 'book-a', 650)); list(scroll);
    }, 'detail-back', undefined, origin);
    expect(captures[1].after).toEqual([]);
  });
});
