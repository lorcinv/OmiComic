import path from "node:path";
import { promises as fs } from "node:fs";
import { shell } from "electron";
import { 执行资源文件事务 } from "./appDataService";
import { withinPath, updateResourceRecords } from "./resourceRecords";

export function validateLocalName(name: unknown): asserts name is string {
  if (typeof name !== "string" || !name.trim() || name !== name.trim() || name.length > 180
    || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error("名称无效：不能包含路径、特殊字符、末尾空格或系统保留名称。");
  }
}

export async function changeLocalResource(input: { path: string; action: "rename" | "trash" | "index"; name?: string }, roots: string[]) {
  if (!input || typeof input.path !== "string" || !path.isAbsolute(input.path)
    || !["rename", "trash", "index"].includes(input.action)) throw new Error("文件操作参数无效。");
  const source = path.resolve(input.path);
  const root = roots.find(p => withinPath(source, p));
  if (!root) throw new Error("只能操作已授权目录中的资源。");
  const [realSource, realRoot, stat] = await Promise.all([fs.realpath(source), fs.realpath(root), fs.lstat(source)]);
  if (stat.isDirectory() && roots.some(p => withinPath(p, source))) throw new Error("不能对资源库目录执行此操作，请选择目录中的具体漫画。");
  if (stat.isSymbolicLink() || !withinPath(realSource, realRoot)) throw new Error("不能修改指向授权目录外的链接。");
  if (!stat.isFile() && !stat.isDirectory()) throw new Error("不支持此文件类型。");
  let destination: string | undefined;
  if (input.action === "rename") {
    validateLocalName(input.name);
    if (stat.isFile() && path.extname(input.name).toLowerCase() !== path.extname(source).toLowerCase()) {
      throw new Error("请保留原文件扩展名。");
    }
    destination = path.join(path.dirname(source), input.name);
    if (source === destination) throw new Error("名称没有改变。");
    try { await fs.lstat(destination); throw new Error("同名文件或文件夹已存在，请换一个名称。"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  const appData = await 执行资源文件事务(async (current, commit) => {
    if (destination) {
      try { await fs.lstat(destination); throw new Error("同名文件或文件夹已存在，请换一个名称。"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    const next = updateResourceRecords(current, source, destination);
    if (input.action === "index") {
      next.excludedResourcePaths = [...(next.excludedResourcePaths ?? []), source];
      await commit(next);
    } else if (destination) {
      await fs.rename(source, destination);
      try { await commit(next); }
      catch (error) {
        try { await fs.rename(destination, source); }
        catch { throw new Error(`文件已重命名为 ${destination}，但记录保存失败。请重新添加该目录。`); }
        throw error;
      }
    } else {
      // Never fall back to permanent deletion if the recycle bin rejects the operation.
      await shell.trashItem(source);
      try { await commit(next); }
      catch { throw new Error("文件已移入回收站，但索引保存失败。可从回收站恢复原文件。"); }
    }
    return next;
  });
  return { appData, newPath: destination ?? null };
}
