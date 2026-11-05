import {afterEach,expect,it,vi} from 'vitest';
import {installMock} from './mock';
const native=vi.hoisted(()=>({prepare:vi.fn(async(args:()=>any)=>({url:args().url,width:1600,height:2400,decodedBytes:1600*2400*4,native:true}))}));
vi.mock('../src/android/bridge',()=>({hasAndroidRenderer:()=>true}));
vi.mock('../src/android/readerRequests',()=>({prepareNativeReaderPage:native.prepare,readerRequestCancelled:(error:any)=>error?.name==='AbortError'}));
afterEach(()=>{vi.restoreAllMocks();vi.clearAllMocks();vi.resetModules();});
async function setup(type:'pdf'|'epub'){
  installMock({count:1});const {DocumentSource}=await import('../src/reader/documentSource');const path='/native.'+type;
  const source=new DocumentSource({key:type+':'+path,resourceKey:type+':'+path,sourceType:type,sourcePath:path,title:'Native',pages:[],total:0});source.setReaderSession(88);return source;
}
it('PDF body enters the native surface without a WebView image decode',async()=>{
  const source=await setup('pdf');window.omicomic.openDocument=vi.fn(async()=>({ok:true,data:{nativePdf:true,size:4000,chapters:[{index:0,name:'One'}]}}));
  window.omicomic.renderDocumentPage=vi.fn(async()=>({ok:true,data:{url:'https://omi.local/media/pdf',width:400,height:600}}));
  const image=vi.spyOn(window,'Image').mockImplementation(()=>{throw Error('Body must stay native');});
  try{await source.open();const page=await source.readPage(0);expect(page.native).toBe(true);expect(image).not.toHaveBeenCalled();expect(native.prepare.mock.calls[0][0]()).toMatchObject({session:88,workKey:source.nativeWorkKey(0),prefetch:false});}finally{source.dispose();}
});
it('picture-book pages reuse parsed image metadata and preserve background priority',async()=>{
  const source=await setup('epub');window.omicomic.openDocument=vi.fn(async()=>({ok:true,data:{size:4000,chapters:[{index:0,name:'One',fixedLayout:true}]}}));
  const html='<html><body><img src="https://omi.local/media/picture" width="1600" height="2400"></body></html>';
  window.omicomic.readDocumentChapter=vi.fn(async()=>({ok:true,data:html}));const parser=vi.spyOn(DOMParser.prototype,'parseFromString');
  try{await source.open();await source.readPage(0,undefined,true);await source.readPage(0);expect(parser.mock.calls.filter(([input])=>input===html)).toHaveLength(1);expect(native.prepare.mock.calls[0][0]()).toMatchObject({prefetch:true});expect(native.prepare.mock.calls[1][0]()).toMatchObject({prefetch:false});}finally{source.dispose();}
});
it('a cancelled native PDF job does not start a second PDF engine',async()=>{
  const source=await setup('pdf');window.omicomic.openDocument=vi.fn(async()=>({ok:true,data:{nativePdf:true,size:4000,chapters:[{index:0,name:'One'}]}}));window.omicomic.renderDocumentPage=vi.fn(async()=>({ok:true,data:{url:'https://omi.local/media/pdf',width:400,height:600}}));window.omicomic.readDocumentRange=vi.fn();
  native.prepare.mockRejectedValueOnce(new DOMException('Navigation changed','AbortError'));
  try{await source.open();await expect(source.readPage(0)).rejects.toMatchObject({name:'AbortError'});expect(window.omicomic.readDocumentRange).not.toHaveBeenCalled();}finally{source.dispose();}
});
