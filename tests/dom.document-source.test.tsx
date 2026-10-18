import { afterEach, expect, it, vi } from 'vitest';
import { installMock } from './mock';

const pdf = vi.hoisted(() => ({ load: vi.fn(), parse: vi.fn(), destroy: vi.fn(async () => {}) }));
vi.mock('../src/reader/pdfRuntime', () => {
  pdf.load();
  return {
    PDFDataRangeTransport: class { abort() {} },
    getDocument: (...args: unknown[]) => { pdf.parse(...args); return { promise: Promise.resolve({ numPages: 3 }), destroy: pdf.destroy }; },
  };
});
afterEach(() => { vi.clearAllMocks(); vi.resetModules(); });

async function source(type: 'pdf' | 'epub') {
  installMock({ count: 1 });
  const { DocumentSource } = await import('../src/reader/documentSource');
  const path = `/comics/book.${type}`;
  return new DocumentSource({ key: path, resourceKey: `${type}:${path}`, sourcePath: path, sourceType: type, title: 'Book', pages: [], total: 0 });
}

it('EPUB opens without loading the PDF runtime', async () => {
  const book = await source('epub');
  window.omicomic.openDocument = vi.fn(async () => ({ ok: true, data: { size: 100, chapters: [{ index: 0, name: 'First' }] } }));
  window.omicomic.closeDocument = vi.fn(async () => ({ ok: true, data: null }));
  try {
    expect((await book.open()).total).toBe(1);
    expect(pdf.load).not.toHaveBeenCalled();
    expect(pdf.parse).not.toHaveBeenCalled();
  } finally { book.dispose(); }
});

it('PDF still initializes the range reader and releases its worker on close', async () => {
  const book = await source('pdf');
  window.omicomic.openDocument = vi.fn(async () => ({ ok: true, data: { size: 100, chapters: [] } }));
  window.omicomic.closeDocument = vi.fn(async () => ({ ok: true, data: null }));
  expect((await book.open()).pages).toHaveLength(3);
  expect(pdf.parse).toHaveBeenCalledWith(expect.objectContaining({ disableStream: true, disableAutoFetch: true, maxImageSize: 16_000_000 }));
  book.dispose();
  expect(pdf.destroy).toHaveBeenCalledOnce();
});

it.each(['pdf', 'epub'] as const)('cancelling a slow %s open releases a session that appears after the early close', async type => {
  const book = await source(type);
  const sessions = new Set<string>();
  let finish!: () => void;
  window.omicomic.openDocument = vi.fn(input => new Promise(resolve => { finish = () => {
    sessions.add(input.id);
    resolve({ ok: true, data: { size: 100, chapters: [{ index: 0, name: 'First' }] } });
  }; }));
  window.omicomic.closeDocument = vi.fn(async id => { sessions.delete(id); return { ok: true, data: null }; });
  const opening = book.open();
  book.dispose();
  finish();
  await expect(opening).rejects.toThrow('文档已关闭');
  expect(sessions.size).toBe(0);
  expect(pdf.parse).not.toHaveBeenCalled();
});
