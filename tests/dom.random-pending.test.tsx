import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useRandomBrowse } from '../src/hooks/useRandomBrowse';
import { useLibraryQueryResult } from '../src/hooks/useLibraryQuery';

it('keeps the drawn books through a replacement query partial, then removes authoritative deletions', () => {
  const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array: any) => { array[0] = 0; return array; });
  try {
    const { result } = renderHook(() => useRandomBrowse('directory:/pending', 3));
    act(() => result.current.toggle());
    const items = ['a', 'b', 'c', 'd', 'e'];
    const first = result.current.select(items, key => key);
    expect(first).toEqual(['a', 'b', 'c']);
    expect(result.current.select([], key => key, false)).toEqual(first);
    expect(result.current.select(['d', 'e'], key => key, false)).toEqual(first);
    expect(result.current.select([...items].reverse(), key => key, true)).toEqual(first);
    const removed = result.current.select(['b', 'c', 'd', 'e'], key => key, true);
    expect(removed.slice(0, 2)).toEqual(['b', 'c']);
    expect(removed).toHaveLength(3);
    expect(removed).not.toContain('a');
  } finally { random.mockRestore(); }
});

it('does not redraw when a sliced query replaces its candidate snapshot', async () => {
  const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array: any) => { array[0] = 0; return array; });
  let clock = 0; const time = vi.spyOn(performance, 'now').mockImplementation(() => clock += 6);
  const items = Array.from({ length: 768 }, (_, i) => `book-${i}`), predicate = () => true, compare = () => 0;
  const observations: Array<{ complete: boolean; candidates: string[]; selected: string[] }> = [];
  const view = renderHook(({ items }) => {
    const query = useLibraryQueryResult(items, predicate, compare, 'same-filter');
    const browse = useRandomBrowse('directory:/query', 3);
    const selected = browse.select(query.items, key => key, query.complete);
    if (browse.active) observations.push({ complete: query.complete, candidates: query.items, selected });
    return { browse, query, selected };
  }, { initialProps: { items } });
  try {
    await waitFor(() => expect(view.result.current.query.complete).toBe(true), { timeout: 5000 });
    act(() => view.result.current.browse.toggle());
    const first = view.result.current.selected;
    expect(first).toEqual(items.slice(0, 3));
    view.rerender({ items: [...items].reverse() });
    expect(view.result.current.query.complete).toBe(false);
    await waitFor(() => expect(view.result.current.query.complete).toBe(true), { timeout: 5000 });
    expect(observations.some(o => !o.complete && o.candidates.length > 0 && !o.candidates.includes(first[0]))).toBe(true);
    expect(observations.every(o => JSON.stringify(o.selected) === JSON.stringify(first))).toBe(true);
  } finally { view.unmount(); random.mockRestore(); time.mockRestore(); }
});
