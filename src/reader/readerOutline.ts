import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { EpubNavigation, 阅读页面项 } from '../types';

export type ReaderOutlineEntry = {
  title: string;
  depth: number;
  target: { page: number } | { chapter: number; anchor?: string };
};

export function readerPageCode(index: number, total: number): string {
  return String(index + 1).padStart(Math.max(3, String(total).length), '0');
}

export function imageOutline(pages: 阅读页面项[]): ReaderOutlineEntry[] {
  const groups = new Map<string, { title: string; page: number }>();
  const paths = pages.map(page => (page.name || page.virtualPath || '').split(/ \/ |[\\/]/));
  let prefix = 0;
  while (paths.length && paths.every(path => path.length > prefix + 1 && path[prefix] === paths[0][prefix])) prefix++;
  paths.forEach((path, page) => {
    const folder = path[prefix];
    if (path.length <= prefix + 1 || /^(__macosx|\.\w+)$/i.test(folder)) return;
    const title = folder.replace(/\.(zip|cbz|rar|cbr|7z|cb7)$/i, '');
    if (!groups.has(folder)) groups.set(folder, { title, page });
  });
  return [...groups.values()].map(({ title, page }) => ({ title, depth: 0, target: { page } }));
}

function epubTarget(base: string, href: string, chapters: Map<string, number>): ReaderOutlineEntry['target'] | undefined {
  const separator = href.indexOf('#');
  const path = (separator === -1 ? href : href.slice(0, separator)).split('?')[0];
  try {
    const relative = decodeURIComponent(path);
    if (/^([a-z][a-z\d+.-]*:|\/)|[\\\0]/i.test(relative)) return;
    const segments = base.split('/');
    if (relative) {
      segments.pop();
      for (const part of relative.split('/')) {
        if (part === '..') {
          if (!segments.length) return;
          segments.pop();
        } else if (part && part !== '.') segments.push(part);
      }
    }
    const chapter = chapters.get(segments.join('/'));
    if (chapter === undefined) return;
    const anchor = separator === -1 ? '' : decodeURIComponent(href.slice(separator + 1));
    return { chapter, anchor: anchor && anchor.length <= 512 ? anchor : undefined };
  } catch { return undefined; }
}

export function epubOutline(navigation: EpubNavigation): ReaderOutlineEntry[] {
  const chapters = new Map(navigation.chapters.map((path, index) => [path, index]));
  const children = (element: Element, name: string) => Array.from(element.children).filter(child => child.localName === name);
  for (const { path, kind, xml } of navigation.documents) {
    // Legacy NCX files can declare a public DTD. Never interpret custom declarations.
    if (/<!ENTITY|<!DOCTYPE[^>]*\[/i.test(xml)) continue;
    const doc = new DOMParser().parseFromString(xml.replace(/<!DOCTYPE[^>]*>/i, ''), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) continue;
    const container = kind === 'nav'
      ? Array.from(doc.getElementsByTagNameNS('*', 'nav')).find(nav =>
          (nav.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ?? nav.getAttribute('epub:type') ?? '').split(/\s+/).includes('toc'))
      : doc.getElementsByTagNameNS('*', 'navMap')[0];
    if (!container) continue;
    const entries: ReaderOutlineEntry[] = [];
    const add = (title: string | null | undefined, href: string | null | undefined, depth: number) => {
      const label = title?.replace(/\s+/g, ' ').trim().slice(0, 512);
      const target = href && epubTarget(path, href, chapters);
      if (label && target) entries.push({ title: label, depth, target });
    };
    const visit = (parent: Element, depth: number) => {
      if (depth > 20) return;
      for (const item of children(parent, kind === 'nav' ? 'li' : 'navPoint')) {
        if (entries.length >= 5000) return;
        if (kind === 'nav') {
          const link = children(item, 'a')[0];
          add(link?.textContent, link?.getAttribute('href'), depth);
          for (const nested of children(item, 'ol')) visit(nested, depth + 1);
        } else {
          const label = children(item, 'navLabel')[0];
          add(label?.textContent, children(item, 'content')[0]?.getAttribute('src'), depth);
          visit(item, depth + 1);
        }
      }
    };
    if (kind === 'nav') for (const list of children(container, 'ol')) visit(list, 0);
    else visit(container, 0);
    if (entries.length) return entries;
  }
  return [];
}

export async function pdfOutline(pdf: PDFDocumentProxy): Promise<ReaderOutlineEntry[]> {
  type PdfEntry = NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>[number];
  const links: { entry: PdfEntry; depth: number }[] = [];
  const visit = (items: PdfEntry[], depth: number) => {
    if (depth > 20) return;
    for (const entry of items) {
      if (links.length >= 5000) return;
      if (entry.dest && entry.title.trim()) links.push({ entry, depth });
      visit(entry.items, depth + 1);
    }
  };
  visit(await pdf.getOutline() ?? [], 0);
  const rows: ReaderOutlineEntry[] = [];
  for (let offset = 0; offset < links.length; offset += 16) {
    const batch = await Promise.all(links.slice(offset, offset + 16).map(async ({ entry, depth }) => {
      try {
        const destination = typeof entry.dest === 'string' ? await pdf.getDestination(entry.dest) : entry.dest;
        const reference = destination?.[0];
        const page = typeof reference === 'number' ? reference : reference ? await pdf.getPageIndex(reference) : -1;
        if (Number.isInteger(page) && page >= 0 && page < pdf.numPages) return { title: entry.title.trim(), depth, target: { page } };
      } catch { /* Ignore invalid destinations and keep the rest of the outline. */ }
    }));
    for (const row of batch) if (row) rows.push(row);
  }
  return rows;
}
