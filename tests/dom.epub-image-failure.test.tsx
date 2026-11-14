import {afterEach,expect,it,vi} from 'vitest';
import {sanitizeAndroidChapter} from '../src/android/epub';
import type {NativeCall} from '../src/android/bridge';
import {installMock} from './mock';

vi.mock('../src/reader/androidChapterLayout',async()=>{
  const actual=await vi.importActual<any>('../src/reader/androidChapterLayout');
  return{...actual,paginateChapter:async(html:string)=>({pages:[html],previews:['']})};
});
const payload=(html:string)=>JSON.stringify({path:'/book.epub',entry:'OPS/page.xhtml',html});
const unavailable:NativeCall=async()=>{throw Error('private provider path and raw error');};
afterEach(()=>{delete document.documentElement.dataset.platform;vi.restoreAllMocks();});

it.each(['','<p>1</p>','<p>第 2 页</p>','<p>Page 3</p>'])('reports a lost picture even with page label %s',async label=>{
  await expect(sanitizeAndroidChapter(payload('<img src="page.jpg">'+label),unavailable)).rejects.toThrow('本页图片读取失败，请重试。');
});

it('reports an unsupported image file instead of producing an empty successful chapter',async()=>{
  const native=vi.fn(async()=>null) as NativeCall;
  await expect(sanitizeAndroidChapter(payload('<img src="page.svg">'),native)).rejects.toThrow('本页使用的 EPUB 图片格式暂不支持。');
});

it('reports vector-only SVG pages without allowing executable SVG through',async()=>{
  const native=vi.fn() as NativeCall;
  await expect(sanitizeAndroidChapter(payload('<svg><script>evil()</script><path d="M0 0h20v20z"/></svg>'),native)).rejects.toThrow('本页使用的 EPUB 图片格式暂不支持。');
  expect(native).not.toHaveBeenCalled();
});

it('keeps the supported SVG raster wrapper and its dimensions',async()=>{
  const native=vi.fn(async()=>({url:'https://omi.local/media/page',width:800,height:1200})) as NativeCall;
  const result=await sanitizeAndroidChapter(payload('<svg xmlns="http://www.w3.org/2000/svg"><image href="page.jpg"/><script>evil()</script></svg>'),native);
  const doc=new DOMParser().parseFromString(result,'text/html');
  expect(doc.images).toHaveLength(1);expect(doc.images[0].getAttribute('width')).toBe('800');
  expect(doc.querySelector('svg,script')).toBeNull();
});

it('preserves readable mixed content if a decorative image fails',async()=>{
  const result=await sanitizeAndroidChapter(payload('<h1>正文</h1><p>这一段仍然可以阅读。</p><img src="decoration.jpg">'),unavailable);
  expect(result).toContain('这一段仍然可以阅读。');
});

it('preserves intentionally blank EPUB pages',async()=>{
  const result=await sanitizeAndroidChapter(payload('<div></div>'),unavailable);
  expect(new DOMParser().parseFromString(result,'text/html').body.textContent).toBe('');
});

it('never fetches an external picture even when it is the entire page',async()=>{
  const native=vi.fn() as NativeCall;
  await expect(sanitizeAndroidChapter(payload('<img src="https://example.com/page.jpg">'),native)).rejects.toThrow('本页使用的 EPUB 图片格式暂不支持。');
  expect(native).not.toHaveBeenCalled();
});

it('keeps a failed first Android EPUB page addressable and retries without cached empty content',async()=>{
  installMock({count:2});document.documentElement.dataset.platform='android';
  const {DocumentSource}=await import('../src/reader/documentSource');
  window.omicomic.openDocument=vi.fn(async()=>({ok:true,data:{size:100,chapters:[{index:0,name:'First'},{index:1,name:'Second'}]}}));
  let failed=true;
  const read=window.omicomic.readDocumentChapter=vi.fn(async(_id,index)=>{
    if(index===0&&failed)return{ok:false as const,error:{code:'READ_FAILED',message:'本页图片读取失败，请重试。'}};
    return{ok:true as const,data:`<html><body><p>${index===0?'Recovered':'Second page'}</p></body></html>`};
  });
  const source=new DocumentSource({key:'epub:/book',resourceKey:'epub:/book',sourcePath:'/book.epub',sourceType:'epub',title:'Book',pages:[],total:0});
  try{
    const opened=await source.open();expect(opened.total).toBe(2);expect(opened.pages[0].pageId).toBe('epub-chapter:0');
    await expect(source.readPage(0)).rejects.toThrow('本页图片读取失败');
    expect((await source.readPage(1)).html).toContain('Second page');
    failed=false;expect((await source.readPage(0)).html).toContain('Recovered');
    expect(read.mock.calls.filter(([,index])=>index===0)).toHaveLength(3);
  }finally{source.dispose();}
});

it('preserves desktop document-open error behavior',async()=>{
  installMock({count:1});
  const {DocumentSource}=await import('../src/reader/documentSource');
  window.omicomic.openDocument=vi.fn(async()=>({ok:true,data:{size:100,chapters:[{index:0,name:'First'}]}}));
  window.omicomic.readDocumentChapter=vi.fn(async()=>({ok:false,error:{code:'READ_FAILED',message:'Existing error'}}));
  const source=new DocumentSource({key:'epub:/desktop',resourceKey:'epub:/desktop',sourcePath:'/desktop.epub',sourceType:'epub',title:'Book',pages:[],total:0});
  try{await expect(source.open()).rejects.toThrow('Existing error');}finally{source.dispose();}
});
