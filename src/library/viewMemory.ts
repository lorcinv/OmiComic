// Browsing positions belong to this running app session only. A new renderer
// starts with an empty map; old browser/native records are deliberately ignored.
const records = new Map<string, unknown>();
const limit = 512;

export function startViewMemorySession(): void {
  records.clear();
}

export function readViewMemory<T>(key: string): T | undefined {
  return records.get(key) as T | undefined;
}

export function saveViewMemory(key: string, value: unknown): void {
  records.delete(key);
  records.set(key, value);
  if (records.size > limit) records.delete(records.keys().next().value!);
}
