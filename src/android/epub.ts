import type { NativeCall } from "./bridge";

export async function sanitizeAndroidChapter(payload: string, native: NativeCall, imageSource:'https://omi.local'|'data:'|'omi:'='https://omi.local'): Promise<string> {
  const { html, path, entry } = JSON.parse(payload) as { html: string; path: string; entry: string };
  const source = new DOMParser().parseFromString(html, "text/html");
  const output = document.implementation.createHTMLDocument("");
  const allowed = new Set(["p","div","span","h1","h2","h3","h4","h5","h6","br","hr","strong","b","em","i","u","s","blockquote","ul","ol","li","pre","code","table","thead","tbody","tr","th","td","img","ruby","rt","rp","sup","sub"]);
  const blocked = new Set(["script","style","iframe","object","embed","math","form","input","button","link","meta","base"]);
  let count = 0, images = 0;
  async function append(node: Node, parent: Node): Promise<void> {
    if (++count > 50000) throw new Error("章节内容过大。");
    if (node.nodeType === Node.TEXT_NODE) { parent.appendChild(output.createTextNode(node.textContent ?? "")); return; }
    if (!(node instanceof Element)) return;
    const tag = node.localName.toLowerCase(); if (blocked.has(tag)) return;
    // Fixed-layout EPUBs often wrap a raster in SVG. Keep only those local
    // raster references, never executable SVG nodes or their attributes.
    if (tag === "svg") { for (const image of [...node.querySelectorAll('image')]) await append(image, parent); return; }
    const raster = tag === "img" || tag === "image";
    const target = raster ? output.createElement("img") : allowed.has(tag) ? output.createElement(tag) : output.createElement("span");
    if (raster) {
      if (++images > 150) return;
      const href = node.getAttribute("src") || node.getAttribute("href") || node.getAttribute("xlink:href") || node.getAttributeNS("http://www.w3.org/1999/xlink", "href"); if (!href || /^(?:[a-z]+:|\/\/)/i.test(href)) return;
      try { const image = await native<string | {url:string;preview?:string;width?:number;height?:number} | null>("epubImage", { path, entry, href }); if (!image) return; target.setAttribute("src", typeof image==='string'?image:image.url);if(typeof image!=='string'&&image.preview)target.setAttribute("data-omi-preview",image.preview);for(const attr of ["width","height"]){const size=(typeof image!=='string'&&image[attr as 'width'|'height'])?.toString()||node.getAttribute(attr);if(size&&/^\d{1,6}$/.test(size)&&Number(size)>0)target.setAttribute(attr,size);} target.setAttribute("alt",node.getAttribute("alt")??""); } catch { return; }
    }
    for (const child of [...node.childNodes]) await append(child,target);
    parent.appendChild(target);
  }
  for (const child of [...source.body.childNodes]) await append(child,output.body);
  const csp = output.createElement("meta"); csp.httpEquiv="Content-Security-Policy";csp.content=`default-src 'none'; img-src ${imageSource}; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none';`;output.head.append(csp);
  const style=output.createElement("style");style.textContent="html{color-scheme:light}body{box-sizing:border-box;margin:0;padding:48px;max-width:900px;font:20px/1.85 sans-serif;color:#343d48;background:#f5f4f1;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px}pre{white-space:pre-wrap}";output.head.append(style);
  return "<!doctype html>"+output.documentElement.outerHTML;
}
