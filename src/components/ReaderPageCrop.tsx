import type { ReactNode } from 'react';
import type { SplitHalf } from '../../electron/shared/splitPages';

/** Crop a shared source surface; switching halves does not copy or decode pixels. */
export default function ReaderPageCrop({ half, width, height, children }: { half?: SplitHalf; width: number; height: number; children: ReactNode }) {
  if (!half) return <>{children}</>;
  return <div className="reader-page-crop" data-reader-page-crop={half} style={{ width, height }}>
    <div className="reader-page-crop-content" style={{ width: width * 2, height, marginLeft: half === 'R' ? -width : 0 }}>{children}</div>
  </div>;
}
