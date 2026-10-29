// A published array is immutable. Its delta is retained only while that array
// is alive, so consumers can skip re-visiting an unchanged catalog prefix.
type Delta<T> = { previous: object; changed: readonly T[]; removed: readonly string[] };
const deltas = new WeakMap<readonly unknown[], Delta<unknown>>();
const identities = new WeakMap<readonly unknown[], object>();
export function catalogSnapshotId(items: readonly unknown[]) {
  let id = identities.get(items);
  if (!id) { id = {}; identities.set(items, id); }
  return id;
}
export function recordCatalogDelta<T>(items: readonly T[], previous: readonly T[], changed: readonly T[], removed: readonly string[]) {
  deltas.set(items, { previous: catalogSnapshotId(previous), changed, removed });
}
export function catalogDelta<T>(items: readonly T[]): Delta<T> | undefined {
  return deltas.get(items) as Delta<T> | undefined;
}
