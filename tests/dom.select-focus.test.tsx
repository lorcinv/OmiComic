import { it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import GlassSelect from '../src/GlassSelect';

it('selecting zoom does not steal focus from the next field on a later frame', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++sequence, callback);
    return sequence;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => { frames.delete(id); });
  const change = vi.fn();
  render(<>
    <GlassSelect
      value="window"
      options={[{ value: 'window', label: '适应窗口' }, { value: 'width', label: '适应宽度' }]}
      onChange={change}
      ariaLabel="缩放方式"
    />
    <input aria-label="跳转到页码" />
  </>);
  fireEvent.click(screen.getByRole('combobox'));
  fireEvent.click(screen.getByRole('option', { name: '适应宽度' }));
  expect(change).toHaveBeenCalledWith('width');
  const input = screen.getByRole('textbox');
  input.focus();
  act(() => {
    for (const callback of [...frames.values()]) callback(performance.now());
    frames.clear();
  });
  expect(document.activeElement).toBe(input);
});
