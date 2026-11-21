import{test,expect,type Page}from'@playwright/test';
import{readFileSync}from'node:fs';
import { deflateSync } from 'node:zlib';
import{installMock}from'./mock';

const pdfBytes=[...readFileSync('tests/fixtures/documents/three-pages.pdf')];
async function seed(page:Page,pdf=false){
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(async({install,pdf,bytes})=>{
  eval('('+install+')')({count:220});const api=window.omicomic,r=await api.getAppData();if(!r.ok)throw Error();const d=r.data;
  d.settings.showHomePage=false;d.settings.hideBookshelfItemsInLibrary=false;
  const images=Array.from({length:220},(_,i)=>({id:`nested${i}`,name:`nested${i}.png`,path:`/comics/Parent/nested${i}.png`,type:'image',extension:'png'}));
  const list=api.listDirectory;api.listDirectory=async path=>path==='/comics/Parent'?{ok:true,data:{path,parentPath:'/comics',items:images,total:images.length}}:list(path);
  api.updateLibraryState=async input=>{Object.assign(d.library,input);return{ok:true,data:null};};
  d.recentOpened=Array.from({length:220},(_,i)=>({resourceKey:`image:/comics/recent${i}.png`,sourcePath:`/comics/recent${i}.png`,sourceType:'image',title:`Recent ${i}`,currentPageIndex:0,totalPages:1,updatedAt:220-i}));
  d.favorites=d.recentOpened.map((item,i)=>({...item,title:`Favorite ${i}`,addedAt:i}));api.getFavorites=async()=>({ok:true,data:d.favorites});api.getRecentOpened=async()=>({ok:true,data:d.recentOpened});
  d.bookshelves=[{id:'c',name:'分类',sortIndex:0,createdAt:1,updatedAt:1}];
  d.virtualFolders=Array.from({length:20},(_,i)=>({id:'s'+i,name:'Shelf '+i,bookshelfId:'c',sortIndex:i,createdAt:1,updatedAt:1,note:'',tags:[],items:i===0?images.map((image,n)=>({id:'v'+n,folderId:'s0',resourceKey:'image:'+image.path,sourcePath:image.path,sourceType:'image',title:'Shelf image '+n,sortIndex:n,addedAt:1})):[]}));
  if(pdf){
   api.getResourcePages=async()=>({ok:true,data:{key:'pdf:/comics/sample.pdf',resourceKey:'pdf:/comics/sample.pdf',sourcePath:'/comics/sample.pdf',sourceType:'pdf',title:'PDF',pages:[],total:0}});
   api.openDocument=async()=>({ok:true,data:{size:bytes.length,chapters:[]}});api.readDocumentRange=async(_id,begin,end)=>({ok:true,data:new Uint8Array(bytes.slice(begin,end))});api.closeDocument=async()=>({ok:true,data:null});
  }
  api.getAppData=async()=>({ok:true,data:structuredClone(d)});
 },{install:installMock.toString(),pdf,bytes:pdfBytes});
 await page.goto('/');
}
for(const mobile of[false,true])test.describe(mobile?'phone continuity':'desktop continuity',()=>{
 test.use(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{});
 test('PDF details show decoded page thumbnails and their page can be opened',async({page})=>{
  await seed(page,true);const card=page.locator(mobile?'.mobile-resource-card':'.resource-card').filter({has:page.locator('strong',{hasText:/^Book$/})});await card.getByRole('button',{name:'打开资源信息',exact:true}).click();
  const grid=page.locator('.resource-detail-thumbnail-grid');await expect(grid.locator('.resource-detail-thumbnail')).toHaveCount(3);await expect.poll(()=>grid.locator('img').evaluateAll(images=>images.filter(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0).length)).toBe(3);
  await expect(page.getByText('PDF 文档',{exact:true})).toHaveCount(0);await page.screenshot({path:`test-results/pdf-detail-${mobile?'mobile':'desktop'}.png`});
  const second=grid.getByRole('button',{name:/第 2 页：/});if(mobile)await second.tap();else await second.dblclick();await expect(page.locator('[data-reader-page-index="1"] canvas.reader-pdf-canvas')).toBeVisible();
 });
 test('returning to a tab keeps folder and scroll; pressing the active tab resets it',async({page})=>{
  test.setTimeout(60000);await seed(page);const cards=page.locator(mobile?'.mobile-resource-card':'.resource-card'),body=page.locator('.page-panel.is-visible .resource-list-scroll, .page-panel.is-visible .bookshelf-root-view');
  const nav=(name:string)=>page.locator('.sidebar-primary-nav .sidebar-item').filter({has:page.locator('span',{hasText:new RegExp('^'+name+'$')})});
  const parent=cards.filter({has:page.locator('strong',{hasText:/^Parent$/})});if(mobile)await parent.tap();else await parent.dblclick();await expect(cards.first()).toContainText(/nested/);
  const scroll=async(top:number)=>{await body.evaluate((el,top)=>{el.scrollTop=top;},top);await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(top-5);await page.waitForTimeout(80);};
  await scroll(1200);await nav('最近阅读').click();await expect(cards.first()).toContainText(/Recent/);await scroll(800);await nav('资源库').click();await expect(cards.first()).toContainText(/nested/);await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(1150);
  await nav('资源库').click();await expect(cards.filter({has:page.locator('strong',{hasText:/^Parent$/})})).toBeVisible();await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeLessThan(1);
  await nav('收藏').click();await scroll(1000);await nav('最近阅读').click();await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(750);await nav('收藏').click();await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(950);await nav('收藏').click();await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeLessThan(1);
  await nav('书架').click();const shelf=page.locator(mobile?'.mobile-bookshelf-card':'.bookshelf-folder-card').filter({has:page.locator('strong',{hasText:/^Shelf 0$/})});if(mobile)await shelf.tap();else await shelf.dblclick();await expect(cards.first()).toContainText(/Shelf image/);await scroll(1000);await nav('最近阅读').click();await nav('书架').click();await expect(cards.first()).toContainText(/Shelf image/);await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(950);await nav('书架').click();await expect(page.locator(mobile?'.mobile-bookshelf-card':'.bookshelf-folder-card').first()).toBeVisible();await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeLessThan(1);
 });
});

test('PDF parsing worker is shared across documents and survives closing a thumbnail source',async({page})=>{
 await page.goto('/tests/fixtures/document-harness.html');
 const result=await page.evaluate(async bytes=>{
  const api={openDocument:async()=>({ok:true,data:{size:bytes.length,chapters:[]}}),readDocumentRange:async(_id:string,begin:number,end:number)=>({ok:true,data:new Uint8Array(bytes.slice(begin,end))}),closeDocument:async()=>({ok:true,data:null})};window.omicomic=api as any;
  const{DocumentSource}=await import('/src/reader/documentSource.ts'),runtime=await import('/src/reader/pdfRuntime.ts');
  const resource={key:'pdf:a',resourceKey:'pdf:a',sourcePath:'/a.pdf',sourceType:'pdf' as const,title:'',pages:[],total:0};
  const cover=new DocumentSource(resource,'thumbnail');await cover.open();const worker=runtime.getSharedPdfWorker();cover.dispose();
  const reader=new DocumentSource({...resource,key:'pdf:b',resourceKey:'pdf:b',sourcePath:'/b.pdf'});try{const book=await reader.open(),page=await reader.readPage(0);return{pages:book.total,same:worker===runtime.getSharedPdfWorker(),destroyed:worker.destroyed,pixels:page.canvas!.width*page.canvas!.height};}finally{reader.dispose();}
 },pdfBytes);
 expect(result).toMatchObject({pages:3,same:true,destroyed:false});expect(result.pixels).toBeGreaterThan(0);
});

function largeScanPdf(): Buffer {
  const width = 3400, height = 5200;
  const image = deflateSync(Buffer.alloc(width * height, 72));
  const draw = 'q 360 0 0 480 0 0 cm /Scan Do Q';
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Count 1 /Kids [3 0 R] >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 480] /Resources << /XObject << /Scan 5 0 R >> >> /Contents 4 0 R >>'),
    Buffer.from(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`),
    Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n`),
      image,
      Buffer.from('\nendstream'),
    ]),
  ];
  const chunks = [Buffer.from('%PDF-1.5\n')];
  const xref = ['0000000000 65535 f \n'];
  let offset = chunks[0].length;
  for (const [index, object] of objects.entries()) {
    xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')]);
    chunks.push(chunk);
    offset += chunk.length;
  }
  chunks.push(Buffer.from(`xref\n0 ${xref.length}\n${xref.join('')}trailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

test('large PDF scans render and replace blank legacy covers while the new covers persist', async ({ page }) => {
  const bytes = [...largeScanPdf()];
  const read = (version: string) => page.evaluate(async ({ bytes, version }) => {
    let opens = 0;
    window.omicomic = {
      getThumbnail: async () => ({ ok: true, data: { url: null, pdfPath: '/cache.pdf', sourceVersion: version } }),
      openDocument: async () => { opens++; return { ok: true, data: { size: bytes.length, chapters: [] } }; },
      readDocumentRange: async (_id: string, begin: number, end: number) => ({ ok: true, data: new Uint8Array(bytes.slice(begin, end)) }),
      closeDocument: async () => ({ ok: true, data: null }),
    } as typeof window.omicomic;
    const { getResourceThumbnail } = await import('/src/reader/thumbnailClient.ts');
    const result = await getResourceThumbnail({ path: '/cache.pdf', type: 'pdf' });
    const url = result.ok ? result.data.url : null;
    if (!url) return { opens, url, pixel: null };
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return { opens, url, pixel: ctx.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data[0] };
  }, { bytes, version });

  await page.goto('/tests/fixtures/document-harness.html');
  await page.evaluate(async () => {
    const { savePdfCover } = await import('/src/reader/pdfCoverStore.ts');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await savePdfCover('/cache.pdf:1', '/cache.pdf', canvas.toDataURL('image/jpeg'));
  });

  const cold = await read('1');
  expect(cold.opens).toBe(1);
  expect(Math.abs(cold.pixel! - 72)).toBeLessThan(6);
  await page.waitForTimeout(100);
  await page.reload();
  expect(await read('1')).toEqual({ ...cold, opens: 0 });
  expect((await read('2')).opens).toBe(1);

  const readerPixel = await page.evaluate(async () => {
    const { DocumentSource } = await import('/src/reader/documentSource.ts');
    const source = new DocumentSource({
      key: 'pdf:/cache.pdf', resourceKey: 'pdf:/cache.pdf', sourcePath: '/cache.pdf',
      sourceType: 'pdf', title: 'Scan', pages: [], total: 0,
    });
    try {
      await source.open();
      const { canvas } = await source.readPage(0);
      return canvas?.getContext('2d')?.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data[0];
    } finally {
      source.dispose();
    }
  });
  expect(Math.abs(readerPixel! - 72)).toBeLessThan(6);

  await page.evaluate(async () => {
    const { clearResourceThumbnailCache } = await import('/src/reader/thumbnailClient.ts');
    clearResourceThumbnailCache('/cache.pdf');
  });
  expect((await read('2')).opens).toBe(1);
});
