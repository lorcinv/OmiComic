import { parentPort, workerData } from "node:worker_threads";
import path from "node:path";
import yauzl from "yauzl";
import { XMLParser } from "fast-xml-parser";
import sanitizeHtml from "sanitize-html";
import { safeRasterImage } from "./documentImageSafety";

const MAX_ENTRY = 16 * 1024 * 1024;
const MAX_CHAPTER = 32 * 1024 * 1024;
const MAX_SERIALIZED_CHAPTER = MAX_CHAPTER;
// Leave space for the fixed document wrapper; charge every image occurrence, not just unique files.
const DOCUMENT_WRAPPER_RESERVE = 4096;
export function embedChapterImages(html: string, replacements: Map<string, string>): string {
  const imageSource = /(<img[^>]*\ssrc=")([^"]*)(")/g;
  let serializedBytes = Buffer.byteLength(html, "utf8");
  for (const match of html.matchAll(imageSource)) {
    serializedBytes += Buffer.byteLength(replacements.get(match[2]) || "", "utf8") - Buffer.byteLength(match[2], "utf8");
    if (serializedBytes > MAX_SERIALIZED_CHAPTER - DOCUMENT_WRAPPER_RESERVE) throw new Error("EPUB 章节序列化内容超过安全上限。");
  }
  if (serializedBytes > MAX_SERIALIZED_CHAPTER - DOCUMENT_WRAPPER_RESERVE) throw new Error("EPUB 章节序列化内容超过安全上限。");
  return html.replace(imageSource, (_all, before, reference, after) => before + (replacements.get(reference) || "") + after);
}
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", removeNSPrefix: true, processEntities: false });
const list = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
export function resolveEpubPath(base: string, reference: string): string {
  const clean = decodeURIComponent(reference.split(/[?#]/)[0]);
  if (!clean || /^[a-z][a-z\d+.-]*:/i.test(clean) || clean.startsWith("/") || clean.includes("\\") || clean.includes("\0")) throw new Error("EPUB 引用了不安全的资源路径。");
  const result = path.posix.normalize(path.posix.join(path.posix.dirname(base), clean));
  if (result === ".." || result.startsWith("../")) throw new Error("EPUB 资源路径越界。");
  return result;
}
export function sanitizeChapter(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "div", "span", "h1", "h2", "h3", "h4", "h5", "h6", "br", "hr", "strong", "em", "b", "i", "u", "s", "blockquote", "pre", "code", "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tr", "th", "td", "caption", "img", "ruby", "rt", "rp", "sup", "sub"],
    allowedAttributes: { img: ["src", "alt"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"] },
    allowedSchemes: ["data"], allowedSchemesByTag: { img: ["data"] }, allowProtocolRelative: false,
    transformTags: { img: (_tag, attrs) => ({ tagName: "img", attribs: { alt: attrs.alt || "", ...( /^data:image\/(png|jpeg|gif|webp);base64,[a-z\d+/=]+$/i.test(attrs.src || "") ? { src: attrs.src } : {} ) } }) },
  });
}
async function createBook(filePath: string) {
  const zip = await yauzl.openPromise(filePath, { autoClose: false, lazyEntries: true, validateEntrySizes: true, strictFileNames: true });
  const entries = new Map<string, yauzl.Entry>();
  try {
    for await (const entry of zip.eachEntry()) {
      if (entries.size >= 20000) throw new Error("EPUB 条目过多。");
      if (entry.isEncrypted()) throw new Error("暂不支持加密 EPUB。");
      if (entries.has(entry.fileName)) throw new Error("EPUB 存在重复资源路径。");
      entries.set(entry.fileName, entry);
    }
    async function read(name: string, limit = MAX_ENTRY): Promise<Buffer> {
      const entry = entries.get(name);
      if (!entry || entry.uncompressedSize > limit || entry.uncompressedSize / Math.max(1, entry.compressedSize) > 1000) throw new Error("EPUB 资源缺失或超过安全上限。");
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of stream) {
        length += chunk.length;
        if (length > limit) { stream.destroy(); throw new Error("EPUB 资源过大。"); }
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    }
    const xml = (data: Buffer) => { const value = data.toString("utf8"); if (/<!DOCTYPE|<!ENTITY/i.test(value)) throw new Error("不支持含外部实体声明的 EPUB 元数据。"); return parser.parse(value); };
    const container = xml(await read("META-INF/container.xml", 1024 * 1024));
    const rootfile: any = list(container.container?.rootfiles?.rootfile)[0];
    const opfPath = resolveEpubPath("book", rootfile?.["full-path"] || "");
    const opf = xml(await read(opfPath, 4 * 1024 * 1024)).package;
    const manifest = new Map<string, any>(list<any>(opf?.manifest?.item).map((item) => [String(item.id), item]));
    const chapters = list<any>(opf?.spine?.itemref).filter(item => item.linear !== "no").map((item, index) => {
      const resource = manifest.get(String(item.idref));
      if (!resource || !["application/xhtml+xml", "text/html"].includes(resource["media-type"])) throw new Error("EPUB 章节格式不受支持。");
      return { name: `第 ${index + 1} 章`, index, path: resolveEpubPath(opfPath, resource.href) };
    });
    if (!chapters.length || chapters.length > 10000) throw new Error("EPUB 没有可阅读章节或章节过多。");
    async function chapter(index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= chapters.length) throw new Error("章节编号无效。");
      const current = chapters[index];
      let html = (await read(current.path, 4 * 1024 * 1024)).toString("utf8");
      // First sanitize to inert image placeholders; never preserve publisher CSS, URLs, or SVG.
      html = sanitizeHtml(html, { allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "ruby", "rt", "rp"], allowedAttributes: { img: ["src", "alt"] }, allowedSchemes: [], allowProtocolRelative: false, transformTags: { img: (_tag, attrs) => ({ tagName: "img", attribs: { src: attrs.src || "", alt: attrs.alt || "" } }) } });
      const replacements = new Map<string, string>(); let bytes = 0;
      for (const match of html.matchAll(/<img[^>]*\ssrc="([^"]*)"/g)) {
        const reference = match[1]; if (replacements.has(reference)) continue;
        if (replacements.size >= 100) break;
        try {
          const imagePath = resolveEpubPath(current.path, reference.replace(/&amp;/g, "&"));
          const extension = path.posix.extname(imagePath).toLowerCase();
          const mime: Record<string, string> = { ".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".gif": "gif", ".webp": "webp" };
          if (!mime[extension]) continue;
          const data = await read(imagePath, 8 * 1024 * 1024); bytes += data.length;
          if (bytes > MAX_CHAPTER) throw new Error("EPUB 章节图片超过安全上限。");
          if (!safeRasterImage(data)) continue;
          replacements.set(reference, `data:image/${mime[extension]};base64,${data.toString("base64")}`);
        } catch (error) { if (bytes > MAX_CHAPTER) throw error; }
      }
      html = embedChapterImages(html, replacements);
      const content = sanitizeChapter(html);
      if (Buffer.byteLength(content, "utf8") > MAX_SERIALIZED_CHAPTER - DOCUMENT_WRAPPER_RESERVE) throw new Error("EPUB 章节序列化内容超过安全上限。");
      return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{max-width:850px;margin:32px auto;padding:0 24px;background:#fff;color:#202124;line-height:1.8;font:18px/1.8 system-ui}img{max-width:100%;height:auto}table{max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body>${content}</body></html>`;
    }
    return { chapters: chapters.map(({ name, index }) => ({ name, index })), chapter };
  } catch (error) { zip.close(); throw error; }
}
if (parentPort) {
  const book = createBook(workerData.filePath);
  book.catch(() => undefined);
  // Serialize decompression and sanitization; never render an entire book at once.
  let queue = Promise.resolve();
  parentPort.on("message", ({ id, method, index }) => {
    queue = queue.then(async () => {
      try { const source = await book; const data = method === "index" ? source.chapters : await source.chapter(index); parentPort!.postMessage({ id, data }); }
      catch (error) { parentPort!.postMessage({ id, error: error instanceof Error ? error.message : "EPUB 读取失败。" }); }
    });
  });
}
