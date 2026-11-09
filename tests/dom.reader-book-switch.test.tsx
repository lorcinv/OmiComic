import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ReaderBookSwitch from '../src/components/ReaderBookSwitch';

function setup() {
  const activate = vi.fn();
  const { getByRole } = render(<ReaderBookSwitch direction="right" opacity={.4} title="Next" label="Next" onActivate={activate} />);
  const button = getByRole('button');
  const pointer = (type: string, x = 10, y = 10) => fireEvent(button, Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y }));
  return { activate, button, pointer };
}

describe('book switch touch activation', () => {
  it('activates without a WebView click and discards a later compatibility click', () => {
    const { activate, button, pointer } = setup();
    pointer('pointerdown'); pointer('pointerup');
    expect(activate).toHaveBeenCalledTimes(1);
    fireEvent.click(button, { detail: 1 });
    expect(activate).toHaveBeenCalledTimes(1);
  });
  it('does not activate a drag, even if it returns to the press position', () => {
    const { activate, button, pointer } = setup();
    pointer('pointerdown'); pointer('pointermove', 30); pointer('pointermove', 10); pointer('pointerup'); fireEvent.click(button, { detail: 1 });
    expect(activate).not.toHaveBeenCalled();
  });
  it('does not activate a cancelled touch', () => {
    const { activate, button, pointer } = setup();
    pointer('pointerdown'); pointer('pointercancel'); pointer('pointerup'); fireEvent.click(button, { detail: 1 });
    expect(activate).not.toHaveBeenCalled();
  });
  it('keeps mouse and keyboard clicks working', () => {
    const { activate, button } = setup();
    fireEvent.click(button, { detail: 1 }); fireEvent.click(button, { detail: 0 });
    expect(activate).toHaveBeenCalledTimes(2);
  });
});
