import type { 应用信息 } from './types';

export interface AvailableUpdate { version: string; notes: string; url: string }
export type UpdateResult = { kind: 'available'; update: AvailableUpdate } | { kind: 'current' | 'unavailable' };
const repository = 'https://github.com/lorcinv/OmiComic';
const endpoint = 'https://api.github.com/repos/lorcinv/OmiComic/releases?per_page=100';
const day = 24 * 60 * 60 * 1000;
const numbers = (v: string) => /^v?\d+(?:\.\d+){2,3}$/.test(v) ? v.replace(/^v/, '').split('.').map(Number) : null;
export function compareVersions(a: string, b: string): number {
  const left = numbers(a), right = numbers(b);
  if (!left || !right) throw new Error('无效的版本信息。');
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0); if (delta) return Math.sign(delta);
  }
  return 0;
}
export function selectUpdate(payload: unknown, info: 应用信息): UpdateResult {
  if (!Array.isArray(payload)) throw new Error('无效的更新信息。');
  const matches = (name: string) => {
    if (info.platform === 'win32') return /(?:setup|win|portable)/i.test(name) && /\.(exe|zip)$/i.test(name) && !/arm64|ia32/i.test(name);
    if (info.platform === 'android') return /\.apk$/i.test(name);
    if (info.platform === 'darwin') return /(?:mac|darwin)/i.test(name) && /\.(dmg|zip)$/i.test(name) && (info.arch ? new RegExp(`(?:${info.arch}|universal)`, 'i').test(name) : /universal/i.test(name));
    return false;
  };
  const releases = payload.filter((r: any) => r && !r.draft && !r.prerelease && typeof r.tag_name === 'string' && numbers(r.tag_name) && Array.isArray(r.assets)
    && r.html_url === `${repository}/releases/tag/${encodeURIComponent(r.tag_name)}`
    && r.assets.some((a: any) => typeof a?.name === 'string' && matches(a.name) && a.size > 0 && typeof a.browser_download_url === 'string' && a.browser_download_url.startsWith(`${repository}/releases/download/`)))
    .sort((a: any, b: any) => compareVersions(b.tag_name, a.tag_name));
  if (!releases.length) return { kind: 'unavailable' };
  const latest = releases[0];
  if (compareVersions(latest.tag_name, info.version) <= 0) return { kind: 'current' };
  return { kind: 'available', update: { version: latest.tag_name.replace(/^v/, ''), url: latest.html_url, notes: typeof latest.body === 'string' ? latest.body.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^[#*>\s-]+/gm, '').trim().slice(0, 480) : '' } };
}
let inFlight: Promise<UpdateResult> | undefined;
export async function checkForUpdates(automatic = false): Promise<UpdateResult | null> {
  const info = await window.omicomic.getAppInfo();
  const key = `omi-update-check:${info.platform}:${info.arch ?? ''}:${info.version}`;
  const now = Date.now();
  if (automatic) {
    try { const last = Number(localStorage.getItem(key)); if (last > 0 && now >= last && now - last < day) return null; } catch { /* Private storage can be disabled. */ }
  }
  if (inFlight) return inFlight;
  try { localStorage.setItem(key, String(now)); } catch { /* Checking remains available without local storage. */ }
  inFlight = (async () => {
    const abort = new AbortController(); const timer = window.setTimeout(() => abort.abort(), 12000);
    try {
      const response = await fetch(endpoint, { signal: abort.signal, headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text(); if (text.length > 4 * 1024 * 1024) throw new Error('更新信息过大。');
      return selectUpdate(JSON.parse(text), info);
    } finally { clearTimeout(timer); }
  })();
  try { return await inFlight; } finally { inFlight = undefined; }
}
