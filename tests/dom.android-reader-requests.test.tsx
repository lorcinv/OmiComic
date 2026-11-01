import {beforeEach,expect,it,vi} from 'vitest';
const native=vi.hoisted(()=>vi.fn());
vi.mock('../src/android/bridge',()=>({androidCall:native}));
import {prepareNativeReaderPage} from '../src/android/readerRequests';
beforeEach(()=>{native.mockReset();});

it('retries a cancelled native window with the current seek and returns its clear page',async()=>{
  let seek=1;native.mockImplementationOnce(async()=>{seek=2;throw new DOMException('old window','AbortError');}).mockResolvedValueOnce({url:'clear-page'});
  expect(await prepareNativeReaderPage(()=>({seek}))).toEqual({url:'clear-page'});
  expect(native.mock.calls.map(call=>call[1].seek)).toEqual([1,2]);
});
it('preserves real image failures and never retries them as navigation',async()=>{
  native.mockRejectedValue(new Error('corrupt PNG'));await expect(prepareNativeReaderPage(()=>({}))).rejects.toThrow('corrupt PNG');expect(native).toHaveBeenCalledTimes(1);
});
it('bounds cancellation retries and releases an aborted consumer without waiting for native I/O',async()=>{
  native.mockRejectedValue(new DOMException('old window','AbortError'));
  await expect(prepareNativeReaderPage(()=>({}))).rejects.toMatchObject({name:'AbortError'});expect(native).toHaveBeenCalledTimes(3);
  native.mockReset().mockImplementation(()=>new Promise(()=>{}));const controller=new AbortController(),task=prepareNativeReaderPage(()=>({}),controller.signal);
  await Promise.resolve();controller.abort();await expect(task).rejects.toMatchObject({name:'AbortError'});expect(native).toHaveBeenCalledTimes(1);
});
