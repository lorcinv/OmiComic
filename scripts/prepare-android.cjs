// Pinned Maven artifact, checked before any of its classes or native code enters the APK.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const yauzl = require('yauzl');
const root = path.resolve(__dirname, '..');
const dependency = require('../android/dependencies.json').libarchive;
const file = path.join(root, '.cache/libarchive', `library-${dependency.version}.aar`);
const output = path.join(root, 'android/build/native');
function alignedElf(bytes, abi) {
  if (bytes.subarray(0, 4).toString('hex') !== '7f454c46') throw new Error(`Invalid ELF: ${abi}`);
  if (!['arm64-v8a', 'x86_64'].includes(abi)) return;
  if (bytes[4] !== 2 || bytes[5] !== 1) throw new Error(`Unexpected ELF class: ${abi}`);
  const offset = Number(bytes.readBigUInt64LE(32));
  const stride = bytes.readUInt16LE(54), count = bytes.readUInt16LE(56);
  for (let i = 0; i < count; i++) {
    const header = offset + i * stride;
    if (bytes.readUInt32LE(header) === 1 && bytes.readBigUInt64LE(header + 48) < 16384n)
      throw new Error(`${abi} library lacks 16 KB page alignment`);
  }
}
async function main() {
  const png = require('../android/dependencies.json').pngj;
  const pngFile = path.join(root, '.cache', `pngj-${png.version}.jar`);
  if (!fs.existsSync(pngFile)) {
    const response = await fetch(png.url);
    if (!response.ok) throw new Error(`PNG decoder download: ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(`${pngFile}.part`));
    fs.renameSync(`${pngFile}.part`, pngFile);
  }
  if (crypto.createHash('sha256').update(fs.readFileSync(pngFile)).digest('hex') !== png.sha256)
    throw new Error('PNGJ checksum mismatch.');
  fs.mkdirSync(output, {recursive:true});
  fs.copyFileSync(pngFile, path.join(output, 'pngj.jar'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    const response = await fetch(dependency.url);
    if (!response.ok) throw new Error(`Native dependency download: ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(`${file}.part`));
    fs.renameSync(`${file}.part`, file);
  }
  if (crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== dependency.sha256)
    throw new Error('libarchive checksum mismatch; restore the pinned Maven artifact.');
  const expected = new Set(['classes.jar', ...dependency.abis.map(abi => `jni/${abi}/libarchive-jni.so`)]);
  await new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true }, (error, zip) => {
    if (error) return reject(error);
    zip.on('error', reject);
    zip.on('end', () => expected.size ? reject(new Error(`Missing AAR entries: ${[...expected]}`)) : resolve());
    zip.on('entry', entry => {
      if (!expected.has(entry.fileName)) return zip.readEntry();
      if (entry.uncompressedSize > 16 * 1024 * 1024) { zip.close(); return reject(new Error('Native artifact entry too large')); }
      zip.openReadStream(entry, (error, stream) => {
        if (error) return reject(error);
        const chunks = [];
        stream.on('error', reject);
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => {
          try {
            const bytes = Buffer.concat(chunks);
            if (entry.fileName.endsWith('.so')) alignedElf(bytes, entry.fileName.split('/')[1]);
            const target = path.join(output, entry.fileName.replace(/^jni\//, 'lib/'));
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, bytes);
            expected.delete(entry.fileName);zip.readEntry();
          } catch (error) { zip.close(); reject(error); }
        });
      });
    });
    zip.readEntry();
  }));
  console.log(`Verified libarchive-android ${dependency.version}; four ABIs, 16 KB aligned 64-bit libraries.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
