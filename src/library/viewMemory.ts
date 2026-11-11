import type { NativeCall } from '../android/bridge';

// Small UI records live with this installation, independently of the library's
// reading data. Scroll events update memory; disk writes are batched off the gesture.
const storageKey = 'omi-view-memory-v1';
const limit = 512;
let records: Map<string, unknown> | undefined;
let pending: ReturnType<typeof setTimeout> | undefined;
let nativeStorage: NativeCall | undefined;

function readEntries(saved: unknown): Map<string, unknown> {
  const entries = new Map<string, unknown>();
  if (Array.isArray(saved)) for (const entry of saved.slice(-limit)) {
    if (Array.isArray(entry) && typeof entry[0] === 'string') entries.set(entry[0], entry[1]);
  }
  return entries;
}

// Android can destroy its WebView before Chromium commits its last browser
// storage transaction. Load the separate native AtomicFile before mounting UI.
export async function initializeNativeViewMemory(native: NativeCall): Promise<void> {
  nativeStorage = native;
  try {
    const saved = await native<{ entries?: unknown } | null>('loadViewMemory');
    if (saved && Array.isArray(saved.entries)) records = readEntries(saved.entries);
    else { store(); await flushViewMemory(); }
  } catch { store(); }
}

function store(): Map<string, unknown> {
  if (records) return records;
  records = new Map();
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    records = readEntries(saved);
  } catch { /* A missing or damaged UI record starts at the default position. */ }
  return records;
}

export function readViewMemory<T>(key: string): T | undefined {
  return store().get(key) as T | undefined;
}

export function flushViewMemory(): Promise<void> {
  if (pending !== undefined) clearTimeout(pending);
  pending = undefined;
  if (!records) return Promise.resolve();
  try { localStorage.setItem(storageKey, JSON.stringify([...records])); }
  catch { /* Navigation still works if browser storage is unavailable. */ }
  // Post immediately, rather than after another JS task. Native persistence is
  // serialized independently from the WebView and survives its destruction.
  return nativeStorage ? nativeStorage('saveViewMemory', { entries: [...records] }).then(() => undefined).catch(() => undefined) : Promise.resolve();
}

export function saveViewMemory(key: string, value: unknown): void {
  const entries = store();
  entries.delete(key);
  entries.set(key, value);
  if (entries.size > limit) entries.delete(entries.keys().next().value!);
  if (key.startsWith('navigation:') || key.startsWith('directory:')) void flushViewMemory();
  else pending ??= setTimeout(flushViewMemory, 180);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushViewMemory);
  window.addEventListener('beforeunload', flushViewMemory);
  window.addEventListener('omi-app-pause', flushViewMemory);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushViewMemory(); });
}
