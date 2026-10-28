type Mode = 'fuzzy' | 'exact';
type Fields = { texts: Array<string | undefined | null>; tags: string[] };
const normalized = new Map<string, string>(), queries = new Map<string, ReturnType<typeof compile>>();
let characters = 0, head = 0, keys: string[] = [];
let latest: { query: string; mode: Mode; splitSpaces: boolean; compiled: ReturnType<typeof compile> } | undefined;
const metrics = { compiled: 0, normalized: 0 };
export const searchMetrics = metrics;
function norm(value: string) {
  const cached = normalized.get(value); if (cached !== undefined) return cached;
  const result = value.normalize('NFKC').toLocaleLowerCase('zh-CN'); metrics.normalized++;
  normalized.set(value, result); characters += value.length + result.length;
  keys.push(value);
  while (characters > 8_000_000 && normalized.size > 1) {
    const first = keys[head++]; characters -= first.length + normalized.get(first)!.length; normalized.delete(first);
  }
  if (head > 4096 && head * 2 > keys.length) { keys = keys.slice(head); head = 0; }
  return result;
}
function compile(query: string, mode: Mode, splitSpaces: boolean) {
  metrics.compiled++;
  const tokens: string[] = []; let token = '', quoted = false;
  const flush = () => { if (token.trim()) tokens.push(token.trim()); token = ''; };
  for (const character of query) {
    if (character === '"') { quoted = !quoted; token += character; }
    else if (!quoted && /[,，|]/.test(character)) { flush(); tokens.push(character); }
    else if (!quoted && splitSpaces && /\s/.test(character)) flush();
    else token += character;
  }
  flush();
  const groups: string[][] = [[]];
  for (const token of tokens) {
    if (token === '|' || mode === 'fuzzy' && /^[,，]$/.test(token)) groups.push([]);
    else if (token !== ',' && token !== '，') groups.at(-1)!.push(token);
  }
  const alternatives = groups.filter(group => group.length).map(group => group.map(raw => {
    const exclude = raw.startsWith('-'); let text = norm(exclude ? raw.slice(1) : raw).replaceAll('"', '');
    const exact = text.endsWith('$'); if (exact) text = text.slice(0, -1);
    const empty = !text;
    let field: 'tag' | 'title' | 'note' | 'all' = 'all';
    if (/^(tag|标签):/.test(text)) { field = 'tag'; text = text.replace(/^(tag|标签):/, ''); }
    else if (/^(title|name|名称):/.test(text)) { field = 'title'; text = text.replace(/^(title|name|名称):/, ''); }
    else if (/^(note|备注):/.test(text)) { field = 'note'; text = text.replace(/^(note|备注):/, ''); }
    return { exclude, exact, text, field, empty };
  }));
  return { active: tokens.length > 0, matches(fields: Fields) {
    if (!tokens.length) return true;
    return alternatives.some(group => group.every(term => {
      if (term.empty) return true;
      const match = (value: string) => term.exact ? value === term.text : value.includes(term.text);
      const matchRaw = (value: string | null | undefined) => match(norm(value ?? ''));
      const found = term.field === 'tag' ? fields.tags.some(matchRaw) : term.field === 'title' ? matchRaw(fields.texts[0])
        : term.field === 'note' ? fields.texts.slice(1).some(matchRaw) : fields.texts.some(matchRaw) || fields.tags.some(matchRaw);
      return term.exclude ? !found : found;
    }));
  }};
}
export function compileMobileSearch(query: string, mode: Mode = 'exact', splitSpaces = false) {
  if (latest?.query === query && latest.mode === mode && latest.splitSpaces === splitSpaces) return latest.compiled;
  const key = JSON.stringify([query, mode, splitSpaces]);
  let result = queries.get(key);
  if (!result) { result = compile(query, mode, splitSpaces); queries.set(key, result); if (queries.size > 32) queries.delete(queries.keys().next().value!); }
  latest = { query, mode, splitSpaces, compiled: result };
  return result;
}
export function matchesMobileSearch(query: string, texts: Array<string | undefined | null>, tags: string[], mode: Mode = 'exact', splitSpaces = false): boolean {
  // Ordinary browsing must not normalize even one field.
  if (!query.trim()) return true;
  const compiled = compileMobileSearch(query, mode, splitSpaces);
  return compiled.matches({ texts, tags });
}
