const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { scanLibraryCatalog, scanLibraryCatalogBatch, configureLibraryCatalog, observeCatalogDirectory, catalogMetrics, cancelLibraryCatalogScans } = require('../dist-electron/services/libraryCatalog');

test('native catalog recurses once, identifies image books, and refreshes cached changes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omi-catalog-'));
  t.after(async () => { assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('omi-catalog-'));await fs.rm(root, { recursive:true,force:true }); });
  const deep = path.join(root, ...Array.from({ length: 12 }, (_, n) => `长目录-${n}-abcdefghijklmnop`));
  await fs.mkdir(deep, { recursive: true });
  const title = '[作者] 番外：特别篇 ' + '长标题'.repeat(30) + '.cbz';
  await fs.writeFile(path.join(deep, title), 'fixture');
  await fs.writeFile(path.join(deep, '1.png'), 'fixture');
  await fs.writeFile(path.join(deep, 'ignore.txt'), 'fixture');
  const first = await scanLibraryCatalog(root, root);
  assert.ok(first.items.some(item => item.name === title && item.path.length > 260));
  assert.equal(first.items.find(item => item.path === deep).containsImages, true);
  assert.equal(first.items.filter(item => item.type === 'image').length, 0, 'image pages belong to one image-folder record');
  assert.equal(first.items.some(item => item.name === 'ignore.txt'), false);
  await fs.writeFile(path.join(root, 'new.pdf'), 'fixture');
  assert.equal((await scanLibraryCatalog(root, root)).items.some(item => item.name === 'new.pdf'), false);
  assert.equal((await scanLibraryCatalog(root, root, true)).items.some(item => item.name === 'new.pdf'), true);
  await assert.rejects(scanLibraryCatalog(root, path.join(root, 'nonexistent'), true));
});

test('a canceled inventory does not finish in the background and can restart independently',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'omi-catalog-'));
 t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('omi-catalog-'));await fs.rm(root,{recursive:true,force:true});});
 await fs.mkdir(path.join(root,'child'));
 const task=scanLibraryCatalog(root,root,true);cancelLibraryCatalogScans();
 await assert.rejects(task,error=>error.name==='AbortError');
 assert.equal((await scanLibraryCatalog(root,root,true)).directories,2);
});

test('bounded batches reuse foreground metadata, prune hidden branches and resume from persisted directory blocks', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'omi-catalog-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('omi-catalog-'));await fs.rm(root,{recursive:true,force:true});});
  const library = path.join(root,'library'), storage = path.join(root,'derived');
  await fs.mkdir(library); await fs.mkdir(path.join(library,'hidden')); await fs.writeFile(path.join(library,'hidden','secret.cbz'),'x');
  const entries=[];
  for(let n=0;n<600;n++) { const file=path.join(library,`${n}.cbz`); await fs.writeFile(file,'x'); entries.push({id:file,path:file,name:`${n}.cbz`,type:'archive',extension:'cbz',size:1,modifiedAt:123}); }
  entries.push({id:path.join(library,'hidden'),path:path.join(library,'hidden'),name:'hidden',type:'folder',extension:''});
  configureLibraryCatalog(storage); await observeCatalogDirectory(library,entries);
  const reads = catalogMetrics.readdir;
  let batch = await scanLibraryCatalogBatch(library,library,{restart:true,excludedPaths:[path.join(library,'hidden')]});
  assert.equal(batch.complete,false); assert.ok(batch.items.length<=256); assert.equal(catalogMetrics.readdir,reads);
  const items=new Map(batch.items.map(item=>[item.path,item]));
  while(!batch.complete) { batch=await scanLibraryCatalogBatch(library,library); for(const item of batch.items)items.set(item.path,item); }
  assert.equal([...items.values()].filter(item=>item.type==='archive').length,600);
  assert.equal([...items.keys()].some(file=>file.includes('hidden')),false);
  assert.equal(items.get(entries[0].path).modifiedAt,123); assert.equal(catalogMetrics.readdir,reads);
  const { execFile } = require('node:child_process'), { promisify } = require('node:util');
  const script = 'const c=require(process.argv[1]);c.configureLibraryCatalog(process.argv[3]);c.scanLibraryCatalogBatch(process.argv[2],process.argv[2],{restart:true}).then(r=>console.log(JSON.stringify({count:r.items.length,complete:r.complete,metrics:c.catalogMetrics})))';
  const child=await promisify(execFile)(process.execPath,['-e',script,path.resolve('dist-electron/services/libraryCatalog.js'),library,storage]);
  const resumed=JSON.parse(child.stdout.trim());assert.equal(resumed.metrics.readdir,0);assert.equal(resumed.metrics.diskHits,1);assert.equal(resumed.count,256);
});

test('an explicit full rebuild checks directories outside the bounded hot cache', async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omi-catalog-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('omi-catalog-'));await fs.rm(root,{recursive:true,force:true});});
  configureLibraryCatalog(path.join(root,'derived'));const library=path.join(root,'library');await fs.mkdir(library);
  for(let index=0;index<72;index++){const dir=path.join(library,String(index).padStart(3,'0'));await fs.mkdir(dir);await fs.writeFile(path.join(dir,'one.cbz'),'x');}
  await scanLibraryCatalog(library,library);
  const added=path.join(library,'000','external.cbz');await fs.writeFile(added,'x');
  const reads=catalogMetrics.readdir;const rebuilt=await scanLibraryCatalog(library,library,true);
  assert.ok(rebuilt.items.some(item=>item.path===added));assert.equal(catalogMetrics.readdir-reads,73);
});
