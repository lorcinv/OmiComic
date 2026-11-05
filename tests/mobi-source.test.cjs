const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {mobiFixture}=require('./helpers/mobiFixture.cjs');
const {MobiBinarySource}=require('../dist-electron/services/mobiBinarySource');
const {MAX_MOBI_BYTES}=require('../dist-electron/shared/mobiLimits');

test('MOBI range source opens >64 MiB, bounds chunks, and rejects >2 GiB without reading the whole file',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omicomic-mobi-range-'));
  t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('omicomic-mobi-range-'));await fs.rm(root,{recursive:true,force:true});});
  const file=path.join(root,'large.mobi'),fixture=mobiFixture(['<p>大型 MOBI</p>']);
  await fs.writeFile(file,fixture);await fs.truncate(file,65*1024*1024);
  const source=await MobiBinarySource.open(file);
  try{
    assert.equal(source.size,65*1024*1024);assert.deepEqual(await source.range(0,78),fixture.subarray(0,78));
    assert.equal((await source.range(source.size-16,source.size)).length,16);
    await assert.rejects(source.range(0,1024*1024+1),/范围/);
  }finally{await source.close();}
  await fs.truncate(file,300*1024*1024);const ranged=await MobiBinarySource.open(file);try{assert.equal((await ranged.signatures()).length>0,true);}finally{await ranged.close();}
  await fs.truncate(file,0x80000000);await assert.rejects(MobiBinarySource.open(file),/2 GiB/);
});
