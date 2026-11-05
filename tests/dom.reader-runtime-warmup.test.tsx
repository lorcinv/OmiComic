import {beforeEach,expect,it,vi} from 'vitest';

const runtime=vi.hoisted(()=>({native:false,load:vi.fn(),warm:vi.fn()}));
vi.mock('../src/android/bridge',()=>({hasAndroidRenderer:()=>runtime.native}));
vi.mock('../src/reader/loadPdfRuntime',()=>({loadPdfRuntime:runtime.load}));
vi.mock('../src/pages/ReaderPage',()=>({default:()=>null}));
import {warmReader} from '../src/reader/loadReader';
import {getResourceThumbnail} from '../src/reader/thumbnailClient';
beforeEach(()=>{runtime.native=false;runtime.load.mockReset().mockResolvedValue({warmPdfWorker:runtime.warm});runtime.warm.mockReset();});

it('native Android PDF entry does not start a second PDF parser/worker',async()=>{
  runtime.native=true;warmReader('pdf');await Promise.resolve();
  expect(runtime.load).not.toHaveBeenCalled();expect(runtime.warm).not.toHaveBeenCalled();
});
it('desktop PDF entry still warms its parsing worker',async()=>{
  warmReader('pdf');await Promise.resolve();
  expect(runtime.load).toHaveBeenCalledOnce();expect(runtime.warm).toHaveBeenCalledOnce();
});
it('other formats do not warm PDF.js',async()=>{
  warmReader('mobi');warmReader('epub');warmReader();await Promise.resolve();
  expect(runtime.load).not.toHaveBeenCalled();
});
it('a ready native PDF cover never starts the webpage PDF runtime',async()=>{
  const result={ok:true as const,data:{url:'data:image/jpeg;base64,ready',pdfPath:'/native.pdf',itemCount:12}};
  window.omicomic={getThumbnail:vi.fn().mockResolvedValue(result)} as any;
  expect(await getResourceThumbnail({path:'/native.pdf',type:'pdf'})).toEqual(result);
  await Promise.resolve();expect(runtime.load).not.toHaveBeenCalled();
});
