import {loadPdfRuntime} from './loadPdfRuntime';
import {hasAndroidRenderer} from '../android/bridge';
let pending: Promise<typeof import('../pages/ReaderPage')> | undefined;

export function loadReader() {
  return pending ??= import('../pages/ReaderPage').catch(error => {
    pending = undefined;
    throw error;
  });
}

// Opening intent can arrive before the idle preload. Fetch the reader while
// the manifest is being read so those independent waits do not add together.
export function warmReader(type?: string) {
  void loadReader().catch(() => undefined);
  // Native PDF reads never use PDF.js. Starting its parser/worker on the same
  // tap competes with the native first page, especially on a cold phone WebView.
  // DocumentSource still loads the compatible runtime if native opening fails.
  if (type === 'pdf' && !hasAndroidRenderer()) void loadPdfRuntime().then(runtime=>runtime.warmPdfWorker()).catch(() => undefined);
}
