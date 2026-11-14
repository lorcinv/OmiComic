import { act, fireEvent, render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ReaderSwipePreview from '../src/components/ReaderSwipePreview';
import { DEFAULT_ADJUSTMENTS } from '../electron/shared/readerPreferences';

const processing = vi.hoisted(() => vi.fn(() => vi.fn()));
vi.mock('../src/reader/processingClient', async original => ({
  ...await original<typeof import('../src/reader/processingClient')>(),
  queueImageProcessing: processing,
}));

it.each(['01.gif', '01.GIF', '01.webp', '01.png', '01.apng'])('keeps %s live in a swipe preview and signals readiness with adjustments enabled', async name => {
  vi.useFakeTimers(); processing.mockClear();
  const prepared = vi.fn();
  const view = render(<ReaderSwipePreview
    pages={[{ index: 0, name, animated: !/gif$/i.test(name), url: 'fixture.gif', width: 96, height: 128 }]}
    groupKey="gif-preview" sizes={[{ width: 300, height: 400 }]}
    adjustments={{ ...DEFAULT_ADJUSTMENTS, enabled: true, sharpen: 40, denoise: 40, brightness: 125 }}
    gammaId="gif-gamma" onPrepared={prepared} onBytes={vi.fn()} style={{}}
  />);
  try {
    const image = view.container.querySelector('img')!;
    Object.defineProperty(image, 'decode', { value: vi.fn().mockResolvedValue(undefined) });
    await act(async () => { fireEvent.load(image); await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(processing).not.toHaveBeenCalled();
    expect(view.container.querySelector('.reader-effects')?.getAttribute('data-processing')).toBe('original');
    expect(view.container.querySelector<HTMLElement>('.reader-effects')?.style.filter).toContain('brightness(1.25)');
    expect(view.container.querySelector('canvas,.reader-processed-image')).toBeNull();
    expect(prepared).toHaveBeenCalledWith('gif-preview');
  } finally { view.unmount(); vi.useRealTimers(); }
});
