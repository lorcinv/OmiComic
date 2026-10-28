import type { 文件条目, 目录结果, 操作结果 } from '../types';

export type RandomCandidate = { key: string; file: 文件条目 };

// Rejection sampling removes modulo bias. Every batch is an independent draw
// from the complete pool, using the OS-backed Web Crypto random source.
export function secureRandomIndex(maximum: number): number {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 0x100000000) throw new RangeError('Invalid random range');
  const limit = Math.floor(0x100000000 / maximum) * maximum;
  const bytes = new Uint32Array(1);
  do { crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
  return bytes[0] % maximum;
}
export function sampleRandom<T>(items: readonly T[], count: number, key: (item: T) => string,
  _previous: readonly string[] = [], randomIndex: (maximum: number) => number = secureRandomIndex): T[] {
  const pool = [...new Map(items.map(item => [key(item), item])).values()];
  const take = Math.min(pool.length, Math.max(0, count));
  for (let index = 0; index < take; index++) {
    const selected = index + randomIndex(pool.length - index);
    [pool[index], pool[selected]] = [pool[selected], pool[index]];
  }
  return pool.slice(0, take);
}

// Image pages belong to their containing book, rather than becoming separate books.
export async function collectRandomComics(root: string,
  read: (path: string) => Promise<操作结果<目录结果>>,
  signal: AbortSignal, progress: (directories: number) => void = () => {}): Promise<RandomCandidate[]> {
  const queue: Array<{ path: string; entry?: 文件条目 }> = [{ path: root }];
  const visited = new Set<string>(), result: RandomCandidate[] = [];
  const canonical = (path: string) => /^[a-z]:/i.test(path) ? path.replace(/\\/g, '/').toLowerCase() : path;
  let scanned = 0;
  while (queue.length) {
    signal.throwIfAborted();
    const batch = queue.splice(0, 4).filter(item => {
      const key = canonical(item.path);
      if (visited.has(key)) return false;
      visited.add(key); return true;
    });
    const directories = await Promise.all(batch.map(async item => {
      try { return { item, response: await read(item.path) }; }
      catch (error) { if (item.path === root) throw error; return { item, response: null }; }
    }));
    signal.throwIfAborted();
    for (const { item, response } of directories) {
      scanned++;
      if (!response?.ok) {
        if (item.path === root) throw new Error(response && !response.ok ? response.error.message : '资源库读取失败，请重试。');
        continue;
      }
      if (response.data.items.some(file => file.type === 'image' && !file.hasError)) {
        const folder: 文件条目 = item.entry ?? { id: root, path: root, name: root.split(/[\\/]/).filter(Boolean).at(-1) ?? root, type: 'folder', extension: '' };
        result.push({ key: `folder:${folder.path}`, file: folder });
      }
      for (const file of response.data.items) {
        if (file.hasError) continue;
        if (file.type === 'folder') queue.push({ path: file.path, entry: file });
        else if (['archive', 'pdf', 'epub'].includes(file.type)) result.push({ key: `${file.type}:${file.path}`, file });
      }
    }
    progress(scanned);
  }
  return result;
}
