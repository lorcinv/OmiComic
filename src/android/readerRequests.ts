import { androidCall } from './bridge';
import { abortable } from '../reader/abortable';

export function readerRequestCancelled(reason:unknown):boolean {
  return typeof reason==='object' && reason!==null && 'name' in reason && reason.name==='AbortError';
}

/** A still-wanted page may encounter the previous native window's cancellation.
 * Refresh navigation arguments and retry it; real I/O/decode errors pass through. */
export async function prepareNativeReaderPage<T>(args:()=>unknown,signal?:AbortSignal):Promise<T>{
  for(let attempt=0;;attempt++){
    try{return await abortable(()=>androidCall<T>('readerPrepare',args()),signal);}
    catch(reason){
      if(signal?.aborted||!readerRequestCancelled(reason)||attempt>=2)throw reason;
      await abortable(()=>new Promise<void>(resolve=>setTimeout(resolve,16)),signal);
    }
  }
}
