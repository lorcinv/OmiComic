const collator = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const ordinal = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const natural = (a: string, b: string) => collator.compare(a, b) || ordinal(a, b);

function leafKey(name: string) {
  const stem = name.replace(/\.[^.]+$/, '').normalize('NFKC');
  const numbered = /^[^\d]*?(\d+)([a-z]?)$/i.exec(stem);
  if (/^(?:_?c|cover|front[-_ ]?cover|folder|封面)$/i.test(stem)) return { rank: 0, number: '', suffix: '' };
  // Only a single page-number group is unambiguous. Multi-number chapter/page
  // names retain their usual natural order; do not guess which number is a page.
  return numbered ? { rank: 1, number: numbered[1].replace(/^0+(?=\d)/, ''), suffix: numbered[2] }
    : { rank: 2, number: '', suffix: '' };
}

/** Keep directories together, then calibrate mixed scan prefixes by page number.
 * This is a total order: cover / numbered / other names have explicit ranks. */
export function compareComicPagePaths(left: string, right: string): number {
  const a = left.replace(/\\/g, '/').split('/'), b = right.replace(/\\/g, '/').split('/');
  const ap = a.slice(0, -1), bp = b.slice(0, -1);
  for (let i = 0; i < Math.min(ap.length, bp.length); i++) {
    const order = natural(ap[i], bp[i]); if (order) return order;
  }
  if (ap.length !== bp.length) return ap.length - bp.length;
  const an = a.at(-1)!, bn = b.at(-1)!, ak = leafKey(an), bk = leafKey(bn);
  return ak.rank - bk.rank || (ak.rank === 1
    ? ak.number.length - bk.number.length || ordinal(ak.number, bk.number) || natural(ak.suffix, bk.suffix)
    : 0) || natural(an, bn) || ordinal(left, right);
}
