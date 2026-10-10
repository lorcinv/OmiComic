import { Worker } from "node:worker_threads";
import path from "node:path";

export interface EPUBChapter { name: string; index: number }
export class EPUBDocumentSource {
  private worker: Worker;
  private counter = 0;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private closed = false;
  constructor(filePath: string) {
    // Worker runs from a real file in installed builds; development keeps the same sibling layout.
    const workerPath = path.join(__dirname, "epubWorker.js").replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
    this.worker = new Worker(workerPath, { workerData: { filePath }, resourceLimits: { maxOldGenerationSizeMb: 192 } });
    this.worker.on("message", ({ id, data, error }) => {
      const task = this.pending.get(id);
      if (!task) return;
      clearTimeout(task.timer); this.pending.delete(id);
      if (error) task.reject(new Error(error)); else task.resolve(data);
    });
    this.worker.on("error", (error) => this.fail(error));
    this.worker.on("exit", () => this.fail(new Error("EPUB 阅读任务已结束。")));
  }
  private fail(error: Error) {
    this.closed = true;
    for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject(error); }
    this.pending.clear();
  }
  request<T>(method: "index" | "chapter", index?: number): Promise<T> {
    if (this.closed) return Promise.reject(new Error("EPUB 已关闭。"));
    if (this.pending.size >= 2) return Promise.reject(new Error("请等待当前章节加载完成。"));
    return new Promise<T>((resolve, reject) => {
      const id = ++this.counter;
      const timer = setTimeout(() => { this.fail(new Error("EPUB 解析超时，文件可能已损坏。")); void this.worker.terminate(); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, method, index });
    });
  }
  async close() { this.fail(new Error("EPUB 已关闭。")); await this.worker.terminate(); }
}
