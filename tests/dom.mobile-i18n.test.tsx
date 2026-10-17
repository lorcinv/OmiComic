import { afterEach, describe, expect, it } from 'vitest';
import { messages } from '../src/i18n/messages';
import { normalizeLanguage, setUiLanguage, t, tr, uiOptions } from '../src/i18n';

afterEach(() => setUiLanguage('zh-CN'));
describe('mobile UI language boundaries', () => {
  it('translates UI templates while preserving interpolated filenames and tags verbatim', () => {
    setUiLanguage('en');
    expect(tr`选择 ${'设置 $& {0}'}`).toBe('Select 设置 $& {0}');
    expect(tr`移除标签：${'删除'}`).toBe('Remove tag: 删除');
    expect(t(' 50 项')).toBe(' 50 items');
    const options=[{value:'grid',label:'网格'}];
    expect(uiOptions(options)).toEqual([{value:'grid',label:'Grid'}]);
    expect(options[0].label).toBe('网格');
    setUiLanguage('ja');
    expect(tr`选择 ${'设置'}`).toBe('设置 を選択');
    expect(t('页面排序')).toBe('ページの並び順');
  });
  it('keeps Chinese as the migration default and preserves every template slot in both languages', () => {
    expect(normalizeLanguage(undefined)).toBe('zh-CN');
    expect(normalizeLanguage('unknown')).toBe('zh-CN');
    expect(t('设置')).toBe('设置');
    const slots=(value:string)=>[...value.matchAll(/\{\d+\}/g)].map(match=>match[0]).sort();
    for(const [key,values] of Object.entries(messages)) for(const value of values){expect(value.length,key).toBeGreaterThan(0);expect(slots(value),key).toEqual(slots(key));}
  });
});
