import { describe,it,expect } from 'vitest';
import { createAndroidApi } from '../src/android/data';
import { getMobileDisplay,patchMobileDisplay,mobileDisplayScope } from '../src/library/mobileDisplay';
import type { NativeCall } from '../src/android/bridge';

describe('independent mobile display settings',()=>{
  it('migrates old settings once and retains each page through a native storage restart',async()=>{
    let stored:any={settings:{mobileLibraryLayout:'list',mobileGridColumns:3,mobileListCoverSize:100}};
    const native:NativeCall=async(method,args:any)=>{if(method==='loadData')return structuredClone(stored);if(method==='saveData')stored=structuredClone(args.data);return null as any;};
    let api=await createAndroidApi(native),data=await api.getAppData();if(!data.ok)throw new Error('data');
    await api.updateSettings(patchMobileDisplay(data.data.settings,'bookshelf',{layout:'grid',columns:4}));
    api=await createAndroidApi(native);data=await api.getAppData();if(!data.ok)throw new Error('data');
    expect(getMobileDisplay(data.data.settings,'directory')).toEqual({layout:'list',columns:3,coverSize:100});
    expect(getMobileDisplay(data.data.settings,mobileDisplayScope('virtual-folder'))).toEqual({layout:'grid',columns:4,coverSize:100});
    expect(getMobileDisplay(data.data.settings,'recent').layout).toBe('list');
    await api.updateSettings(patchMobileDisplay(data.data.settings,'favorites',{layout:'grid',coverSize:72}));
    data=await api.getAppData();if(!data.ok)throw new Error('data');
    expect(getMobileDisplay(data.data.settings,'bookshelf').columns).toBe(4);
    expect(getMobileDisplay(data.data.settings,'favorites')).toEqual({layout:'grid',columns:3,coverSize:72});
    expect(getMobileDisplay(data.data.settings,'bookmarks').coverSize).toBe(100);
  });
});
