import type {CSSProperties} from 'react';
import {isAndroid} from '../platform';
const individualTransforms=typeof CSS!=='undefined'&&CSS.supports('translate','0px')&&CSS.supports('scale','1');
/** Older WebViews need the equivalent transform list for touch page motion. */
export function readerMotionStyle(x:number,y:number,scale=1):CSSProperties{
  return isAndroid()&&!individualTransforms?{transform:`translate3d(${x}px,${y}px,0) scale(${scale})`}:{translate:`${x}px ${y}px`,scale:String(scale)};
}
