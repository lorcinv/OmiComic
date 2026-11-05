import { displaySamplingMoving } from './displaySampling';

/** Stable, viewport-sized text pages. CSS columns break at line boundaries. */
export const TEXT_PAGE_WIDTH=900, TEXT_PAGE_HEIGHT=1200;
export function androidChapterPresentation(input:string, page=0) {
  const doc=new DOMParser().parseFromString(input,'text/html');
  const text=(doc.body.textContent??'').trim();
  const imagePage=doc.images.length===1 && (!text || /^(?:第\s*\d+\s*[页頁]|page\s*\d+|\d+)$/i.test(text));
  if(imagePage)return {image:doc.images[0].getAttribute('src')!,preview:doc.images[0].getAttribute('data-omi-preview')??undefined,width:Number(doc.images[0].getAttribute('width'))||undefined,height:Number(doc.images[0].getAttribute('height'))||undefined,html:input};
  const flow=doc.createElement('div');flow.className='omi-text-flow';
  while(doc.body.firstChild)flow.append(doc.body.firstChild);
  doc.body.append(flow);
  const css=doc.createElement('style');
  css.textContent=`html,body{box-sizing:border-box!important;width:900px!important;height:1200px!important;min-height:0!important;max-width:none!important;margin:0!important;overflow:hidden!important}body{padding:36px 42px!important;font:20px/1.85 sans-serif;overflow-wrap:anywhere}.omi-text-flow{width:816px;height:1128px;column-width:816px;column-gap:84px;column-fill:auto;transform:translateX(${-page*900}px)}.omi-text-flow img{max-width:100%;max-height:1000px;object-fit:contain;height:auto;break-inside:avoid}.omi-text-flow p{orphans:2;widows:2}.omi-text-flow table{max-width:100%;table-layout:fixed;overflow-wrap:anywhere}h1,h2,h3,h4,h5,h6{break-after:avoid}`;
  doc.head.append(css);
  return {html:'<!doctype html>'+doc.documentElement.outerHTML};
}
export function countAndroidTextPages(html:string,signal:AbortSignal):Promise<number> {
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe');frame.sandbox.add('allow-same-origin');
    frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
    frame.style.cssText='position:fixed;left:-10000px;top:0;width:900px;height:1200px;visibility:hidden;border:0;pointer-events:none';
    let settled=false;
    const done=(error?:unknown,count?:number)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);frame.remove();error?reject(error):resolve(count!);};
    const abort=()=>done(signal.reason);
    const timer=setTimeout(()=>done(Error('文字分页超时，请重新打开。')),15000);
    signal.addEventListener('abort',abort,{once:true});
    frame.onload=()=>{void(async()=>{const content=frame.contentDocument;if(!content)throw Error('文字分页失败。');await Promise.all([...content.images].map(image=>image.decode().catch(()=>undefined)));await content.fonts.ready;signal.throwIfAborted();const flow=content.querySelector<HTMLElement>('.omi-text-flow');if(!flow)throw Error('文字分页失败。');const count=Math.max(1,Math.ceil((flow.scrollWidth+84)/900));if(count>5000)throw Error('章节页数过多。');done(undefined,count);})().catch(done);};
    frame.srcdoc=html;document.body.append(frame);
  });
}

export interface ChapterPages {pages:string[];previews:string[];bytes?:()=>number;dispose?:()=>void}
/** Paginate one chapter once; visible pages keep only their own DOM fragment. */
export async function paginateChapter(input:string,signal:AbortSignal,presentation:ReturnType<typeof androidChapterPresentation>=androidChapterPresentation(input)):Promise<ChapterPages>{
  if(presentation.image)return{pages:[input],previews:['']};
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const frame=document.createElement('iframe');frame.sandbox.add('allow-same-origin');frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');
    frame.style.cssText='position:fixed;left:-10000px;top:0;width:900px;height:1200px;visibility:hidden;border:0;pointer-events:none';
    let finished=false;
    const done=(error?:unknown,value?:ChapterPages)=>{if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',abort);frame.remove();error?reject(error):resolve(value!);};
    let deadline=performance.now()+15000;
    const timeout=()=>done(Error('文字分页超时。'));
    const abort=()=>done(signal.reason);let timer=setTimeout(timeout,15000);signal.addEventListener('abort',abort,{once:true});
    const yieldForInput=async()=>{
      signal.throwIfAborted();
      // Measurement belongs to the UI thread, even inside a hidden iframe.
      // Give input/rendering a task boundary and do not resume during a drag.
      // Waiting for the user's gesture does not consume the layout timeout.
      const pausedAt=performance.now();clearTimeout(timer);
      try{
        await new Promise<void>(resolve=>setTimeout(resolve,0));
        while(displaySamplingMoving()){signal.throwIfAborted();await new Promise<void>(resolve=>setTimeout(resolve,32));}
      }finally{
        deadline+=performance.now()-pausedAt;
        if(!finished)timer=setTimeout(timeout,Math.max(0,deadline-performance.now()));
      }
      signal.throwIfAborted();
    };
    frame.onload=()=>{void(async()=>{
      const doc=frame.contentDocument;if(!doc)throw Error('文字分页失败。');
      await Promise.all([...doc.images].filter(image=>!image.width||!image.height).map(image=>image.decode().catch(()=>undefined)));await doc.fonts.ready;signal.throwIfAborted();
      if(displaySamplingMoving())await yieldForInput();
      const flow=doc.querySelector<HTMLElement>('.omi-text-flow')!,base=flow.getBoundingClientRect(),count=Math.max(1,Math.ceil((flow.scrollWidth+84)/900));if(count>5000)throw Error('章节页数过多。');
      type Point={node:Node;offset:number;top:number};const starts=new Map<number,Point>();
      const column=(x:number)=>Math.max(0,Math.floor((x-base.left+.5)/900));
      let yieldAt=performance.now()+4;
      const walker=doc.createTreeWalker(flow,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);let node:Node|null;
      while((node=walker.nextNode())){
        if(performance.now()>=yieldAt){await yieldForInput();yieldAt=performance.now()+4;}
        if(node.nodeType===Node.TEXT_NODE){
          const text=node.textContent??'';if(!text.trim())continue;const range=doc.createRange();range.selectNodeContents(node);const rects=[...range.getClientRects()].filter(r=>r.width&&r.height);if(!rects.length)continue;
          const first=column(rects[0].left),last=column(rects.at(-1)!.left);
          for(let col=first;col<=last;col++)if(!starts.has(col)){
            if(performance.now()>=yieldAt){await yieldForInput();yieldAt=performance.now()+4;}
            let a=0,b=text.length;while(a<b){const mid=(a+b)>>>1;range.setStart(node,mid);range.setEnd(node,mid+1);if(column(range.getBoundingClientRect().left)<col)a=mid+1;else b=mid;}
            if(a===text.length)continue;range.setStart(node,a);range.setEnd(node,a+1);const r=range.getBoundingClientRect(),style=getComputedStyle(node.parentElement!),line=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.85;
            starts.set(col,{node,offset:a,top:Math.max(0,r.top-(line-r.height)/2)});
          }
        }else if(node.nodeType===1&&(node as Element).localName==='img'){const r=(node as Element).getBoundingClientRect(),col=column(r.left);if(!starts.has(col)&&node.parentNode)starts.set(col,{node:node.parentNode,offset:[...node.parentNode.childNodes].indexOf(node as ChildNode),top:r.top});}
      }
      const points=[...starts.entries()].sort((a,b)=>a[0]-b[0]);
      if(!points.length){done(undefined,{pages:[presentation.html],previews:['']});return;}
      const pageCache=new Map<number,string>(),previewCache=new Map<number,string>();
      const makePage=(n:number)=>{
        const cached=pageCache.get(n);if(cached)return cached;
        signal.throwIfAborted();const [col,start]=points[n],end=points[n+1]?.[1],range=doc.createRange();
        if(n===0)range.setStart(flow,0);else range.setStart(start.node,start.offset);
        if(end)range.setEnd(end.node,end.offset);else range.setEnd(flow,flow.childNodes.length);
        const content=range.cloneContents();let ancestor=range.commonAncestorContainer.nodeType===Node.TEXT_NODE?range.commonAncestorContainer.parentElement:range.commonAncestorContainer as Element;
        let wrapped:Node=content;
        while(ancestor&&ancestor!==flow&&flow.contains(ancestor)){const shell=ancestor.cloneNode(false);shell.appendChild(wrapped);wrapped=shell;ancestor=ancestor.parentElement!;}
        const holder=doc.createElement('div');holder.append(wrapped);previewCache.set(n,(holder.textContent??'').trim().slice(0,1500));
        // Continuing paragraphs must not gain a second top margin.
        let first=holder.firstElementChild as HTMLElement|null;while(first){first.style.marginTop='0';first=first.firstElementChild as HTMLElement|null;}
        const style=`html,body{box-sizing:border-box;width:900px;height:1200px;max-width:none;margin:0;padding:0;overflow:hidden}body{background:#f5f4f1;color:#343d48;font:20px/1.85 sans-serif;overflow-wrap:anywhere}.omi-page-flow{position:absolute;left:42px;right:42px;top:${start.top}px;display:flow-root}.omi-page-flow img{max-width:100%;max-height:1128px;height:auto;object-fit:contain}.omi-page-flow table{max-width:100%;table-layout:fixed}pre{white-space:pre-wrap}`;
        const html=`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https://omi.local; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>${style}</style></head><body><div class="omi-page-flow" data-page-column="${col}">${holder.innerHTML}</div></body></html>`;
        pageCache.set(n,html);return html;
      };
      const pages=new Proxy(new Array<string>(points.length),{has(target,key){return typeof key==='string'&&/^\d+$/.test(key)&&Number(key)<target.length||Reflect.has(target,key);},get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key)&&Number(key)<target.length)return makePage(Number(key));return Reflect.get(target,key,receiver);}});
      const previews=new Proxy(new Array<string>(points.length),{has(target,key){return typeof key==='string'&&/^\d+$/.test(key)&&Number(key)<target.length||Reflect.has(target,key);},get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key)&&Number(key)<target.length){makePage(Number(key));return previewCache.get(Number(key))??'';}return Reflect.get(target,key,receiver);}});
      done(undefined,{pages,previews,bytes:()=>input.length*4+[...pageCache.values()].reduce((n,p)=>n+p.length*2,0),dispose:()=>{pageCache.clear();previewCache.clear();points.length=0;flow.replaceChildren();}});
    })().catch(done);};
    frame.srcdoc=presentation.html;document.body.append(frame);
  });
}
