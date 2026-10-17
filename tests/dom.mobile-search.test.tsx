import { describe, it, expect } from 'vitest';
import { matchesMobileSearch } from '../src/library/mobileSearch';
describe('unified mobile library search', () => {
  const texts = ['Blue Moon Vol. 12','/comics/Blue Moon','A quiet story'];
  const tags = ['artist:Alice','科幻','full color'];
  it.each([
    ['moon 科幻',true], ['moon -科幻',false], ['"blue moon" tag:"full color"',true],
    ['moon,科幻,quiet',true],['科幻，"full color"',true],['moon，missing',false],['name:moon，note:quiet，tag:科幻',true],['"blue,moon",科幻',false],
    ['name:Moon artist:alice$',true],['name:quiet',false],['tag:full$',false],
    ['tag:"full color"$',true],['missing | 科幻',true],['missing moon',false],['',true],
  ])('matches %s', (query,expected) => expect(matchesMobileSearch(query,texts,tags)).toBe(expected));
  it('uses comma alternatives in fuzzy mode and requires every comma condition in exact mode',()=>{
    expect(matchesMobileSearch('missing，科幻,quiet',texts,tags,'fuzzy')).toBe(true);
    expect(matchesMobileSearch('missing，科幻,quiet',texts,tags,'exact')).toBe(false);
    expect(matchesMobileSearch('name:moon，tag:科幻，note:quiet',texts,tags,'exact')).toBe(true);
    expect(matchesMobileSearch('"missing,科幻"',texts,tags,'fuzzy')).toBe(false);
  });
});
