const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');

function serviceWith(archive, nativeImage) {
  const original = Module._load;
  Module._load = function(id, ...args) {
    if (id === 'electron') return { nativeImage };
    if (id === './archiveService') return {
      是压缩包服务错误: error => Boolean(error.code), ...archive,
      读取压缩包封面列表: archive.读取压缩包图片列表,
    };
    return original.call(this, id, ...args);
  };
  try {
    const file = require.resolve('../dist-electron/services/thumbnailService');
    delete require.cache[file];
    return require(file);
  } finally { Module._load = original; }
}
async function source(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-thumbnail-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('omicomic-thumbnail-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const file = path.join(root, 'test.cbz'); await fs.writeFile(file, 'fixture');
  return file;
}
function image(width, height, bytes = 24) {
  const data = Buffer.alloc(bytes);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(data);
  data.writeUInt32BE(width,16); data.writeUInt32BE(height,20);
  return data;
}
function decoder(onDecode = () => {}) {
  return { createFromBuffer(data) {
    onDecode(data);
    return { isEmpty: () => false, getSize: () => ({ width: data.readUInt32BE(16), height: data.readUInt32BE(20) }),
      resize: options => ({ toDataURL: () => `resized:${options.width}x${options.height}` }), toDataURL: () => 'decoded' };
  } };
}

test('persistent file covers survive a service restart, reject changed versions and recover from corrupt cache',async t=>{
 const file=await source(t),folder=path.join(path.dirname(file),'covers');
 const disk=require('../dist-electron/services/thumbnailDiskCache');disk.configureThumbnailDiskCache(folder);
 let reads=0;
 const archive={读取压缩包图片列表:async()=>[{virtualPath:'1.png',size:24}],读取压缩包单张图片:async()=>{reads++;return image(100,100);}};
 const decode={createFromBuffer:()=>({isEmpty:()=>false,getSize:()=>({width:100,height:100}),toDataURL:()=> 'data:image/png;base64,AAAA'})};
 let service=serviceWith(archive,decode);const input={path:file,type:'archive'};
 await service.获取缩略图(input);
 const wait=async count=>{const until=Date.now()+3000;while(disk.thumbnailDiskMetrics.writes<count){assert.ok(Date.now()<until);await new Promise(resolve=>setTimeout(resolve,10));}};
 await wait(1);service=serviceWith(archive,decode);
 assert.equal((await service.获取缩略图(input)).url,'data:image/png;base64,AAAA');assert.equal(reads,1);
 assert.ok(disk.thumbnailDiskMetrics.hits>0);
 await fs.appendFile(file,'new-version');service=serviceWith(archive,decode);await service.获取缩略图(input);assert.equal(reads,2);
 await wait(2);for(const name of await fs.readdir(folder))if(name.endsWith('.json'))await fs.writeFile(path.join(folder,name),'broken');
 service=serviceWith(archive,decode);await service.获取缩略图(input);assert.equal(reads,3);
 await service.clearThumbnailCache();
 disk.configureThumbnailDiskCache(undefined);
});

test('18.2 MP / >12 MiB archive cover keeps priority over a smaller later page and is resized', async t => {
  const file = await source(t);
  const data = image(3500, 5200, 13 * 1024 * 1024);
  const reads = [];
  const service = serviceWith({
    读取压缩包图片列表: async () => [{virtualPath:'001-cover.png',size:data.length},{virtualPath:'002.png',size:100}],
    读取压缩包单张图片: async (_file, name, limit) => { reads.push(name); assert.ok(limit >= data.length); return data; },
  }, decoder());
  assert.equal((await service.获取缩略图({path:file,type:'archive'})).url, 'resized:242x360');
  assert.deepEqual(reads, ['001-cover.png']);
});

test('broken small candidate falls back to a readable large scan; oversized surfaces never decode', async t => {
  const file = await source(t);
  let decoded = 0;
  const reads = [];
  const service = serviceWith({
    读取压缩包图片列表: async () => [
      {virtualPath:'001.png',size:24},{virtualPath:'002.png',size:24},
      {virtualPath:'003.png',size:13*1024*1024},{virtualPath:'004.png',size:65*1024*1024},
    ],
    读取压缩包单张图片: async (_file,name) => {
      reads.push(name);
      return name === '001.png' ? image(8192,8192) : name === '002.png' ? Buffer.from('bad image') : image(3500,5200);
    },
  }, decoder(() => decoded++));
  assert.equal((await service.获取缩略图({path:file,type:'archive'})).url, 'resized:242x360');
  assert.deepEqual(reads,['001.png','002.png','003.png']); assert.equal(decoded,1);
});

test('concurrent cover requests share decoding; transient empty result is not cached', async t => {
  const file = await source(t); let reads = 0; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const service = serviceWith({
    读取压缩包图片列表: async () => { reads++; await gate; if(reads === 1) throw Object.assign(new Error('temporary I/O'), {code:'ARCHIVE_READ_FAILED'}); return [{virtualPath:'1.png',size:24}]; },
    读取压缩包单张图片: async () => image(100,100),
  }, decoder());
  const input = {path:file,type:'archive'};
  const requests = Array.from({length:12}, () => service.获取缩略图(input));
  // Wait until all asynchronous stat calls have joined the same pending load.
  await new Promise(resolve => setTimeout(resolve,50)); release();
  assert.ok((await Promise.all(requests)).every(result => result.url === null && result.retryable));
  assert.equal(reads,1);
  assert.equal((await service.获取缩略图(input)).url,'decoded'); assert.equal(reads,2);
  assert.equal((await service.获取缩略图(input)).url,'decoded'); assert.equal(reads,2);
  await fs.writeFile(file,'replacement archive');
  assert.equal((await service.获取缩略图(input)).url,'decoded'); assert.equal(reads,3);
});

test('encrypted archives do not request a retry, failed native decoding never returns full image bytes', async t => {
  const file = await source(t);
  const encrypted = serviceWith({读取压缩包图片列表: async () => {throw {code:'ARCHIVE_ENCRYPTED'};}}, decoder());
  assert.deepEqual(await encrypted.获取缩略图({path:file,type:'archive'}), {url:null,retryable:false});
  const broken = serviceWith({
    读取压缩包图片列表: async () => [{virtualPath:'1.png',size:24}],
    读取压缩包单张图片: async () => image(100,100),
  }, {createFromBuffer: () => ({isEmpty: () => true})});
  assert.equal((await broken.获取缩略图({path:file,type:'archive'})).url,null);
});
