import {androidNotify,hasAndroidRenderer} from './bridge';
let opening:string|null=null;
let generation=0;
/** Prepare the outgoing scene alongside loading; reveal only the real page. */
export function beginReaderOpening(path:string){
  if(!hasAndroidRenderer()||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  if(opening===path)return generation;
  opening=path;generation++;
  androidNotify('readerIntent',{key:path});
  return generation;
}
export const readerOpeningCurrent=(ticket:number|undefined)=>ticket===undefined||opening!==null&&generation===ticket;
export function cancelReaderOpening(path?:string,ticket?:number){
  if(!opening||path&&path!==opening||ticket!==undefined&&ticket!==generation)return;
  androidNotify('cancelReaderIntent',{key:opening});opening=null;generation++;
}
