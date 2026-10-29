import { describe, expect, it } from 'vitest';
import { nativeRasterRectangle } from '../src/android/readerGeometry';

describe('moving native reader raster', () => {
  for (const dpr of [1, 1.25, 2.75, 3]) for (const axis of ['horizontal', 'vertical']) {
    it(`retains its physical size while dragging ${axis} at ${dpr}x`, () => {
      const sizes = new Set<string>();
      for (let n = 0; n < 80; n++) {
        const [left, top, right, bottom] = nativeRasterRectangle({
          left: axis === 'horizontal' ? 40 - n * .17 : 40,
          top: axis === 'vertical' ? 60 - n * .17 : 60,
          width: 101.3, height: 203.7,
        }, dpr);
        sizes.add(`${Math.round((right-left)*dpr)}:${Math.round((bottom-top)*dpr)}`);
        expect(left*dpr).toBeCloseTo(Math.round(left*dpr), 6);
        expect(top*dpr).toBeCloseTo(Math.round(top*dpr), 6);
      }
      expect([...sizes]).toEqual([`${Math.round(101.3*dpr)}:${Math.round(203.7*dpr)}`]);
    });
  }
});
