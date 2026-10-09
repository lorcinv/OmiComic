// Usage: node --expose-gc scripts/run-pdf-stress.mjs /tmp/omicomic-raster-stress.pdf
// Native PDF.js canvas rendering; this does not certify Chromium/Electron UI behavior.
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
const { PDFDocumentSource } = require('../dist-electron/services/pdfService.js');
const { getDocument, PDFDataRangeTransport } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const target = process.argv[2];
if (!target) throw new Error('Pass the generated raster PDF path.');
const started = performance.now(), rssBefore = process.memoryUsage().rss;
let rssPeak = rssBefore, bytesRead = 0, requests = 0;
const sample = () => { rssPeak = Math.max(rssPeak, process.memoryUsage().rss); };
const timer = setInterval(sample,5);
const source = await PDFDocumentSource.open(target);
let loading;
class Ranges extends PDFDataRangeTransport {
  stopped = false;
  queue = Promise.resolve();
  requestDataRange(begin,end) {
    this.queue = this.queue.then(async () => {
      if(this.stopped) return;
      assert.ok(end-begin<=32*1024*1024);
      const data = new Uint8Array(end-begin);
      for(let offset=begin;offset<end;offset+=1024*1024) {
        if(this.stopped) return;
        const chunk = await source.range(offset,Math.min(end,offset+1024*1024));
        data.set(chunk,offset-begin); bytesRead+=chunk.length; requests++;
      }
      this.onDataRange(begin,data);
    }).catch(error=>{console.error(error);void loading?.destroy();});
  }
  abort(){this.stopped=true;}
}
const transport = new Ranges(source.size,new Uint8Array(),true);
const local = folder => path.resolve('node_modules/pdfjs-dist',folder)+path.sep;
let rendered = 0;
try {
  loading = getDocument({ range:transport,rangeChunkSize:256*1024,disableStream:true,disableAutoFetch:true, cMapUrl:local('cmaps'),cMapPacked:true,standardFontDataUrl:local('standard_fonts'),wasmUrl:local('wasm'),iccUrl:local('iccs'),maxImageSize:16_000_000,useSystemFonts:false });
  const pdf = await loading.promise;
  const indexedMs = performance.now()-started, bytesAfterIndex=bytesRead;
  const canvas = createCanvas(1,1);
  const pageTimes = [];
  for(let i=1;i<=pdf.numPages;i++) {
    const begin = performance.now(), page = await pdf.getPage(i), viewport=page.getViewport({scale:2});
    assert.ok(viewport.width*viewport.height<=16_000_000);
    canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    await page.render({canvas,viewport}).promise;
    const pixels = canvas.getContext('2d').getImageData(200,200,10,10).data;
    assert.ok(pixels.some((value,index)=>index%4!==3&&value<240),'raster content should actually render');
    if(i===1) await writeFile('/tmp/omicomic-stress-render.png',canvas.toBuffer('image/png'));
    rendered++;page.cleanup();sample();pageTimes.push(+(performance.now()-begin).toFixed(2));
  }
  const cancelledPage = await pdf.getPage(1), viewport = cancelledPage.getViewport({scale:2});
  const cancelled = cancelledPage.render({canvas,viewport});cancelled.cancel();
  await assert.rejects(cancelled.promise,{name:'RenderingCancelledException'});cancelledPage.cleanup();
  const dimensions = {width:canvas.width,height:canvas.height};canvas.width=1;canvas.height=1;
  await loading.destroy();await source.close();global.gc?.();sample();
  console.log(JSON.stringify({dataset:'real multi-page random JPEG PDF',fileBytes:source.size,totalPages:pdf.numPages,renderedPages:rendered,sourceRaster:{width:2400,height:3200},canvas:dimensions,indexedMs:+indexedMs.toFixed(2),rangeBytesAfterIndex:bytesAfterIndex,rangeBytesTotal:bytesRead,rangeRequests:requests,elapsedMs:+(performance.now()-started).toFixed(2),pageTimesMs:pageTimes,rssBeforeBytes:rssBefore,sampledRssPeakBytes:rssPeak,rssEndBytes:process.memoryUsage().rss,processMaxRssBytes:process.resourceUsage().maxRSS*1024,renderCancellationVerified:true,runtime:'Node PDF.js legacy + @napi-rs/canvas; Chromium/Electron UI NOT verified'},null,2));
} finally {clearInterval(timer);transport.abort();await loading?.destroy();await source.close();}
