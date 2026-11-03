import type { OmiComicApi, VirtualFolderItemInput } from '../types';

/** A shelf contains books. Collection directories expand to their books, never another browsing level. */
export async function collectBookshelfItems(
  inputs: readonly VirtualFolderItemInput[],
  api: Pick<OmiComicApi, 'listDirectory'> = window.omicomic,
): Promise<VirtualFolderItemInput[]> {
  const books = new Map<string, VirtualFolderItemInput>();
  const visited = new Set<string>();
  const add = (item: VirtualFolderItemInput) => { if (!books.has(item.resourceKey)) books.set(item.resourceKey, item); };
  async function visit(item: VirtualFolderItemInput, depth: number): Promise<void> {
    if (item.sourceType !== 'folder') { add(item); return; }
    const identity = item.sourcePath.replace(/\\/g, '/').replace(/\/$/, '');
    if (visited.has(identity)) return;
    if (depth > 64 || visited.size >= 10000) throw new Error('文件夹层级或数量过多，请分批加入书架。');
    visited.add(identity);
    const result = await api.listDirectory(item.sourcePath);
    if (!result.ok) throw new Error(result.error.message);
    // Loose images in one directory are one comic, with its normal page order.
    if (result.data.items.some(child => child.type === 'image')) add(item);
    for (const child of result.data.items) {
      if (child.hasError) throw new Error(child.errorMessage || '文件夹中的资源无法读取。');
      if (!['folder', 'archive', 'pdf', 'epub', 'mobi'].includes(child.type)) continue;
      await visit({ resourceKey: `${child.type}:${child.path}`, sourcePath: child.path,
        sourceType: child.type, title: child.name }, depth + 1);
    }
  }
  for (const item of inputs) await visit(item, 0);
  return [...books.values()];
}
