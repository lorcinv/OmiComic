import { expect, it } from 'vitest';
import type { NativeCall } from '../src/android/bridge';
import { flushViewMemory, initializeNativeViewMemory, readViewMemory, saveViewMemory } from '../src/library/viewMemory';

it('migrates browser records and restores the last navigation from native storage even when browser storage is lost', async () => {
  let disk: any = null;
  const native: NativeCall = async (method, args: any) => {
    if (method === 'loadViewMemory') return structuredClone(disk);
    if (method === 'saveViewMemory') disk = structuredClone(args);
    return null as any;
  };
  localStorage.setItem('omi-view-memory-v1', JSON.stringify([['list:folder', {index:30,fraction:.5}]]));
  await initializeNativeViewMemory(native);
  expect(readViewMemory('list:folder')).toEqual({index:30,fraction:.5});
  saveViewMemory('list:folder', {index:55,fraction:.25});
  saveViewMemory('navigation:mobile:bookshelf', {view:'virtual-folder',folderId:'s20'});
  await flushViewMemory();
  localStorage.clear();
  await initializeNativeViewMemory(native);
  expect(readViewMemory('list:folder')).toEqual({index:55,fraction:.25});
  expect(readViewMemory('navigation:mobile:bookshelf')).toEqual({view:'virtual-folder',folderId:'s20'});
});
