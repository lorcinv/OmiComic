import { GlobalWorkerOptions, PDFWorker } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;
let sharedWorker:PDFWorker|undefined;
/** Each document owns its transport; the application owns the parsing worker. */
export function getSharedPdfWorker(){
  if(!sharedWorker||sharedWorker.destroyed)sharedWorker=new PDFWorker();
  return sharedWorker;
}
export function warmPdfWorker(){return getSharedPdfWorker().promise;}
export { getDocument, PDFDataRangeTransport } from "pdfjs-dist";
