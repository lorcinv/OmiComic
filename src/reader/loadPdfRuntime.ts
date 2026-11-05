import { isAndroid } from '../platform';
import { needsCompatiblePdf } from '../android/webviewCapabilities';
export function loadPdfRuntime() {
  return isAndroid() && needsCompatiblePdf ? import('./pdfCompatRuntime') : import('./pdfRuntime');
}
