import { open, type FileHandle } from "node:fs/promises";

/** Only byte ranges cross IPC; pdf.js parses in its dedicated renderer worker. */
export class PDFDocumentSource {
  private constructor(private file: FileHandle, readonly size: number) {}
  static async open(filePath: string): Promise<PDFDocumentSource> {
    const file = await open(filePath, "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size < 5 || stat.size > 2 * 1024 ** 3) throw new Error("PDF 文件为空或超过 2 GB 安全上限。");
      const signature = Buffer.alloc(5);
      await file.read(signature, 0, 5, 0);
      if (signature.toString() !== "%PDF-") throw new Error("文件不是有效的 PDF。");
      return new PDFDocumentSource(file, stat.size);
    } catch (error) { await file.close(); throw error; }
  }
  async range(begin: number, end: number): Promise<Uint8Array> {
    if (!Number.isInteger(begin) || !Number.isInteger(end) || begin < 0 || end <= begin || end > this.size || end - begin > 1024 * 1024) throw new Error("PDF 读取范围无效。");
    const bytes = Buffer.alloc(end - begin);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await this.file.read(bytes, offset, bytes.length - offset, begin + offset);
      if (!result.bytesRead) throw new Error("PDF 文件读取中断。");
      offset += result.bytesRead;
    }
    return bytes;
  }
  close(): Promise<void> { return this.file.close(); }
}
// Thumbnails are optional and must never trigger whole-document rasterization.
export async function 渲染PDF首页缩略图(): Promise<null> { return null; }
