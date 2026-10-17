const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const yauzl = require('yauzl');
const assert = require('node:assert/strict');
const { version } = require('../package.json');
const { libarchive } = require('../android/dependencies.json');
const root = path.resolve(__dirname, '..');
const apk = path.resolve(process.argv[2] || path.join(root, `release/OmiComic-${version}-android.apk`));
const requiredLicenses = ['pngj-LICENSE.txt','pngj-NOTICE.txt','core-js-LICENSE.txt','libarchive-android-LICENSE.txt','libarchive-LICENSE.txt','libarchive-NOTICES.txt','bzip2-LICENSE.txt','xz-COPYING.txt','xz-0BSD.txt','lz4-LICENSE.txt','zstd-LICENSE.txt','mbedtls-LICENSE.txt','zlib-LICENSE.txt','blake2-NOTICE.txt'];
const expected = new Set(['classes.dex', ...libarchive.abis.map(abi => `lib/${abi}/libarchive-jni.so`), ...requiredLicenses.map(name => `assets/web/licenses/${name}`)]);
const renderer = new Map();
function collect(directory, relative = '') {
  for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
    const name = relative + entry.name, file = path.join(directory,entry.name);
    if (entry.isDirectory()) collect(file,name+'/');
    else renderer.set('assets/web/'+name,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
  }
}
collect(path.join(root,'dist-android'));
const rendererFiles=renderer.size;
for(const name of renderer.keys())expected.add(name);
let nativeCount=0;
const handle=fs.openSync(apk,'r');
yauzl.open(apk, {lazyEntries:true}, (error, zip) => {
  if(error)throw error;
  zip.on('error', error => {throw error;});
  zip.on('entry', entry => {
    assert(!/\.(jks|keystore)$|password\.txt|^assets\/.*(?:archives|smoke|restore|performance|interactions|storage|upgrade|reader-tools)\.js$/.test(entry.fileName), 'Private/test file in release APK');
    expected.delete(entry.fileName);
    if(entry.fileName.startsWith('lib/')) {
      assert.equal(entry.compressionMethod,0,'Native libraries must be stored for extractNativeLibs=false');
      const header=Buffer.alloc(30);fs.readSync(handle,header,0,30,entry.relativeOffsetOfLocalHeader);
      const start=entry.relativeOffsetOfLocalHeader+30+header.readUInt16LE(26)+header.readUInt16LE(28);
      assert.equal(start%16384,0,'Native library not 16 KB aligned');
      const bytes=Buffer.alloc(entry.uncompressedSize);fs.readSync(handle,bytes,0,bytes.length,start);
      assert.deepEqual(bytes,fs.readFileSync(path.join(root,'android/build/native',entry.fileName)),'Native dependency differs from verified AAR');
      nativeCount++;
    }
    if(renderer.has(entry.fileName)) {
      zip.openReadStream(entry,(error,stream)=>{
        if(error)throw error;
        const hash=crypto.createHash('sha256');stream.on('error',error=>{throw error;});
        stream.on('data',chunk=>hash.update(chunk));
        stream.on('end',()=>{assert.equal(hash.digest('hex'),renderer.get(entry.fileName),'Packaged renderer differs from current build: '+entry.fileName);zip.readEntry();});
      });
    } else zip.readEntry();
  });
  zip.on('end',()=>{
    fs.closeSync(handle);assert.equal(expected.size,0,`APK missing ${[...expected]}`);assert.equal(nativeCount,4);
    const result={apk:path.basename(apk),version,bytes:fs.statSync(apk).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex'),nativeAbis:libarchive.abis,nativeLibrariesStoredAnd16KBAligned:true,pinnedNativeBytesMatch:true,thirdPartyLicenses:true,noSigningSecretsOrTestAssets:true,packagedRendererMatchesCurrentBuild:true,rendererFiles};
    fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
    fs.writeFileSync(path.join(root,'test-results/android-artifact.json'),JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify(result,null,2));
  });
  zip.readEntry();
});
