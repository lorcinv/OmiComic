import { net, protocol } from 'electron';
import { promises as fs } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { SharedImageRead } from './sharedImageRead';

type Dimensions = { width?: number; height?: number };
type Entry = Dimensions & { token: string; key: string; file: string; signature: string; mime: string; bytes: number;
  buffer?: Buffer; load?: (signal: AbortSignal) => Promise<Buffer>; read: SharedImageRead; header?: Promise<void> };
const signature = (stat: { size: number; mtimeMs: number; ctimeMs: number }) => `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
const entries = new Map<string, Entry>(), tokens = new Map<string, Entry>();
const buffered = new Map<string, Entry>();
// Compressed/source bytes are independent from the reader's decoded-image window.
const byteLimit = Math.min(256 * 1024 ** 2, Math.max(64 * 1024 ** 2, os.totalmem() / 128));
let bytes = 0;
const result = (entry: Entry) => ({ url: `omicomic-image://page/${entry.token}`, width: entry.width, height: entry.height, encodedBytes: entry.bytes });

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
async function read(entry: Entry, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (entry.buffer) { buffered.delete(entry.token); buffered.set(entry.token, entry); return entry.buffer; }
  if (!entry.load) throw new Error('No archive loader');
  return entry.read.read(async active => {
    const buffer = await entry.load!(active); active.throwIfAborted(); keep(entry, buffer); return buffer;
  }, signal);
}

/** Only called after the IPC path authorization. URLs contain an opaque capability,
 * never a filesystem path. File signatures prevent reuse after external edits. */
export async function prepareDesktopImage(file: string, mime: string, dimensions: (data: Buffer) => Dimensions | null,
  archive?: { innerPath: string; load: (signal: AbortSignal) => Promise<Buffer> }, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const stat = await fs.stat(file), stamp = signature(stat);
  if (!stat.isFile() || (!archive && stat.size > 256 * 1024 ** 2)) throw new Error('IMAGE_TOO_LARGE');
  const key = JSON.stringify([file, stamp, archive?.innerPath ?? '']);
  let entry = entries.get(key);
  if (!entry) {
    entry = { token: randomUUID(), key, file, signature: stamp, mime, bytes: stat.size, load: archive?.load, read: new SharedImageRead() };
    remember(entry);
  } else { entries.delete(key); entries.set(key, entry); if (archive) entry.load = archive.load; }
    if (archive) {
      const buffer = await read(entry, signal);
      Object.assign(entry, dimensions(buffer)); entry.bytes = buffer.length;
    } else {
      const current = entry;
      current.header ??= (async () => {
        const handle = await fs.open(file, 'r');
        try { const header = Buffer.alloc(Math.min(stat.size, 256 * 1024)); await handle.read(header, 0, header.length, 0); Object.assign(current, dimensions(header)); }
        finally { await handle.close(); }
      })().catch(error => { current.header = undefined; throw error; });
      await current.header;
    }
  signal?.throwIfAborted(); return result(entry);
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
      if (entry.load) { const bytes = await read(entry, request.signal); return new Response(new Uint8Array(bytes.buffer as ArrayBuffer, bytes.byteOffset, bytes.length), { headers }); }
      const response = await net.fetch(pathToFileURL(entry.file).href, { signal: request.signal });
      return new Response(response.body, { status: response.status, headers });
    } catch { return new Response(null, { status: 404 }); }
  });
}
