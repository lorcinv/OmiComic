import type {CSSProperties} from 'react';
import {isAndroid} from '../platform';
const individualTransforms=typeof CSS!=='undefined'&&CSS.supports('translate','0px')&&CSS.supports('scale','1');
/** Older WebViews need the equivalent transform list for touch page motion. */
export function readerMotionStyle(x:number,y:number,scale=1,panorama?:'horizontal'|'vertical'):CSSProperties{
  if(!isAndroid()||individualTransforms)return{translate:`${x}px ${y}px`,scale:String(scale)};
  // The panorama strip already owns a CSS transform for its page anchor.
  // An inline legacy gesture transform must compose with it, including the
  // live variables updated by dragging/inertia, rather than replace it.
  const anchor=panorama==='horizontal'
    ? ' translate3d(var(--reader-panorama-translate, 0px), calc(-50% + var(--reader-panorama-cross-shift, 0px)), 0)'
    : panorama==='vertical'
      ? ' translate3d(calc(-50% + var(--reader-panorama-cross-shift, 0px)), var(--reader-panorama-translate, 0px), 0)'
      : '';
  return{transform:`translate3d(${x}px,${y}px,0) scale(${scale})${anchor}`};
}
