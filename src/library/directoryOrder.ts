import type { AppSettings, 文件条目, 资源类型 } from '../types';

const names = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const types: Record<资源类型, number> = { folder: 0, image: 1, archive: 2, pdf: 3, epub: 4, mobi: 5, unknown: 6 };
export function directoryOrder(settings: Pick<AppSettings, 'sortMode' | 'folderFirst'>) {
  return (left: 文件条目, right: 文件条目): number => {
    if (settings.folderFirst && (left.type === 'folder') !== (right.type === 'folder')) return left.type === 'folder' ? -1 : 1;
    if (settings.sortMode === 'name-desc') return names.compare(right.name, left.name);
    if (settings.sortMode === 'time-asc' || settings.sortMode === 'time-desc') {
      if (left.modifiedAt === undefined || right.modifiedAt === undefined) {
        if (left.modifiedAt !== right.modifiedAt) return left.modifiedAt === undefined ? 1 : -1;
      } else if (left.modifiedAt !== right.modifiedAt) return (settings.sortMode === 'time-asc' ? 1 : -1) * (left.modifiedAt - right.modifiedAt);
    }
    if (settings.sortMode === 'type' && left.type !== right.type) return types[left.type] - types[right.type];
    return names.compare(left.name, right.name);
  };
}
