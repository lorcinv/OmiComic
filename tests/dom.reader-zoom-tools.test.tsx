import React from 'react';
import {render,fireEvent,screen} from '@testing-library/react';
import {test,expect,vi} from 'vitest';
import ReaderTools from '../src/components/ReaderTools';
import {DEFAULT_ADJUSTMENTS} from '../electron/shared/readerPreferences';

test('desktop slider maps 25%, 50%, 100% and 600% without a stale 50% floor',()=>{
  const onZoom=vi.fn(),onResetZoom=vi.fn();
  const props={disabled:false,epub:false,adjustments:DEFAULT_ADJUSTMENTS,onAdjustments:vi.fn(),running:false,onPlay:vi.fn(),onPanel:vi.fn(),onZoom,onResetZoom};
  const view=render(<ReaderTools {...props} zoom={.25}/>);
  fireEvent.click(screen.getByRole('button',{name:'缩放',exact:true}));
  const slider=screen.getByRole('slider',{name:'缩放比例'}) as HTMLInputElement;
  expect(slider.value).toBe('-100');expect(slider.getAttribute('aria-valuetext')).toBe('25%');
  expect(screen.getByText('25%',{selector:'.reader-zoom-ticks span'})).toBeTruthy();
  for(const [value,scale] of [[-50,.5],[0,1],[100,6],[-100,.25]]) {
    fireEvent.change(slider,{target:{value:String(value)}});expect(onZoom).toHaveBeenLastCalledWith(scale);view.rerender(<ReaderTools {...props} zoom={scale}/>);
  }
  view.rerender(<ReaderTools {...props} zoom={.5}/>);expect(slider.value).toBe('-50');
  fireEvent.click(screen.getByRole('button',{name:'重置大小'}));expect(onResetZoom).toHaveBeenCalledOnce();
});
