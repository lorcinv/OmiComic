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
  if (type === 'pdf') void import('./pdfRuntime').then(runtime=>runtime.warmPdfWorker()).catch(() => undefined);
}
