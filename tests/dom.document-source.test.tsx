import { afterEach, expect, it, vi } from 'vitest';
import { installMock } from './mock';

vi.mock('../src/reader/androidChapterLayout',async()=>{const actual=await vi.importActual<any>('../src/reader/androidChapterLayout');return{...actual,paginateChapter:async(html:string)=>({pages:[html],previews:['']})};});

const pdf = vi.hoisted(() => ({ load: vi.fn(), parse: vi.fn(), destroy: vi.fn(async () => {}) }));
vi.mock('../src/reader/pdfRuntime', () => {
  pdf.load();
  return {
    getSharedPdfWorker:()=>undefined, PDFDataRangeTransport: class { abort() {} },
    getDocument: (...args: unknown[]) => { pdf.parse(...args); return { promise: Promise.resolve({ numPages: 3 }), destroy: pdf.destroy }; },
  };
});
afterEach(() => { vi.clearAllMocks(); vi.resetModules(); });

async function source(type: 'pdf' | 'epub' | 'mobi') {
  installMock({ count: 1 });
  const { DocumentSource } = await import('../src/reader/documentSource');
  const path = `/comics/book.${type}`;
  return new DocumentSource({ key: path, resourceKey: `${type}:${path}`, sourcePath: path, sourceType: type, title: 'Book', pages: [], total: 0 });
}

it('EPUB opens without loading the PDF runtime', async () => {
  const book = await source('epub');
  window.omicomic.openDocument = vi.fn(async () => ({ ok: true, data: { size: 100, chapters: [{ index: 0, name: 'First' }] } }));
  window.omicomic.closeDocument = vi.fn(async () => ({ ok: true, data: null }));
  window.omicomic.readDocumentChapter=vi.fn(async()=>({ok:true,data:'<html><body><p>First</p></body></html>'}));
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

it.each(['pdf', 'epub', 'mobi'] as const)('cancelling a slow %s open releases a session that appears after the early close', async type => {
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

it('retains a prepared document through reader handoff without opening or parsing it again',async()=>{
  await source('epub');const {DocumentSource}=await import('../src/reader/documentSource');
  const resource={key:'epub:/prepared.epub',resourceKey:'epub:/prepared.epub',sourcePath:'/prepared.epub',sourceType:'epub' as const,title:'Prepared',pages:[],total:0};
  window.omicomic.openDocument=vi.fn(async()=>({ok:true,data:{size:100,chapters:[{name:'One',index:0}]}}));
  window.omicomic.readDocumentChapter=vi.fn(async()=>({ok:true,data:'<html><body><p>Prepared text</p></body></html>'}));
  window.omicomic.closeDocument=vi.fn(async()=>({ok:true,data:null}));
  const preview=new DocumentSource(resource,'thumbnail');await preview.open();
  const reader=(await DocumentSource.acquirePrepared(resource))!;expect(reader.source).toBe(preview);
  preview.dispose();expect(window.omicomic.closeDocument).not.toHaveBeenCalled();
  await reader.source.readPage(0);expect(window.omicomic.openDocument).toHaveBeenCalledTimes(1);expect(window.omicomic.readDocumentChapter).toHaveBeenCalledTimes(1);
  reader.source.releaseReader();expect(window.omicomic.closeDocument).toHaveBeenCalledTimes(1);
});
