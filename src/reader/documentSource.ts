import type { PDFDocumentLoadingTask, PDFDataRangeTransport, PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import type { 阅读资源结果 } from "../types";
import {hasAndroidRenderer} from '../android/bridge';
import {prepareNativeReaderPage,readerRequestCancelled} from '../android/readerRequests';
import { isAndroid } from '../platform';
import { displaySamplingMoving } from './displaySampling';
import { needsCompatiblePdf } from '../android/webviewCapabilities';
import { loadPdfRuntime } from './loadPdfRuntime';
import { androidChapterPresentation, countAndroidTextPages, paginateChapter, type ChapterPages, TEXT_PAGE_WIDTH, TEXT_PAGE_HEIGHT } from './androidChapterLayout';

export interface DocumentPage {
  url: string;
  width: number;
  height: number;
  html?: string;
  decodedBytes?: number;
  canvas?: HTMLCanvasElement;
  decodedImage?: HTMLImageElement;
  native?: boolean;
}

const preparedDocuments=new Map<string,DocumentSource>();
const foregroundDocuments=new Set<DocumentSource>();

/** Supplies pages to the normal reader's foreground queue and bounded cache. */
export class DocumentSource {
  private readonly id = crypto.randomUUID();
  private references=1;
  static async acquirePrepared(resource:阅读资源结果,startIndex=0){
    const source=preparedDocuments.get(resource.resourceKey);
    if(!source||source.closed||source.purpose!=='thumbnail'||!source.openedResource)return;
    source.references++;source.purpose='reader';foregroundDocuments.add(source);void window.omicomic.setDocumentPurpose?.(source.id,'reader').catch(()=>undefined);
    const id=resource.requestedPageId??(resource.readerInit?.progress?.currentPageIndex===startIndex?resource.readerInit.progress.currentPageId:undefined),chapter=/^epub-(?:chapter|text):(\d+)/.exec(id??'');
    try{if(chapter&&source.documentPages)await source.layoutChapter(Number(chapter[1]));}catch(error){source.releaseReader();throw error;}
    source.openedResource.readerInit=resource.readerInit;source.openedResource.requestedPageId=resource.requestedPageId;
    return{source,resource:source.openedResource};
  }
  releaseReader(){foregroundDocuments.delete(this);if(this.references>1){this.purpose='thumbnail';void window.omicomic.setDocumentPurpose?.(this.id,'thumbnail').catch(()=>undefined);}this.dispose();}

  private readonly abortController = new AbortController();
  private loading?: PDFDocumentLoadingTask;
  private pdf?: PDFDocumentProxy;
  private transport?: PDFDataRangeTransport;
  private renders = new Set<RenderTask>();
  private parsedPages = new Map<number, PDFPageProxy>();
  private pageUsers = new Map<number, number>();
  private previewQueue = Promise.resolve();
  private previewCache = new Map<number|string, string>();
  private previewListeners = new Map<number|string, Set<(url: string) => void>>();
  private bodySurfaces = new Map<number|string, WeakRef<HTMLCanvasElement>>();
  private foregroundRenders = 0;
  private closed = false;
  private failure?: Error;
  private mobi?: import('./mobiClient').MobiClient;
  private compatibilityPdf = false;
  private nativePdf=false;
  get nativePdfEnabled(){return this.nativePdf;}
  private pdfSize=0;
  private pdfFallback?:Promise<void>;
  private documentPages?: {chapter:number;slice:number;image:boolean;name:string}[];
  private chapterNames:{name:string;index:number;fixedLayout?:boolean}[]=[];
  private chapterLayouts=new Map<number,ChapterPages>();
  private chapterImages=new Map<number,ReturnType<typeof androidChapterPresentation>>();
  private chapterCounts=new Map<number,number>();
  private layoutPending=new Map<number,Promise<void>>();
  private openedResource?:阅读资源结果;
  private listeners=new Set<(change:{from:number;before:阅读资源结果['pages']})=>void>();
  private indexing=false;
  private indexingTimer?:ReturnType<typeof setTimeout>;
  private readerSession?:number;
  private nativeFitAxis?:'width'|'height';
  setReaderSession(session:number,fitAxis?:'width'|'height'){this.readerSession=session;this.nativeFitAxis=fitAxis;}
  subscribe(listener:(change:{from:number;before:阅读资源结果['pages']})=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  private rebuildPages(){
    const resource=this.openedResource,before=resource?.pages??[];
    this.documentPages=this.chapterNames.flatMap(chapter=>Array.from({length:this.chapterCounts.get(chapter.index)??1},(_,slice)=>({chapter:chapter.index,slice,image:!!chapter.fixedLayout,name:(this.chapterCounts.get(chapter.index)??1)>1?`${chapter.name} · ${slice+1}/${this.chapterCounts.get(chapter.index)}`:chapter.name})));
    if(!resource)return;
    resource.pages=this.documentPages.map((page,index)=>({index,name:page.name,pageId:page.slice===0?`epub-chapter:${page.chapter}`:`epub-text:${page.chapter}:${page.slice}`,sourcePath:resource.sourcePath,type:'epub-chapter'}));
    resource.total=resource.pages.length;resource.documentIndexing=this.chapterCounts.size<this.chapterNames.length;
    let from=0;while(from<before.length&&from<resource.pages.length&&before[from].pageId===resource.pages[from].pageId)from++;
    for(const listener of this.listeners)listener({from,before});
  }
  private async layoutChapter(index:number){
    const saved=this.chapterLayouts.get(index);if(saved){this.chapterLayouts.delete(index);this.chapterLayouts.set(index,saved);return;}
    const existing=this.layoutPending.get(index);if(existing)return existing;
    const task=(async()=>{
      const html=await this.chapter(index),image=androidChapterPresentation(html),tiles=image.image&&image.width&&image.height&&image.height>image.width*3?Math.ceil(image.height/(image.width*1.5)):0,layout=tiles?{pages:Array.from({length:tiles},()=>html),previews:Array.from({length:tiles},()=>'')}:image.image?{pages:[html],previews:['']}:await paginateChapter(html,this.abortController.signal,image);this.assertOpen();
      if(image.image)this.chapterImages.set(index,image);
      this.chapterLayouts.set(index,layout);const changed=(this.chapterCounts.get(index)??1)!==layout.pages.length;this.chapterCounts.set(index,layout.pages.length);
      let bytes=[...this.chapterLayouts.values()].reduce((sum,item)=>sum+(item.bytes?.()??item.pages.reduce((n,p)=>n+p.length*2,0)),0);
      for(const [key,item] of this.chapterLayouts){if(bytes<=8*1024*1024)break;if(key===index)continue;const size=item.bytes?.()??item.pages.reduce((n,p)=>n+p.length*2,0);this.chapterLayouts.delete(key);this.chapterImages.delete(key);item.dispose?.();bytes-=size;}
      if(changed)this.rebuildPages();
      else if(this.openedResource?.documentIndexing&&this.chapterCounts.size===this.chapterNames.length){this.openedResource.documentIndexing=false;for(const listener of this.listeners)listener({from:this.openedResource.pages.length,before:this.openedResource.pages});}
    })();this.layoutPending.set(index,task);try{await task;}finally{this.layoutPending.delete(index);}
  }
  startIndexing(){
    if(this.indexing||!this.documentPages||this.closed)return;this.indexing=true;
    const next=async()=>{
      if(this.closed)return;
      if(document.hidden||displaySamplingMoving()||this.foregroundRenders>0||this.purpose==='thumbnail'&&foregroundDocuments.size>0){this.indexingTimer=setTimeout(()=>void next(),120);return;}
      const chapter=this.chapterNames.find(item=>!this.chapterCounts.has(item.index));
      if(!chapter)return;
      try{await this.layoutChapter(chapter.index);}catch{if(!this.closed){this.chapterCounts.set(chapter.index,1);this.rebuildPages();}}
      if(!this.closed)this.indexingTimer=setTimeout(()=>void next(),60);
    };
    this.indexingTimer=setTimeout(()=>void next(),300);
  }
  private chapterHTML=new Map<number,string>();
  private chapterPending=new Map<number,Promise<string>>();
  private bodyImages=new Map<number|string,WeakRef<HTMLImageElement>>();
  private imagePending=new Map<string,Promise<HTMLImageElement>>();
  private async chapter(index:number):Promise<string> {
    const saved=this.chapterHTML.get(index);
    if(saved){this.chapterHTML.delete(index);this.chapterHTML.set(index,saved);return saved;}
    const pending=this.chapterPending.get(index);if(pending)return pending;
    const task=(async()=>{
      const result=this.mobi?{ok:true as const,data:await this.mobi.chapter(index)}:await window.omicomic.readDocumentChapter(this.id,index);
      this.assertOpen();if(!result.ok)throw Error(result.error.message);
      this.chapterHTML.set(index,result.data);
      let bytes=[...this.chapterHTML.values()].reduce((n,html)=>n+html.length*2,0);
      for(const [key,html] of this.chapterHTML){if(bytes<=8*1024*1024&&this.chapterHTML.size<=8)break;this.chapterHTML.delete(key);bytes-=html.length*2;}
      return result.data;
    })();
    this.chapterPending.set(index,task);
    try{return await task;}finally{this.chapterPending.delete(index);}
  }
  private async imageTile(page:ReturnType<typeof androidChapterPresentation>|undefined,chapter:number,slice:number,preview:boolean,signal:AbortSignal,prefetch:boolean|(()=>boolean)=false):Promise<DocumentPage|undefined>{
    if(!page?.image||!page.width||!page.height||page.height<=page.width*3)return;
    const count=Math.ceil(page.height/(page.width*1.5));if(this.chapterCounts.get(chapter)!==count){this.chapterCounts.set(chapter,count);this.rebuildPages();}
    const pitch=Math.ceil(page.width*1.5),top=slice*pitch,height=Math.min(pitch,page.height-top);if(height<=0)throw Error('图片分页无效。');
    if(page.image.startsWith('https://omi.local/')&&window.omicomic.renderDocumentImage){const result=await window.omicomic.renderDocumentImage(page.image,slice,preview);if(!result.ok)throw Error(result.error.message);if(!preview&&this.readerSession!==undefined&&hasAndroidRenderer())return this.nativePage(result.data.url,signal,JSON.stringify([this.resource.resourceKey,`${chapter}:${slice}`]),prefetch);const image=await this.image(result.data.url);signal.throwIfAborted();return{...result.data,decodedImage:image,decodedBytes:image.naturalWidth*image.naturalHeight*4};}
    const response=await fetch(page.image,{signal}),blob=await response.blob();signal.throwIfAborted();
    const target=preview?360:Math.min(page.width,2048),bitmap=await createImageBitmap(blob,0,top,page.width,height,{resizeWidth:target,resizeHeight:Math.max(1,Math.round(height*target/page.width))});
    try{signal.throwIfAborted();const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d')!.drawImage(bitmap,0,0);return{url:`epub-tile:${this.id}:${chapter}:${slice}`,canvas,width:page.width,height,decodedBytes:canvas.width*canvas.height*4};}finally{bitmap.close();}
  }
  private async image(url:string):Promise<HTMLImageElement> {
    const existing=this.imagePending.get(url);if(existing)return existing;
    const task=(async()=>{const image=new Image(),signal=this.abortController.signal,abort=()=>{image.src='';};signal.addEventListener('abort',abort,{once:true});try{signal.throwIfAborted();image.src=url;await image.decode();this.assertOpen();return image;}finally{signal.removeEventListener('abort',abort);}})();
    this.imagePending.set(url,task);
    try{return await task;}finally{this.imagePending.delete(url);}
  }
  nativeWorkKey(index:number){return JSON.stringify([this.resource.resourceKey,this.pageCacheKey(index)]);}
  private nativePage(url:string,signal:AbortSignal,workKey:string,prefetch:boolean|(()=>boolean)){
    return prepareNativeReaderPage<DocumentPage>(()=>({url,session:this.readerSession,workKey,prefetch:typeof prefetch==='function'?prefetch():prefetch,width:Math.round(innerWidth*devicePixelRatio),height:Math.round(innerHeight*devicePixelRatio)}),signal);
  }

  constructor(private readonly resource: 阅读资源结果, private purpose: "reader" | "thumbnail" = "reader", private readonly startIndex=0) {}

  private assertOpen() {
    if (this.failure) throw this.failure;
    if (this.closed) throw new Error("文档已关闭。");
  }

  async open(): Promise<阅读资源结果> {
    const type = this.resource.sourceType;
    if (type !== "pdf" && type !== "epub" && type !== 'mobi') throw new Error("文档格式无效。");
    this.assertOpen();
    if(this.purpose==='reader')foregroundDocuments.add(this);
    this.compatibilityPdf = type === 'pdf' && isAndroid() && needsCompatiblePdf;
    // EPUB needs only the native chapter service. Load the PDF runtime alongside
    // the native file open, so PDF reads gain no extra serial loading step.
    const [opened, pdfRuntime] = await Promise.all([
      window.omicomic.openDocument({ path: this.resource.sourcePath, type, id: this.id, purpose: this.purpose }).then(async opened => {
        // A slow native open can finish after dispose already sent close. Close
        // again on completion so Android cannot retain that cancelled session.
        if (this.closed) void window.omicomic.closeDocument(this.id).catch(() => undefined);
        this.assertOpen();
        let initialData = new Uint8Array();
        if (type === 'pdf' && opened.ok && !opened.data.nativePdf && opened.data.size > 0) {
          const initial = await window.omicomic.readDocumentRange(this.id, 0, Math.min(opened.data.size, 256 * 1024));
          this.assertOpen();
          if (!initial.ok) throw new Error(initial.error.message);
          initialData = new Uint8Array(initial.data);
        }
        return { result: opened, initialData };
      }),
      type === "pdf" && !hasAndroidRenderer() ? loadPdfRuntime() : undefined,
    ]);
    this.assertOpen();
    if (!opened.result.ok) throw new Error(opened.result.error.message);
    let chapters = opened.result.data.chapters;
    if(type==='mobi'){
      const {MobiClient}=await import('./mobiClient');this.assertOpen();this.mobi=new MobiClient(hasAndroidRenderer()&&window.omicomic.registerDocumentImage?async data=>{const result=await window.omicomic.registerDocumentImage!(this.id,data);if(!result.ok)throw Error(result.error.message);return result.data;}:undefined);
      chapters=await this.mobi.open(opened.result.data.size,async(begin,end)=>{const result=await window.omicomic.readDocumentRange(this.id,begin,end);this.assertOpen();if(!result.ok)throw Error(result.error.message);return new Uint8Array(result.data);},this.abortController.signal,opened.result.data.recordSignatures);
    }
    if(type!=='pdf'){
      this.chapterNames=chapters;
      for(const chapter of chapters)if(chapter.fixedLayout)this.chapterCounts.set(chapter.index,1);
      this.rebuildPages();
      const savedId=this.resource.requestedPageId??(this.resource.readerInit?.progress?.currentPageIndex===this.startIndex?this.resource.readerInit.progress.currentPageId:undefined);
      const saved=/^epub-(?:chapter|text):(\d+)/.exec(savedId??'');
      const chapter=Math.min(chapters.length-1,saved?Number(saved[1]):Math.max(0,Math.min(this.startIndex,chapters.length-1)));
      if(chapter>=0)await this.layoutChapter(chapter);
      chapters=this.documentPages!.map((page,index)=>({index,name:page.name}));
    }
    this.pdfSize=opened.result.data.size;
    this.nativePdf=type==='pdf'&&!!opened.result.data.nativePdf&&!!window.omicomic.renderDocumentPage;
    if(type==='pdf'&&!this.nativePdf)chapters=await this.initializePdf(this.pdfSize,opened.initialData,pdfRuntime??await loadPdfRuntime());
    this.assertOpen();
    if (!chapters.length) throw new Error("文档没有可阅读内容。");
    this.openedResource = {
      ...this.resource, documentPaginated:type!=='pdf', documentIndexing:type!=='pdf'&&this.chapterCounts.size<this.chapterNames.length, total: chapters.length,
      pages: chapters.map(({ name }, index) => ({ index, name, pageId: this.documentPages ? (this.documentPages[index].slice===0 ? `epub-chapter:${this.documentPages[index].chapter}` : `epub-text:${this.documentPages[index].chapter}:${this.documentPages[index].slice}`) : undefined, sourcePath: this.resource.sourcePath, type: type === "pdf" ? "pdf-page" : "epub-chapter" })),
    };
    if(this.purpose==='thumbnail')preparedDocuments.set(this.resource.resourceKey,this);
    return this.openedResource;
  }

  private async initializePdf(size:number,initialData:Uint8Array,pdfRuntime:Awaited<ReturnType<typeof loadPdfRuntime>>){
      const { getDocument, PDFDataRangeTransport, getSharedPdfWorker } = pdfRuntime;
      const source = this;
      class Ranges extends PDFDataRangeTransport {
        private queue = Promise.resolve();
        requestDataRange(begin: number, end: number) {
          this.queue = this.queue.then(async () => {
            source.assertOpen();
            if (end - begin > 32 * 1024 * 1024) throw new Error("PDF 单次请求超过安全上限，文件可能已损坏。");
            const bytes = new Uint8Array(end - begin);
            for (let offset = begin; offset < end; offset += 1024 * 1024) {
              source.assertOpen();
              const result = await window.omicomic.readDocumentRange(source.id, offset, Math.min(end, offset + 1024 * 1024));
              source.assertOpen();
              if (!result.ok) throw new Error(result.error.message);
              bytes.set(new Uint8Array(result.data), offset - begin);
            }
            this.onDataRange(begin, bytes);
          }).catch(reason => {
            if (source.closed) return;
            source.failure = reason instanceof Error ? reason : new Error("PDF 读取失败。");
            source.dispose();
          });
        }
      }
      this.transport = new Ranges(size, initialData, true);
      this.loading = getDocument({
        worker:getSharedPdfWorker(),
        range: this.transport,
        cMapUrl: new URL(this.compatibilityPdf ? 'pdfjs-compat/cmaps/' : "pdfjs/cmaps/", document.baseURI).href, cMapPacked: true,
        standardFontDataUrl: new URL(this.compatibilityPdf ? 'pdfjs-compat/standard_fonts/' : "pdfjs/standard_fonts/", document.baseURI).href,
        wasmUrl: new URL("pdfjs/wasm/", document.baseURI).href,
        iccUrl: new URL("pdfjs/iccs/", document.baseURI).href,
        rangeChunkSize: 256 * 1024, disableStream: true, disableAutoFetch: true,
        useSystemFonts: true, maxImageSize: 16_000_000, stopAtErrors: true,
      });
      this.pdf = await this.loading.promise;
      return Array.from({ length: this.pdf.numPages }, (_, index) => ({ index, name: `第 ${index + 1} 页` }));
  }
  private async fallbackPdf(){
    if(this.pdf)return;if(this.pdfFallback)return this.pdfFallback;
    this.pdfFallback=(async()=>{const result=await window.omicomic.readDocumentRange(this.id,0,Math.min(this.pdfSize,256*1024));if(!result.ok)throw Error(result.error.message);await this.initializePdf(this.pdfSize,new Uint8Array(result.data),await loadPdfRuntime());})();
    return this.pdfFallback;
  }

  readPage(index: number, requestSignal?: AbortSignal,prefetch:boolean|(()=>boolean)=false): Promise<DocumentPage> {
    if(this.purpose!=='thumbnail'&&!(typeof prefetch==='function'?prefetch():prefetch))this.mobi?.focus(this.documentPages?.[index]?.chapter??index);
    this.foregroundRenders++;return this.renderPage(index, requestSignal, this.purpose === 'thumbnail',undefined,prefetch).finally(()=>this.foregroundRenders--);
  }

  private pageCacheKey(index:number){const page=this.documentPages?.[index];return page?`${page.chapter}:${page.slice}`:index;}
  private readyPreview(index: number|string): string | undefined {
    const saved = this.previewCache.get(index);
    if (saved) { this.previewCache.delete(index); this.previewCache.set(index, saved); return saved; }
    const body = this.bodySurfaces.get(index)?.deref() ?? this.bodyImages.get(index)?.deref();
    if (!body?.width || !body.height) return;
    const canvas = document.createElement('canvas'), scale = Math.min(1, 360 / Math.max(body.width, body.height));
    canvas.width = Math.max(1, Math.round(body.width * scale)); canvas.height = Math.max(1, Math.round(body.height * scale));
    try {
      canvas.getContext('2d')!.drawImage(body, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/jpeg', .8);
      this.previewCache.set(index, url);
      while (this.previewCache.size > 32) this.previewCache.delete(this.previewCache.keys().next().value!);
      return url;
    } finally { canvas.width = canvas.height = 0; }
  }

  async readPreview(index: number, requestSignal?: AbortSignal): Promise<string> {
    requestSignal?.throwIfAborted();
    this.assertOpen();
    const key=this.pageCacheKey(index),planned=this.documentPages?.[index];
    const saved = this.readyPreview(key);
    if (saved) return saved;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, this.abortController.signal, ...(requestSignal ? [requestSignal] : [])]);
    let publish!: (url: string) => void, cancel!: () => void;
    const published = new Promise<string>((resolve, reject) => {
      publish = resolve; cancel = () => reject(signal.reason);
      signal.addEventListener('abort', cancel, { once: true });
    });
    const listeners = this.previewListeners.get(key) ?? new Set();
    listeners.add(publish); this.previewListeners.set(key, listeners);
    // Tiny previews share the open PDF and its parsed pages. They never create
    // another document, retain body-size rasters, or fill the foreground queue.
    const result = this.previewQueue.then(async () => {
      const previewDeadline=isAndroid()?performance.now()+48:Infinity;
      while (this.foregroundRenders > 0 && !this.bodySurfaces.get(key)?.deref()?.width) {
        signal.throwIfAborted(); this.assertOpen();
        await new Promise(resolve => setTimeout(resolve, 16));
        if(performance.now()>=previewDeadline)break;
      }
      signal.throwIfAborted(); this.assertOpen();
      const existing = this.readyPreview(key);
      if (existing) return existing;
      if(planned){
        if(this.mobi&&this.chapterNames[planned.chapter]?.fixedLayout){const preview=await this.mobi.preview(planned.chapter);signal.throwIfAborted();if(preview){this.previewCache.set(key,preview);while(this.previewCache.size>32)this.previewCache.delete(this.previewCache.keys().next().value!);return preview;}}
        await this.layoutChapter(planned.chapter);
        const html=this.chapterLayouts.get(planned.chapter)?.pages[planned.slice]??await this.chapter(planned.chapter);
        const tile=await this.imageTile(this.chapterImages.get(planned.chapter),planned.chapter,planned.slice,true,signal);
        const {chapterPreview}=await import('./chapterPreview'),canvas=tile?.canvas??(tile?.decodedImage?await chapterPreview(`<html><body><img src="${tile.url}"></body></html>`,signal):await chapterPreview(html,signal));
        try{const url=canvas.toDataURL('image/jpeg',.8);this.previewCache.set(key,url);while(this.previewCache.size>32)this.previewCache.delete(this.previewCache.keys().next().value!);return url;}finally{canvas.width=canvas.height=0;}
      }
      const page = await this.renderPage(index, signal, true, planned);
      if (!page.canvas && page.decodedImage) {
        this.bodyImages.set(key,new WeakRef(page.decodedImage));
        const saved=this.readyPreview(key);if(saved)return saved;
      }
      if (!page.canvas && page.html) {
        const { chapterPreview } = await import('./chapterPreview');
        page.canvas = await chapterPreview(page.html, signal);
      }
      if (!page.canvas) throw new Error('当前文档不支持页面缩略图。');
      try {
        const url = page.canvas.toDataURL('image/jpeg', .8);
        this.previewCache.set(key, url);
        while (this.previewCache.size > 32) this.previewCache.delete(this.previewCache.keys().next().value!);
        return url;
      } finally { page.canvas.width = page.canvas.height = 0; }
    });
    this.previewQueue = result.then(() => undefined, () => undefined);
    try { return await Promise.race([result, published]); }
    finally {
      listeners.delete(publish); if (!listeners.size) this.previewListeners.delete(key);
      signal.removeEventListener('abort', cancel); controller.abort();
    }
  }

  private async renderPage(index: number, requestSignal: AbortSignal | undefined, thumbnail: boolean, plannedPage?:{chapter:number;slice:number;image:boolean;name:string},prefetch:boolean|(()=>boolean)=false): Promise<DocumentPage> {
    const signal = requestSignal ? AbortSignal.any([requestSignal, this.abortController.signal]) : this.abortController.signal;
    signal.throwIfAborted();
    this.assertOpen();
    const workKey=this.nativeWorkKey(index);
    if(this.nativePdf){
      try{
        const result=await window.omicomic.renderDocumentPage!(this.id,index,thumbnail,thumbnail?undefined:this.nativeFitAxis);if(!result.ok)throw Error(result.error.message);
        if(!thumbnail&&this.readerSession!==undefined&&hasAndroidRenderer()){
          return await this.nativePage(result.data.url,signal,workKey,prefetch);
        }
        const cacheKey=index,saved=this.bodyImages.get(cacheKey)?.deref(),image=saved?.src===result.data.url?saved:await this.image(result.data.url);signal.throwIfAborted();
        this.bodyImages.set(cacheKey,new WeakRef(image));while(this.bodyImages.size>32)this.bodyImages.delete(this.bodyImages.keys().next().value!);
        return{url:result.data.url,width:result.data.width||image.naturalWidth,height:result.data.height||image.naturalHeight,decodedImage:image,decodedBytes:image.naturalWidth*image.naturalHeight*4};
      }catch(error){signal.throwIfAborted();this.assertOpen();if(readerRequestCancelled(error))throw error;this.nativePdf=false;await this.fallbackPdf();}
    }
    if (!this.pdf) {
      const planned=plannedPage??this.documentPages?.[index];
      if(planned)await this.layoutChapter(planned.chapter);
      const input=planned&&!this.chapterNames[planned.chapter]?.fixedLayout?this.chapterLayouts.get(planned.chapter)?.pages[planned.slice]??await this.chapter(planned.chapter):await this.chapter(planned?.chapter??index);
      signal.throwIfAborted();this.assertOpen();
      if(planned){
        const presentation=this.chapterImages.get(planned.chapter);
        const tile=await this.imageTile(presentation,planned.chapter,planned.slice,thumbnail,signal,prefetch);if(tile)return tile;
        const page=presentation??{html:input,image:undefined};
        if(page.image){
          // Picture books share the archive reader's bounded native surfaces,
          // including already prepared neighbours and original zoom regions.
          if(!thumbnail&&this.readerSession!==undefined&&hasAndroidRenderer()&&page.image.startsWith('https://omi.local/')){
            return await this.nativePage(page.image,signal,workKey,prefetch);
          }
          const cacheKey=`${planned.chapter}:${planned.slice}`,saved=this.bodyImages.get(cacheKey)?.deref();
          const image=saved?.src===page.image?saved:await this.image(page.image);
          signal.throwIfAborted();
          this.bodyImages.delete(cacheKey);this.bodyImages.set(cacheKey,new WeakRef(image));
          while(this.bodyImages.size>32)this.bodyImages.delete(this.bodyImages.keys().next().value!);
          return {url:page.image,width:image.naturalWidth,height:image.naturalHeight,decodedImage:image,decodedBytes:image.naturalWidth*image.naturalHeight*4};
        }
        return {url:`epub:${this.id}:${index}`,html:page.html,width:TEXT_PAGE_WIDTH,height:TEXT_PAGE_HEIGHT};
      }
      const page = await measureChapter(input, signal);
      this.assertOpen();
      return { ...page, url: `epub:${this.id}:${index}` };
    }
    if (!thumbnail) this.foregroundRenders++;
    let page: PDFPageProxy;
    try { page = await this.pdf.getPage(index + 1); }
    catch (error) { if (!thumbnail) this.foregroundRenders--; throw error; }
    this.parsedPages.delete(index); this.parsedPages.set(index, page);
    this.pageUsers.set(index, (this.pageUsers.get(index) ?? 0) + 1);
    const canvas = document.createElement("canvas");
    let task: RenderTask | undefined;
    let continuation = 0;
    let retained = false;
    const cancel = () => task?.cancel();
    try {
      signal.throwIfAborted();
      this.assertOpen();
      const native = page.getViewport({ scale: 1 });
      const scale = thumbnail ? Math.min(1, 360 / Math.max(native.width, native.height)) : Math.min(
        Math.max(1.5, Math.max(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2) / Math.max(native.width, native.height)),
        Math.sqrt(16_000_000 / (native.width * native.height)), 4096 / Math.max(native.width, native.height),
      );
      const view = page.getViewport({ scale });
      canvas.width = Math.ceil(view.width); canvas.height = Math.ceil(view.height);
      task = page.render({ canvas, canvasContext: this.compatibilityPdf ? canvas.getContext('2d')! : undefined, viewport: view });
      if (isAndroid() && this.purpose === 'reader') {
        // pdf.js executes drawing on the WebView thread. Leave a frame between
        // drawing slices during a drag/settle, so input and page motion run first.
        // Cold opening keeps the normal, immediate rendering schedule.
        task.onContinue = (resume: () => void) => {
          if (!displaySamplingMoving()) { resume(); return; }
          continuation = window.setTimeout(() => { continuation = 0; if (!signal.aborted && !this.closed) resume(); }, 16);
        };
      }
      this.renders.add(task);
      signal.addEventListener("abort", cancel, { once: true });
      await task.promise;
      signal.throwIfAborted();
      this.assertOpen();
      // Display the rendered surface directly: no synchronous PNG encoding,
      // base64 copy, or second image decode on the scroll thread.
      retained = true;
      if (!thumbnail) {
        this.bodySurfaces.delete(index); this.bodySurfaces.set(index, new WeakRef(canvas));
        while (this.bodySurfaces.size > 32) this.bodySurfaces.delete(this.bodySurfaces.keys().next().value!);
        const listeners = this.previewListeners.get(index);
        if (listeners?.size) {
          const preview = this.readyPreview(index);
          if (preview) for (const publish of listeners) publish(preview);
        }
      }
      return { url: `pdf:${this.id}:${index}`, canvas, width: native.width, height: native.height, decodedBytes: canvas.width * canvas.height * 4 };
    } finally {
      if (continuation) clearTimeout(continuation);
      signal.removeEventListener("abort", cancel);
      if (task) this.renders.delete(task);
      if (!retained) canvas.width = canvas.height = 0;
      if (!thumbnail) this.foregroundRenders--;
      const users = (this.pageUsers.get(index) ?? 1) - 1;
      if (users) this.pageUsers.set(index, users); else this.pageUsers.delete(index);
      // A bounded nearby parse window avoids parsing the same page again for
      // a page turn or preview, without retaining every visited PDF page.
      for (const [key, parsed] of this.parsedPages) {
        if (this.parsedPages.size <= (isAndroid() ? 6 : 4)) break;
        if (this.pageUsers.has(key)) continue;
        parsed.cleanup(); this.parsedPages.delete(key);
      }
    }
  }

  dispose() {
    if (this.closed) return;
    if(this.references>1){this.references--;return;}
    this.closed = true;foregroundDocuments.delete(this);if(preparedDocuments.get(this.resource.resourceKey)===this)preparedDocuments.delete(this.resource.resourceKey);
    this.abortController.abort();
    this.mobi?.close();
    for (const task of this.renders) task.cancel();
    this.renders.clear();
    this.previewCache.clear(); this.previewListeners.clear(); this.parsedPages.clear(); this.bodySurfaces.clear();
    clearTimeout(this.indexingTimer);this.listeners.clear();for(const layout of this.chapterLayouts.values())layout.dispose?.();this.chapterLayouts.clear();this.layoutPending.clear();
    this.chapterHTML.clear();this.chapterPending.clear();this.chapterImages.clear();this.bodyImages.clear();this.imagePending.clear();
    this.transport?.abort();
    void this.loading?.destroy().catch(() => undefined);
    void window.omicomic.closeDocument(this.id).catch(() => undefined);
  }
}

export function chapterPresentation(input:string) {
  const document=new DOMParser().parseFromString(input,'text/html');
  const pageLabel=/^(?:第\s*\d+\s*[页頁]|page\s*\d+|\d+)$/i;
  const text=document.body.textContent?.trim()??'';
  const imagePage=document.images.length>0&&(!text||document.images.length===1&&pageLabel.test(text));
  if(imagePage){
    document.body.dataset.omiImagePage='true';
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let node:Node|null;while((node=walker.nextNode()))if(pageLabel.test(node.textContent?.trim()??''))node.textContent='';
  }
  const css=imagePage
    ? 'html,body{background:transparent!important;margin:0!important;padding:0!important;min-height:0!important;overflow:hidden}body{box-sizing:border-box;width:900px;max-width:none!important}body :is(div,p,h1,h2,h3,h4){margin:0;padding:0}img{display:block;width:100%;max-width:100%;height:auto;margin:0}'
    : 'html{overflow:hidden}body{box-sizing:border-box;width:900px;max-width:none;margin:0;padding:36px 42px;overflow-wrap:anywhere}img{display:block;max-width:100%;height:auto;margin:auto}table{table-layout:fixed;width:100%;overflow-wrap:anywhere}';
  const style=document.createElement('style');style.textContent=css;document.head.append(style);
  return {imagePage,html:'<!doctype html>'+document.documentElement.outerHTML};
}
/** Measure inert, sanitized EPUB content once, so the shared stage owns all scrolling. */
function measureChapter(input: string, signal: AbortSignal): Promise<Omit<DocumentPage, "url">> {
  const width = 900;
  const {html,imagePage}=chapterPresentation(input);
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    // Scripts remain disabled. Same-origin access is needed only to measure the
    // worker-sanitized document; its restrictive CSP also blocks remote content.
    frame.sandbox.add("allow-same-origin");
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:1px;visibility:hidden;border:0;pointer-events:none`;
    let finished = false;
    const cleanup = () => { window.clearTimeout(timer); signal.removeEventListener("abort", abort); frame.remove(); };
    const fail = (error: Error) => { if (finished) return; finished = true; cleanup(); reject(error); };
    const abort = () => fail(new Error("文档已关闭。"));
    const timer = window.setTimeout(() => fail(new Error("章节排版超时，请重新打开。")), 15000);
    signal.addEventListener("abort", abort, { once: true });
    frame.onload = () => {
      void (async () => {
        const content = frame.contentDocument;
        if (!content) throw new Error("章节排版失败。");
        await Promise.all(Array.from(content.images, image => image.decode().catch(() => undefined)));
        await content.fonts.ready;
        if (finished) return;
        const height = Math.max(imagePage?1:1200, content.documentElement.scrollHeight, content.body.scrollHeight);
        finished = true; cleanup(); resolve({ html, width, height });
      })().catch(reason => fail(reason instanceof Error ? reason : new Error("章节排版失败。")));
    };
    if (signal.aborted) { abort(); return; }
    frame.srcdoc = html;
    document.body.append(frame);
  });
}
