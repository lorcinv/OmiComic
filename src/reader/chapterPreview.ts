/** A small local preview of a sanitized chapter. Image chapters use their real
 * image; text chapters show their opening text instead of an empty placeholder. */
export async function chapterPreview(html: string, signal: AbortSignal): Promise<HTMLCanvasElement> {
  signal.throwIfAborted();
  const content = new DOMParser().parseFromString(html, 'text/html');
  const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 480;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const imageSource = content.images[0]?.getAttribute('data-omi-preview') || content.images[0]?.getAttribute('src');
  let textTop = 28;
  try {
    if (imageSource && /^(?:data:image\/(?:png|jpeg|gif|webp|bmp|avif);|https:\/\/omi\.local\/)/i.test(imageSource)) {
      const image = new Image();
      const abort = () => { image.src = ''; };
      signal.addEventListener('abort', abort, { once: true });
      try {
        if(imageSource.startsWith('https://omi.local/'))image.crossOrigin='anonymous';
        image.src = imageSource; await image.decode(); signal.throwIfAborted();
        const text = content.body.textContent?.trim() ?? '';
        const onlyImage = content.body.dataset.omiImagePage === 'true' || !text;
        const width = onlyImage ? 360 : 312, height = onlyImage ? 480 : 240;
        const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
        const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
        ctx.drawImage(image, (360 - w) / 2, onlyImage ? (480 - h) / 2 : 24, w, h);
        if (onlyImage) return canvas;
        textTop = 24 + h + 24;
      } catch (error) { signal.throwIfAborted(); /* Broken images leave a readable text preview. */ }
      finally { signal.removeEventListener('abort', abort); image.src = ''; }
    }
    content.querySelectorAll('script,style,head').forEach(node => node.remove());
    const text = (content.querySelector('.omi-text-flow') ? await visibleText(html, signal) : content.body.textContent ?? '').replace(/\s+/g, ' ').trim();
    ctx.fillStyle = '#263249'; ctx.font = '16px sans-serif'; ctx.textBaseline = 'top';
    let line = '', y = textTop;
    for (const character of text.slice(0, 1500)) {
      if (ctx.measureText(line + character).width > 312) {
        ctx.fillText(line, 24, y); line = character; y += 25;
        if (y > 440) break;
      } else line += character;
    }
    if (y <= 440) ctx.fillText(line, 24, y);
    signal.throwIfAborted(); return canvas;
  } catch (error) { canvas.width = canvas.height = 0; throw error; }
}

// A text preview shows this page's column, not the chapter opening repeated.
async function visibleText(html:string,signal:AbortSignal):Promise<string>{
  signal.throwIfAborted();
  const frame=document.createElement('iframe');frame.sandbox.add('allow-same-origin');
  frame.style.cssText='position:fixed;left:-10000px;top:0;width:900px;height:1200px;visibility:hidden;border:0;pointer-events:none';
  frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;
  try{return await new Promise<string>((resolve,reject)=>{
    const abort=()=>reject(signal.reason),timer=setTimeout(()=>reject(Error('文字预览超时。')),15000);
    signal.addEventListener('abort',abort,{once:true});
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);};
    frame.onload=()=>{try{
      signal.throwIfAborted();const doc=frame.contentDocument;if(!doc)throw Error('文字预览失败。');
      const walker=doc.createTreeWalker(doc.querySelector('.omi-text-flow')!,NodeFilter.SHOW_TEXT),parts:string[]=[];let node:Node|null,characters=0;
      while((node=walker.nextNode())&&characters<1500){
        const value=node.textContent??'';if(!value.trim())continue;
        const range=doc.createRange();range.selectNodeContents(node);
        if(![...range.getClientRects()].some(r=>r.right>0&&r.left<900))continue;
        const left=(offset:number)=>{range.setStart(node!,offset);range.setEnd(node!,offset+1);return range.getBoundingClientRect().left;};
        const boundary=(x:number)=>{let a=0,b=value.length;while(a<b){const mid=(a+b)>>>1;if(left(mid)<x)a=mid+1;else b=mid;}return a;};
        const text=value.slice(boundary(0),boundary(900));parts.push(text);characters+=text.length;
      }
      cleanup();resolve(parts.join(' '));
    }catch(error){cleanup();reject(error);}};
    frame.srcdoc=html;document.body.append(frame);
  });}finally{frame.remove();}
}
