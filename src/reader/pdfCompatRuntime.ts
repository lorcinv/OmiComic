import * as compatible from 'pdfjs-compat';
import workerUrl from '../android/pdfCompat.worker?worker&url';
import type * as Current from 'pdfjs-dist';

compatible.GlobalWorkerOptions.workerSrc = workerUrl;
let worker:compatible.PDFWorker|undefined;
export function getSharedPdfWorker():Current.PDFWorker {
  if(!worker||worker.destroyed)worker=new compatible.PDFWorker();
  return worker as unknown as Current.PDFWorker;
}
export function warmPdfWorker(){return getSharedPdfWorker().promise;}
export const getDocument = compatible.getDocument as unknown as typeof Current.getDocument;
export const PDFDataRangeTransport = compatible.PDFDataRangeTransport as unknown as typeof Current.PDFDataRangeTransport;
