import {expect,it} from 'vitest';
import {nativePanoramaWindow,nativeReaderBodyCapacity} from '../src/android/readerWindow';
it('a three-body cache retains two upcoming pages before a hidden previous page, in either direction',()=>{
  const indices=Array.from({length:20},(_,index)=>index);
  expect(nativePanoramaWindow(indices,8,1).keep.slice(0,3)).toEqual([8,9,10]);
  expect(nativePanoramaWindow(indices,8,-1).keep.slice(0,3)).toEqual([8,7,6]);
  expect(nativePanoramaWindow(indices,8,-1).focus).toEqual([8,7,6]);
});
it('matches the native 48-key bound and does not request nonexistent neighbours at either book end',()=>{
  expect(nativePanoramaWindow(Array.from({length:100},(_,i)=>i),3,1).keep).toHaveLength(48);
  expect(nativePanoramaWindow([0,1,2,2],0,-1).focus).toEqual([0]);
  expect(nativePanoramaWindow([0,1,2,2],2,1).focus).toEqual([2]);
});
it('refreshes the native window when read-ahead grows without changing the current page',()=>{
  expect(nativePanoramaWindow([4,5,6],4,1).key).not.toEqual(nativePanoramaWindow([4,5,6,7,8],4,1).key);
});
it('does not retain a whole color book when only three full bodies fit in memory',()=>{
  expect(nativePanoramaWindow(Array.from({length:24},(_,i)=>i),19,1,3).keep).toEqual([19,20,21,18,17]);
});
it('uses real bitmap allocation to give ordinary pages more lead than large color bodies',()=>{
  expect(nativeReaderBodyCapacity(100*1024*1024,[{native:true,decodedBytes:8640000}])).toBe(12);
  expect(nativeReaderBodyCapacity(100*1024*1024,[{native:true,decodedBytes:30720000}])).toBe(3);
});
