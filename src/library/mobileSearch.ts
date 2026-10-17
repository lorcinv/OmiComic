// Unified local search: words are AND, | is OR; quotes group a phrase,
// - excludes a term and $ requests an exact tag match.
export function matchesMobileSearch(query: string, texts: Array<string | undefined | null>, tags: string[], mode:'fuzzy'|'exact'='exact'): boolean {
  const norm = (value: string) => value.normalize('NFKC').toLocaleLowerCase('zh-CN');
  const haystack = texts.map(text => norm(text ?? ''));
  const labels = tags.map(norm);
  // Commas outside quotes delimit alternatives in fuzzy mode, requirements in
  // exact mode. A phrase can still contain commas when quoted.
  const tokens = query.match(/(?:[^\s",，|]*"[^"]*"[^\s,，|]*|[^\s,，|]+|[|,，])/g) ?? [];
  if (!tokens.length) return true;
  const groups: string[][] = [[]];
  for (const token of tokens) { if (token === '|' || (mode==='fuzzy' && /[,，]/.test(token) && token.length===1)) groups.push([]); else if(token!==','&&token!=='，')groups.at(-1)!.push(token); }
  return groups.filter(group => group.length).some(group => group.every(raw => {
    const exclude = raw.startsWith('-');
    let token = norm(exclude ? raw.slice(1) : raw).replaceAll('"', '');
    const exact = token.endsWith('$');
    if (exact) token = token.slice(0, -1);
    const match = (value: string, term: string) => exact ? value === term : value.includes(term);
    let found: boolean;
    if (/^(tag|标签):/.test(token)) found = labels.some(value => match(value, token.replace(/^(tag|标签):/, '')));
    else if (/^(title|name|名称):/.test(token)) found = match(haystack[0] ?? '', token.replace(/^(title|name|名称):/, ''));
    else if (/^(note|备注):/.test(token)) found = haystack.slice(1).some(value => match(value, token.replace(/^(note|备注):/, '')));
    else if (token.includes(':')) found = labels.some(value => match(value, token));
    else found = haystack.some(value => match(value, token)) || labels.some(value => match(value, token));
    return exclude ? !found : found;
  }));
}
