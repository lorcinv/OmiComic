import { expect, it, vi } from 'vitest';
it('retains positions within the session and ignores old persisted positions on a new launch', async () => {
  localStorage.setItem('omi-view-memory-v1', JSON.stringify([['list:folder', {index:30,fraction:.5}]]));
  vi.resetModules();
  let memory = await import('../src/library/viewMemory');
  expect(memory.readViewMemory('list:folder')).toBeUndefined();
  memory.saveViewMemory('list:folder', {index:55,fraction:.25});
  memory.saveViewMemory('navigation:mobile:bookshelf', {view:'virtual-folder',folderId:'s20'});
  window.dispatchEvent(new Event('omi-app-pause'));
  expect(memory.readViewMemory('list:folder')).toEqual({index:55,fraction:.25});
  expect((await import('../src/library/viewMemory')).readViewMemory('navigation:mobile:bookshelf')).toEqual({view:'virtual-folder',folderId:'s20'});
  vi.resetModules();
  memory = await import('../src/library/viewMemory');
  expect(memory.readViewMemory('list:folder')).toBeUndefined();
  expect(memory.readViewMemory('navigation:mobile:bookshelf')).toBeUndefined();
});
