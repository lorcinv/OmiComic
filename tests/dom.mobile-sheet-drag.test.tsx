import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MobileSheet from '../src/components/MobileSheet';

let time = 0;
class SheetPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly isPrimary: boolean;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init); this.pointerId = init.pointerId ?? 1; this.isPrimary = init.isPrimary ?? true;
  }
}
beforeEach(() => {
  time = 0;
  vi.stubGlobal('PointerEvent', SheetPointerEvent);
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', { configurable: true, value: () => true });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
});
function pointer(target: Element, type: 'pointerDown'|'pointerMove'|'pointerUp'|'pointerCancel'|'lostPointerCapture', y: number, at: number) {
  time = at; fireEvent[type](target, { pointerId: 1, button: 0, clientY: y, bubbles: true });
}
function setup(beforeClose?: () => boolean) {
  const close = vi.fn(); render(<MobileSheet title="菜单" onClose={close} beforeClose={beforeClose}><button>操作</button></MobileSheet>);
  return { close, grip: document.querySelector('.mobile-sheet-grab-area')!, panel: screen.getByRole('dialog', { name: '菜单' }) };
}
it('follows a downward drag and closes only when released beyond the threshold', () => {
  const { close, grip, panel } = setup();
  pointer(grip, 'pointerDown', 100, 0); pointer(grip, 'pointerMove', 260, 500);
  expect(panel.style.transform).toBe('translate3d(0,40%,0)'); expect(close).not.toHaveBeenCalled();
  pointer(grip, 'pointerUp', 260, 510); expect(close).toHaveBeenCalledOnce();
});
it('snaps a short slow drag back without closing', () => {
  const { close, grip, panel } = setup();
  pointer(grip, 'pointerDown', 100, 0); pointer(grip, 'pointerMove', 130, 500); pointer(grip, 'pointerUp', 130, 510);
  expect(close).not.toHaveBeenCalled(); expect(panel.style.transform).toBe('translate3d(0,0%,0)');
});
it('dismisses on a short fast downward flick and reopens on an upward reversal', () => {
  const { close, grip, panel } = setup();
  pointer(grip, 'pointerDown', 100, 0); pointer(grip, 'pointerMove', 300, 500); pointer(grip, 'pointerMove', 230, 520); pointer(grip, 'pointerUp', 230, 530);
  expect(close).not.toHaveBeenCalled(); expect(panel.style.transform).toBe('translate3d(0,0%,0)');
  pointer(grip, 'pointerDown', 100, 600); pointer(grip, 'pointerMove', 130, 620); pointer(grip, 'pointerUp', 130, 625);
  expect(close).toHaveBeenCalledOnce();
});
it('cancels a long drag and respects an active close guard', () => {
  const guard = vi.fn(() => false), { close, grip, panel } = setup(guard);
  pointer(grip, 'pointerDown', 100, 0); pointer(grip, 'pointerMove', 320, 500); pointer(grip, 'pointerCancel', 320, 510);
  expect(close).not.toHaveBeenCalled(); expect(guard).not.toHaveBeenCalled(); expect(panel.style.transform).toBe('translate3d(0,0%,0)');
  pointer(grip, 'pointerDown', 100, 600); pointer(grip, 'pointerMove', 320, 1100); pointer(grip, 'pointerUp', 320, 1110);
  expect(guard).toHaveBeenCalledOnce(); expect(close).not.toHaveBeenCalled(); expect(panel.style.transform).toBe('translate3d(0,0%,0)');
});
it('ignores bubbled child capture loss and never starts a bottom drag on a side drawer', () => {
  const { close, grip } = setup();
  pointer(grip, 'pointerDown', 100, 0); pointer(grip.firstElementChild!, 'lostPointerCapture', 100, 1);
  pointer(grip, 'pointerMove', 260, 500); pointer(grip, 'pointerUp', 260, 510); expect(close).toHaveBeenCalledOnce();
  render(<MobileSheet side title="侧栏" onClose={vi.fn()}><button>操作</button></MobileSheet>);
  expect(screen.getByRole('dialog', { name: '侧栏' }).querySelector('.mobile-sheet-grab-area')).toBeNull();
});
