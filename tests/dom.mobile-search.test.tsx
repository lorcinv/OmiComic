import { describe, it, expect } from 'vitest';
import { matchesMobileSearch, searchMetrics } from '../src/library/mobileSearch';
describe('unified mobile library search', () => {
  it('empty browse performs zero normalization and each repeated query is compiled once', () => {
    const before = { ...searchMetrics };
    for (let index=0;index<10000;index++) expect(matchesMobileSearch('', ['长路径'.repeat(20)], [])).toBe(true);
    expect(searchMetrics.normalized).toBe(before.normalized);expect(searchMetrics.compiled).toBe(before.compiled);
    for (let index=0;index<1000;index++) matchesMobileSearch('unique-probe-1142', ['some name'], []);
    expect(searchMetrics.compiled-before.compiled).toBe(1);
  });
  const texts = ['Blue Moon Vol. 12','A quiet story'];
  const tags = ['artist:Alice','科幻','full color'];
  it('finds long Unicode names and literal colons without treating them only as tags', () => {
    const title = '[煌野一人] ' + '长标题與空格 '.repeat(35) + '番外：特别篇 (3).zip';
    const path = 'F:/漫画/' + '深层目录/'.repeat(40) + title;
    expect(matchesMobileSearch(title, [title], [])).toBe(true);
    expect(matchesMobileSearch('番外：特别篇', [title], [])).toBe(true);
    expect(matchesMobileSearch(path, [title], [])).toBe(false);
    expect(matchesMobileSearch('artist:alice', texts, tags)).toBe(true);
    expect(matchesMobileSearch('tag:missing', [title], [])).toBe(false);
  });
  it.each([
    ['moon 科幻',true], ['moon -科幻',false], ['"blue moon" tag:"full color"',true],
    ['moon,科幻,quiet',true],['科幻，"full color"',true],['moon，missing',false],['name:moon，note:quiet，tag:科幻',true],['"blue,moon",科幻',false],
    ['name:Moon artist:alice$',true],['name:quiet',false],['tag:full$',false],
    ['tag:"full color"$',true],['missing | 科幻',true],['missing moon',false],['',true],
  ])('matches %s', (query,expected) => expect(matchesMobileSearch(query,texts,tags,'exact',true)).toBe(expected));
  it('keeps spaces literal by default and requires every word only when enabled', () => {
    expect(matchesMobileSearch('moon 科幻',texts,tags)).toBe(false);
    expect(matchesMobileSearch('blue moon',texts,tags)).toBe(true);
    expect(matchesMobileSearch('moon 科幻',texts,tags,'exact',true)).toBe(true);
    expect(matchesMobileSearch('name:blue moon,tag:科幻',texts,tags,'exact')).toBe(true);
    expect(matchesMobileSearch('tag:"full color"$',texts,tags)).toBe(true);
    expect(matchesMobileSearch('missing | 科幻',texts,tags)).toBe(true);
    expect(matchesMobileSearch('moon,-科幻',texts,tags,'exact')).toBe(false);
  });
  it('uses comma alternatives in fuzzy mode and requires every comma condition in exact mode',()=>{
    expect(matchesMobileSearch('missing，科幻,quiet',texts,tags,'fuzzy')).toBe(true);
    expect(matchesMobileSearch('missing，科幻,quiet',texts,tags,'exact')).toBe(false);
    expect(matchesMobileSearch('name:moon，tag:科幻，note:quiet',texts,tags,'exact')).toBe(true);
    expect(matchesMobileSearch('"missing,科幻"',texts,tags,'fuzzy')).toBe(false);
  });
});
