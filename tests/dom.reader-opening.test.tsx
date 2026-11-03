import {beforeEach,describe,it,expect,vi} from 'vitest';
const native=vi.hoisted(()=>({connected:true,notify:vi.fn()}));
vi.mock('../src/android/bridge',()=>({hasAndroidRenderer:()=>native.connected,androidNotify:native.notify}));
import {beginReaderOpening,cancelReaderOpening,readerOpeningCurrent} from '../src/android/readerOpening';
beforeEach(()=>{cancelReaderOpening();native.connected=true;native.notify.mockClear();vi.spyOn(window,'matchMedia').mockReturnValue({matches:false} as MediaQueryList);});
describe('mobile reader opening ownership',()=>{
 it('starts feedback synchronously and reuses the same intent during preparation',()=>{const a=beginReaderOpening('/book.cbz'),b=beginReaderOpening('/book.cbz');expect(a).toBe(b);expect(native.notify).toHaveBeenCalledTimes(1);expect(native.notify.mock.calls[0][0]).toBe('readerIntent');expect(readerOpeningCurrent(a)).toBe(true);});
 it('never sends a cover image as a reader entry placeholder',()=>{beginReaderOpening('/book.cbz');expect(native.notify.mock.calls[0][1]).toEqual({key:'/book.cbz'});});
 it('invalidates a cancelled preparation and prevents its cleanup closing a new open of the same book',()=>{const old=beginReaderOpening('/book.cbz');cancelReaderOpening();const current=beginReaderOpening('/book.cbz');cancelReaderOpening('/book.cbz',old);expect(readerOpeningCurrent(old)).toBe(false);expect(readerOpeningCurrent(current)).toBe(true);});
 it('does not close a newer comic when an older open fails',()=>{beginReaderOpening('/one.cbz');const latest=beginReaderOpening('/two.pdf');cancelReaderOpening('/one.cbz');expect(readerOpeningCurrent(latest)).toBe(true);});
 it('leaves desktop opening unchanged',()=>{native.connected=false;expect(beginReaderOpening('/book.cbz')).toBeUndefined();expect(native.notify).not.toHaveBeenCalled();});
 it('honors reduced motion without starting a cover animation',()=>{vi.mocked(window.matchMedia).mockReturnValue({matches:true} as MediaQueryList);expect(beginReaderOpening('/book.cbz')).toBeUndefined();expect(native.notify).not.toHaveBeenCalled();});
});
