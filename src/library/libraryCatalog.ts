import { useEffect, useState } from 'react';
import type { LibraryCatalog, 目录结果, 文件条目 } from '../types';

type Store = { records: Map<string, 文件条目>; data: LibraryCatalog; listeners: Set<() => void>;
  consumers: number; pending?: Promise<LibraryCatalog>; invalid: Set<string>; restart: boolean; epoch: number; metadata: boolean; error: string; published: number; dirty: boolean; notification?: number };
const stores = new Map<string, Store>();
const empty: LibraryCatalog = { items: [], directories: 0, skipped: 0, scannedAt: 0, complete: false };
const canonical = (path: string) => /^[a-z]:/i.test(path) ? path.replace(/\\/g, '/').toLowerCase() : path;
let quietAfter = 0, paused = false, initialized = false;
export const catalogClientMetrics = { batches: 0, bytes: 0, updates: 0, cancelled: 0 };
function foreground() { quietAfter = performance.now() + 280; }
function initialize() {
  if (initialized) return; initialized = true;
  for (const name of ['pointerdown', 'wheel', 'scroll', 'keydown', 'compositionupdate']) window.addEventListener(name, foreground, { capture: true, passive: true });
  window.addEventListener('omi-app-pause', () => { paused = true; });
  window.addEventListener('omi-app-resume', () => { paused = false; foreground(); });
}
function storeFor(root: string): Store {
  let store = stores.get(root);
  if (!store) {
    store = { records: new Map(), data: empty, listeners: new Set(), consumers: 0, invalid: new Set(), restart: true, epoch: 0, metadata: false, error: '', published: 0, dirty: false };
    stores.set(root, store);
    // Eviction is an explicit inactive-root budget. Detaching a consumer never
    // clears another library; evicted summaries can be streamed from native disk.
    for (const [path, candidate] of stores) {
      if (stores.size <= 4) break;
      if (path !== root && !candidate.consumers && !candidate.listeners.size && !candidate.pending) stores.delete(path);
    }
  }
  return store;
}
function publish(store: Store, result?: LibraryCatalog) {
  if (store.notification) { window.clearTimeout(store.notification); store.notification = undefined; }
  store.data = { ...store.data, ...result, items: store.dirty ? [...store.records.values()] : store.data.items };
  store.dirty = false;
  store.published = performance.now();
  catalogClientMetrics.updates++;
  for (const listener of store.listeners) listener();
}
function merge(store: Store, result: LibraryCatalog) {
  let changed = false;
  for (const removed of result.removedPaths ?? []) {
    const path = canonical(removed);
    for (const [id, entry] of store.records) if (canonical(entry.path) === path || canonical(entry.path).startsWith(path + '/')) { store.records.delete(id); changed = true; }
  }
  for (const item of result.items) {
    if (item.type === 'image' || item.type === 'unknown') continue;
    const id = canonical(item.path), old = store.records.get(id);
    // Unknown catalog versions preserve metadata obtained from foreground reads.
    const next = old ? { ...old, ...item } : item;
    if (!old || Object.keys(next).some(field => next[field as keyof 文件条目] !== old[field as keyof 文件条目])) {
      store.records.set(id, next); changed = true;
    }
  }
  if (changed || store.data.complete !== result.complete || store.data.directories !== result.directories) {
    store.dirty ||= changed;
    store.data = { ...store.data, ...result, items: store.data.items };
    if (!store.data.items.length || result.complete || performance.now() - store.published >= 100) publish(store);
    else if (!store.notification) store.notification = window.setTimeout(() => { store.notification = undefined; publish(store); }, 100);
  }
}
export function observeLibraryDirectory(root: string, directory: 目录结果) {
  const store = storeFor(root);
  const folder: 文件条目 = { id: directory.path, path: directory.path, name: directory.path.split(/[\\/]/).filter(Boolean).at(-1) ?? directory.path,
    type: 'folder', extension: '', containsImages: directory.items.some(item => item.type === 'image') };
  const live = new Set(directory.items.filter(item => item.type !== 'image').map(item => canonical(item.path)));
  const parent = canonical(directory.path).replace(/\/$/, '') + '/';
  const removedPaths = [...store.records.values()].filter(item => {
    const relative = canonical(item.path).slice(parent.length);
    return canonical(item.path).startsWith(parent) && !relative.includes('/') && !live.has(canonical(item.path));
  }).map(item => item.path);
  merge(store, { ...store.data, items: [folder, ...directory.items], removedPaths });
}
export function cancelLibraryCatalog(root?: string) {
  // A departing search consumer does not own the shared discovery task.
  if (root && !storeFor(root).consumers) catalogClientMetrics.cancelled++;
}
export function excludeLibraryCatalogPaths(paths: string[]) {
  if (!paths.length) return;
  const hidden = new Set(paths.map(canonical));
  for (const store of stores.values()) {
    let changed = false;
    for (const [id, item] of store.records) {
      let path = canonical(item.path);
      while (path) {
        if (hidden.has(path)) { store.records.delete(id); changed = true; break; }
        const split = path.lastIndexOf('/'); if (split <= 0) break; path = path.slice(0, split);
      }
    }
    if (changed) { store.dirty = true; publish(store); }
  }
}
export function invalidateLibraryCatalog(root?: string, directories?: string[]) {
  for (const [path, store] of stores) {
    if (root && path !== root) continue;
    for (const directory of directories ?? [path]) store.invalid.add(directory);
    store.data = { ...store.data, complete: false }; store.error = '';
    for (const listener of store.listeners) listener();
    if (store.consumers) void run(path, store);
  }
  window.dispatchEvent(new CustomEvent('omi-library-catalog-invalidated', { detail: { root, directories } }));
}
const wait = (milliseconds: number) => new Promise<void>(resolve => window.setTimeout(resolve, milliseconds));
async function run(root: string, store: Store, explicit = false): Promise<LibraryCatalog> {
  if (store.pending) return store.pending;
  const task = (async () => {
    const epoch = store.epoch;
    while ((explicit || store.consumers > 0) && (!store.data.complete || store.invalid.size)) {
      if (!explicit && (paused || document.hidden || performance.now() < quietAfter)) { await wait(100); continue; }
      const invalid = [...store.invalid]; store.invalid.clear();
      const restart = store.restart; store.restart = false;
      const response = await window.omicomic.scanLibrary(root, false, false, { incremental: true, restart, metadata: store.metadata, invalidatePaths: invalid });
      if (epoch !== store.epoch) break;
      if (!response?.ok || !response.data?.items) {
        for (const directory of invalid) store.invalid.add(directory);
        throw new Error(response && !response.ok ? response.error.message : '资源库索引读取失败，请刷新后重试。');
      }
      const result = { ...response.data, complete: response.data.complete ?? true };
      catalogClientMetrics.batches++; catalogClientMetrics.bytes += JSON.stringify(result).length * 2;
      merge(store, result);
      if (result.complete) break;
      await wait(result.yielded ? 100 : 16);
    }
    return store.data;
  })();
  store.pending = task;
  try { return await task; }
  catch (error) { store.error = error instanceof Error ? error.message : '资源库索引读取失败。'; for (const listener of store.listeners) listener(); return store.data; }
  finally { if (store.pending === task) store.pending = undefined; }
}
export async function loadLibraryCatalog(root: string, _booksOnly = false): Promise<LibraryCatalog> {
  initialize(); return run(root, storeFor(root), true);
}
export function useLibraryCatalog(root: string | null, enabled: boolean, metadata = false) {
  const [, update] = useState(0);
  useEffect(() => {
    initialize(); if (!root) return;
    const store = storeFor(root), changed = () => update(value => value + 1);
    const revalidate = () => {
      if (!store.data.complete || Date.now() - store.data.scannedAt <= 120_000) return;
      store.restart = true; store.data = { ...store.data, complete: false };
      void run(root, store);
    };
    store.listeners.add(changed);
    if (enabled) {
      store.consumers++;
      // Refresh stale summaries when entering a search, never periodically
      // while the user is paging through an already displayed result session.
      revalidate();
      if (metadata && !store.metadata) { store.metadata = true; store.restart = true; store.data = { ...store.data, complete: false }; }
      void run(root, store);
    }
    return () => { store.listeners.delete(changed); if (enabled) store.consumers--; };
  }, [root, enabled, metadata]);
  const store = root ? storeFor(root) : null;
  return { ...(store?.data ?? empty), loading: !!enabled && !store?.data.complete && !store?.error, error: store?.error || (store?.data.skipped ? '部分目录读取失败，已发现结果仍可用。' : '') };
}
