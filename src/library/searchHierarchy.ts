import type { 文件条目 } from '../types';
const key = (path: string) => /^[a-z]:/i.test(path) ? path.replace(/\\/g, '/').toLowerCase() : path;
// Matches are already evaluated independently. Never project a matched file to
// an ancestor: folders match their own names and readable files stay readable.
export function searchHierarchy(matches: 文件条目[], _catalog: 文件条目[], current: string): 文件条目[] {
  const base = key(current).replace(/\/+$/, '') + '/', seen = new Set<string>();
  return matches.filter(item => {
    const path = key(item.path);
    if (!path.startsWith(base) || seen.has(path)) return false;
    seen.add(path); return true;
  }).sort((a, b) => Number(b.type === 'folder') - Number(a.type === 'folder'));
}
