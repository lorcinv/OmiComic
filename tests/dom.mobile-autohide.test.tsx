import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useMobileReaderAutoHide from '../src/hooks/useMobileReaderAutoHide';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
describe('mobile reading toolbar idle policy', () => {
  it('hides after 3 seconds even while page frames keep rendering', () => {
    const hide=vi.fn(), hook=renderHook(({frame})=>{void frame;useMobileReaderAutoHide(true,true,true,false,hide);},{initialProps:{frame:0}});
    advance(1800);hook.rerender({frame:1});advance(1199);expect(hide).not.toHaveBeenCalled();advance(1);expect(hide).toHaveBeenCalledOnce();
  });
  it('waits for held gestures and resets on interaction', () => {
    const hide=vi.fn(), el=document.createElement('div');el.className='is-mobile-reader';document.body.append(el);
    const hook=renderHook(()=>useMobileReaderAutoHide(true,true,true,false,hide));
    advance(2000);fireEvent.pointerDown(el,{pointerId:1});advance(5000);expect(hide).not.toHaveBeenCalled();
    fireEvent.pointerUp(el,{pointerId:1});advance(2500);fireEvent.keyDown(document,{key:'ArrowRight'});advance(2999);expect(hide).not.toHaveBeenCalled();advance(1);expect(hide).toHaveBeenCalledOnce();hook.unmount();el.remove();
  });
  it('pauses while panels are open and respects the disabled preference', () => {
    const hide=vi.fn(), hook=renderHook(({enabled,paused})=>useMobileReaderAutoHide(true,true,enabled,paused,hide),{initialProps:{enabled:true,paused:false}});
    advance(2900);hook.rerender({enabled:true,paused:true});advance(6000);expect(hide).not.toHaveBeenCalled();
    hook.rerender({enabled:true,paused:false});advance(2999);expect(hide).not.toHaveBeenCalled();hook.rerender({enabled:false,paused:false});advance(6000);expect(hide).not.toHaveBeenCalled();
  });
  it('does not arm a delayed focus task after unmount or while backgrounded', async () => {
    const hide=vi.fn(), hook=renderHook(()=>useMobileReaderAutoHide(true,true,true,false,hide));
    fireEvent(window,new Event('omi-pause'));fireEvent.keyDown(document,{key:'ArrowRight'});advance(5000);expect(hide).not.toHaveBeenCalled();
    fireEvent(window,new Event('omi-resume'));advance(2999);expect(hide).not.toHaveBeenCalled();advance(1);expect(hide).toHaveBeenCalledOnce();
    fireEvent.focusOut(document.body);hook.unmount();await act(()=>Promise.resolve());advance(5000);expect(hide).toHaveBeenCalledOnce();expect(vi.getTimerCount()).toBe(0);
  });
});
