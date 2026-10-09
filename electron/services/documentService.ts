import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { PDFDocumentSource } from "./pdfService";
import { EPUBDocumentSource, type EPUBChapter } from "./epubService";

type Source = PDFDocumentSource | EPUBDocumentSource;
interface Session { owner: number; closed: boolean; source?: Source; cleanup?: () => void }
const sessions = new Map<string, Session>();
const closedRequests = new Map<string, number>();
function key(event: IpcMainInvokeEvent, id: unknown) {
  if (typeof id !== "string" || !/^[a-zA-Z\d-]{8,80}$/.test(id)) throw new Error("文档会话无效。");
  return `${event.sender.id}:${id}`;
}
async function close(session: Session) { session.closed = true; session.cleanup?.(); await session.source?.close(); }
export function registerDocumentIpc(findRoot: (filePath: string) => string | null) {
  const handle = (name: string, fn: (event: IpcMainInvokeEvent, ...args: any[]) => Promise<unknown>) => ipcMain.handle(name, async (event, ...args) => {
    try {
      if (event.senderFrame !== event.sender.mainFrame) throw new Error("文档子页面无权访问本地文件。");
      return { ok: true, data: await fn(event, ...args) };
    } catch (error) { return { ok: false, error: { code: "DOCUMENT_READ_FAILED", message: error instanceof Error ? error.message : "文档读取失败。" } }; }
  });
  handle("document:open", async (event, input: unknown) => {
    if (!input || typeof input !== "object" || !("path" in input) || typeof input.path !== "string" || !("type" in input) || !["pdf", "epub"].includes(String(input.type)) || !("id" in input)) throw new Error("文档参数无效。");
    const id = key(event, input.id);
    for (const [old, time] of closedRequests) if (time < Date.now() - 60000) closedRequests.delete(old);
    if (closedRequests.has(id)) throw new Error("文档会话已取消。");
    if (sessions.has(id)) throw new Error("文档会话已存在。");
    for (const [oldId, session] of sessions) if (session.owner === event.sender.id) { sessions.delete(oldId); void close(session).catch(() => undefined); }
    const session: Session = { owner: event.sender.id, closed: false };
    sessions.set(id, session);
    const onDestroyed = () => { sessions.delete(id); void close(session); };
    event.sender.once("destroyed", onDestroyed);
    session.cleanup = () => event.sender.removeListener("destroyed", onDestroyed);
    try {
      const target = path.resolve(input.path); const root = findRoot(target);
      if (!root || path.extname(target).toLowerCase() !== `.${input.type}`) throw new Error("文档不在已授权目录中，或格式不匹配。");
      const [realTarget, realRoot] = await Promise.all([realpath(target), realpath(root)]);
      const relative = path.relative(realRoot, realTarget);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("文档链接指向未授权目录。");
      const info = await stat(realTarget);
      if (!info.isFile() || info.size > 2 * 1024 ** 3) throw new Error("文档超过 2 GB 安全上限。");
      if (session.closed) throw new Error("文档会话已取消。");
      const source = input.type === "pdf" ? await PDFDocumentSource.open(realTarget) : new EPUBDocumentSource(realTarget);
      session.source = source;
      if (session.closed) { await source.close(); throw new Error("文档会话已取消。"); }
      if (source instanceof PDFDocumentSource) return { size: source.size, chapters: [] };
      const chapters = await source.request<EPUBChapter[]>("index");
      return { size: info.size, chapters };
    } catch (error) { if (sessions.get(id) === session) sessions.delete(id); await close(session); event.sender.removeListener("destroyed", onDestroyed); throw error; }
  });
  const source = (event: IpcMainInvokeEvent, id: unknown) => {
    const session = sessions.get(key(event, id));
    if (!session?.source || session.closed) throw new Error("文档会话已关闭。");
    return session.source;
  };
  handle("document:range", async (event, id, begin, end) => {
    const document = source(event, id);
    if (!(document instanceof PDFDocumentSource)) throw new Error("该文档不是 PDF。");
    return document.range(begin, end);
  });
  handle("document:chapter", async (event, id, index) => {
    const document = source(event, id);
    if (!(document instanceof EPUBDocumentSource)) throw new Error("该文档不是 EPUB。");
    return document.request<string>("chapter", index);
  });
  handle("document:close", async (event, requestId) => {
    const id = key(event, requestId); const session = sessions.get(id);
    closedRequests.set(id, Date.now());
    if (closedRequests.size > 1000) closedRequests.delete(closedRequests.keys().next().value!);
    sessions.delete(id); if (session) await close(session);
    return null;
  });
}
