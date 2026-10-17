import { net, protocol } from 'electron';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import os from 'node:os';

type Dimensions = { width?: number; height?: number };
type Entry = Dimensions & { token: string; key: string; file: string; signature: string; mime: string; bytes: number;
  buffer?: Buffer; load?: () => Promise<Buffer>; pending?: Promise<Buffer> };
const signature = (stat: { size: number; mtimeMs: number; ctimeMs: number }) => `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
const entries = new Map<string, Entry>(), tokens = new Map<string, Entry>();
const buffered = new Map<string, Entry>();
const preparing = new Map<string, Promise<ReturnType<typeof result>>>();
// Compressed/source bytes are independent from the reader's decoded-image window.
const byteLimit = Math.min(1024 * 1024 ** 2, Math.max(128 * 1024 ** 2, os.totalmem() / 32));
let bytes = 0;
const result = (entry: Entry) => ({ url: `omicomic-image://page/${entry.token}`, width: entry.width, height: entry.height });

function remember(entry: Entry) {
  entries.set(entry.key, entry); tokens.set(entry.token, entry);
  while (entries.size > 4096) {
    const oldest = entries.values().next().value!;
    entries.delete(oldest.key); tokens.delete(oldest.token); release(oldest);
  }
}
function release(entry: Entry) {
  if (buffered.delete(entry.token)) bytes -= entry.buffer?.length ?? 0;
  entry.buffer = undefined;
}
function keep(entry: Entry, buffer: Buffer) {
  release(entry); entry.buffer = buffer; buffered.set(entry.token, entry); bytes += buffer.length;
  while (bytes > byteLimit && buffered.size > 1) release(buffered.values().next().value!);
}
async function read(entry: Entry) {
  if (entry.buffer) { buffered.delete(entry.token); buffered.set(entry.token, entry); return entry.buffer; }
  if (!entry.load) throw new Error('No archive loader');
  entry.pending ??= entry.load().then(buffer => { keep(entry, buffer); return buffer; }).finally(() => { entry.pending = undefined; });
  return entry.pending;
}

/** Only called after the IPC path authorization. URLs contain an opaque capability,
 * never a filesystem path. File signatures prevent reuse after external edits. */
export async function prepareDesktopImage(file: string, mime: string, dimensions: (data: Buffer) => Dimensions | null,
  archive?: { innerPath: string; load: () => Promise<Buffer> }) {
  const stat = await fs.stat(file), stamp = signature(stat);
  if (!stat.isFile() || (!archive && stat.size > 256 * 1024 ** 2)) throw new Error('IMAGE_TOO_LARGE');
  const key = JSON.stringify([file, stamp, archive?.innerPath ?? '']);
  const cached = entries.get(key);
  if (cached) {
    entries.delete(key); entries.set(key, cached);
    if (archive) await read(cached);
    return result(cached);
  }
  const existing = preparing.get(key); if (existing) return existing;
  const job = (async () => {
    const entry: Entry = { token: randomUUID(), key, file, signature: stamp, mime, bytes: stat.size, load: archive?.load };
    if (archive) {
      const buffer = await archive.load();
      Object.assign(entry, dimensions(buffer)); entry.bytes = buffer.length; keep(entry, buffer);
    } else {
      const handle = await fs.open(file, 'r');
      try { const header = Buffer.alloc(Math.min(stat.size, 256 * 1024)); await handle.read(header, 0, header.length, 0); Object.assign(entry, dimensions(header)); }
      finally { await handle.close(); }
    }
    remember(entry); return result(entry);
  })().finally(() => preparing.delete(key));
  preparing.set(key, job); return job;
}

export function registerDesktopImageProtocol() {
  protocol.handle('omicomic-image', async request => {
    try {
      const url = new URL(request.url);
      const entry = url.hostname === 'page' ? tokens.get(url.pathname.slice(1)) : undefined;
      if (!entry || request.method !== 'GET') return new Response(null, { status: 404 });
      // Recheck the source for every fetch. Replacing a file never serves stale bytes.
      if (signature(await fs.stat(entry.file)) !== entry.signature) return new Response(null, { status: 410 });
      const headers = { 'Content-Type': entry.mime, 'Content-Length': String(entry.bytes),
        'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' };
      if (entry.load) return new Response(new Uint8Array(await read(entry)), { headers });
      const response = await net.fetch(pathToFileURL(entry.file).href);
      return new Response(response.body, { status: response.status, headers });
    } catch { return new Response(null, { status: 404 }); }
  });
}
