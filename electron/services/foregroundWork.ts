let active = 0, quietAfter = 0;
export const foregroundMetrics = { operations: 0, stat: 0, readdir: 0 };
export function foregroundBusy() { return active > 0 || Date.now() < quietAfter; }
export function foregroundActivity(milliseconds = 180) { quietAfter = Math.max(quietAfter, Date.now() + milliseconds); }
export async function foregroundWork<T>(action: () => Promise<T>): Promise<T> {
  active++; foregroundMetrics.operations++;
  try { return await action(); } finally { active--; foregroundActivity(); }
}
