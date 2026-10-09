const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const ts = require('typescript');
const Module = require('node:module');
const mainPath = path.join(__dirname, '../electron/main.ts');
const main = fs.readFileSync(mainPath, 'utf8');
const parsed = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true);
const declaration = parsed.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === '注册安全通道');
const compiled = ts.transpileModule(declaration.getText(parsed) + '\n注册安全通道();', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;

test('actual progress IPC validator accepts PDF and EPUB and rejects unsupported sources', async () => {
 const handlers = new Map(); let saved;
 vm.runInNewContext(compiled, {ipcMain:{on:()=>{},handle:(name,handler)=>handlers.set(name,handler)}, Map, 保存阅读进度:async value=>(saved=value),});
 for(const sourceType of ['folder','archive','image','pdf','epub']) {
  const result=await handlers.get('数据:保存阅读进度')({}, {resourceKey:`${sourceType}:file`,sourcePath:'/file',sourceType,currentPageIndex:120,totalPages:200});
  assert.equal(result.ok,true); assert.equal(saved.currentPageIndex,120); assert.equal(saved.sourceType,sourceType);
 }
 assert.equal((await handlers.get('数据:保存阅读进度')({}, {resourceKey:'x',sourcePath:'/file',sourceType:'unknown'})).ok,false);
});

test('PDF/EPUB progress, favorites and tags survive real JSON persistence/reload',async t=>{
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'omi-persistence-')); t.after(()=>fsp.rm(dir,{recursive:true,force:true}));
 const source=path.join(__dirname,'../dist-electron/services/appDataService.js');
 function load() {
  const original=Module._load;
  Module._load=function(id,...args){if(id==='electron')return {app:{getPath:()=>dir}}; return original.call(this,id,...args);};
  try{delete require.cache[require.resolve(source)];return require(source);}finally{Module._load=original;}
 }
 let service=load();
 for(const type of ['pdf','epub']) {
  const resourceKey=`${type}:/comics/test.${type}`;
  const input={resourceKey,sourcePath:`/comics/test.${type}`,sourceType:type,title:'Test',currentPageIndex:120,totalPages:200,percent:60.5,completed:false,hasStartedReading:true,firstReadAt:1000,updatedAt:Date.now()};
  await service.保存阅读进度(input);
  await service.添加收藏(input);
  await service.更新资源整理信息({...input,note:'测试简介',tags:['保留标签']});
 }
 service=load();const data=await service.读取应用数据();
 for(const type of ['pdf','epub']){
  const key=`${type}:/comics/test.${type}`;
  assert.equal(data.readingProgress[key].currentPageIndex,120);
  assert.equal(data.readingProgress[key].sourceType,type);
  assert.equal(data.recentOpened.some(item=>item.resourceKey===key),true);
  assert.equal(data.favorites.some(item=>item.resourceKey===key&&item.sourceType===type),true);
  assert.deepEqual(data.resourceMeta[key].tags,['保留标签']);
 }
});
