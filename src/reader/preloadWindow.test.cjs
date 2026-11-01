const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const api = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'preloadWindow.ts'),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:api});
const plan = (...args) => Array.from(api.nativePreloadWindow(...args));
const desktop = (...args) => Array.from(api.desktopPreloadWindow(...args));

test('desktop original-resolution window follows direction and fits decoded-image budget',()=>{
  assert.deepEqual(desktop([10],200,1,6,100,10),[11,9,12,13,14]);
  assert.deepEqual(desktop([10,11],200,-1,6,50,10),[9]);
  assert.deepEqual(desktop([10],200,1,60,10,10),[]);
  assert.deepEqual(desktop([10],200,1,0,100,10),[]);
  assert.equal(desktop([80],500,1,36,1024,10).length,48);
  assert.deepEqual(desktop([0],2,1,60,100,10),[1]);
  assert.deepEqual(desktop([0],224,1,48,4096*1024**2,96*1024**2),[1]);
});
test('preload follows reading direction while keeping the nearest reverse page', () => {
  assert.deepEqual(plan([10],110,1,2,100,10),[11,9,12,13]);
  assert.deepEqual(plan([10],110,-1,2,100,10),[9,11,8,7]);
});

test('desktop reserves adjacent spreads before distant pages without raising the byte cap',()=>{
  assert.deepEqual(desktop([8,9],100,1,4,100,10),[10,11,7,6]);
  assert.deepEqual(desktop([8,9],100,-1,4,100,10),[7,6,10,11]);
  assert.deepEqual(desktop([8],100,1,4,100,10,{next:[9,10],previous:[6,7]}),[9,10,6,7,11]);
  assert.deepEqual(desktop([8,9],100,1,4,50,10),[10]);
  assert.deepEqual(desktop([0,1],3,1,4,100,10,{next:[2],previous:[0,1]}),[2]);
});
test('memory budget, disabled cache, pairs and book boundaries bound speculative work', () => {
  assert.deepEqual(plan([10],110,1,20,30,10),[11,9]);
  assert.deepEqual(plan([10],110,1,2,10,10),[]);
  assert.deepEqual(plan([10],110,1,0,100,10),[]);
  assert.deepEqual(plan([10],110,1,2,0,10),[]);
  assert.deepEqual(plan([10,11],110,1,2,100,10),[12,9,13,14]);
  assert.deepEqual(plan([0],3,1,2,100,10),[1,2]);
  assert.deepEqual(plan([109],110,-1,2,100,10),[108,107,106]);
});
