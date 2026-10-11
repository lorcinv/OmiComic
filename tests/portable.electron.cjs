// Verify the ZIP users download by extracting and running that exact copy.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const yauzl = require('yauzl');
const asar = require('@electron/asar');
const { path7z } = require('7zip-bin-full');

test('portable ZIP contains only the runtime and reads all formats after extraction', { timeout: 240000 }, async t => {
  assert.equal(process.platform, 'win32');
  const version = require('../package.json').version;
  const archive = path.resolve(`release/OmiComic-Portable-${version}-x64.zip`);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-portable-'));
  const extracted = path.join(root, '免安装程序');
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('omicomic-portable-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const entries = [];
  const zip = await yauzl.openPromise(archive, { lazyEntries: true, strictFileNames: true });
  for await (const entry of zip.eachEntry()) {
    assert.ok(!entry.fileName.split('/').includes('..') && !path.isAbsolute(entry.fileName));
    entries.push(entry.fileName);
  }
  assert.ok(entries.includes('OmiComic.exe'));
  assert.ok(entries.includes('使用说明.txt'));
  assert.ok(!entries.some(name => /omicomic-data\.json|(^|\/)(test-results|\.localappdata|\.smoke-user-data|\.android-signing|User Data|Session Storage)(\/|$)|\.(jks|pfx|keystore)$/i.test(name)));
  assert.ok(!entries.some(name => /(^|\/)Uninstall[^/]*\.exe$/i.test(name)));
  execFileSync(path7z, ['t', archive], { windowsHide: true, stdio: 'pipe' });
  execFileSync(path7z, ['x', archive, `-o${extracted}`, '-y'], { windowsHide: true, stdio: 'pipe' });
  const appAsar = path.join(extracted, 'resources', 'app.asar');
  const manifest = JSON.parse(asar.extractFile(appAsar, 'package.json'));
  assert.equal(manifest.version, version);
  const applicationFiles = asar.listPackage(appAsar);
  assert.ok(!applicationFiles.some(name => /omicomic-data\.json|(^|[\\/])(test-results|\.localappdata|\.smoke-user-data|\.android-signing)([\\/]|$)|\.(jks|pfx|keystore)$/i.test(name)));
  const readme = await fs.readFile(path.join(extracted, '使用说明.txt'), 'utf8');
  assert.ok(readme.includes('%APPDATA%\\OmiComic\\omicomic-data.json'));
  const executable = path.join(extracted, 'OmiComic.exe');
  const runtimeEnv = { ...process.env, OMICOMIC_PACKAGED_EXE: executable };
  // A nested Node test runner must not inherit the parent runner's worker context.
  delete runtimeEnv.NODE_TEST_CONTEXT;
  const output = execFileSync(process.execPath, ['--test', 'tests/packaged.electron.cjs'], {
    env: runtimeEnv, windowsHide: true,
    encoding: 'utf8', timeout: 120000, stdio: 'pipe',
  });
  t.diagnostic(output.trim());
  const runtimeResult = JSON.parse(await fs.readFile('test-results/packaged-smoke.json', 'utf8'));
  assert.equal(runtimeResult.executable, executable, 'runtime result must come from this extracted ZIP');
  assert.equal(runtimeResult.version, version);
  assert.deepEqual(runtimeResult.formats.map(result => result.format), ['.png', '.cbz', '.cb7', '.pdf', '.epub']);
  assert.equal(runtimeResult.persistedTemporaryRecords, 5);
  const layoutOutput = execFileSync(process.execPath, ['--test', 'tests/reader-layout.electron.cjs'], {
    env: runtimeEnv, windowsHide: true, encoding: 'utf8', timeout: 120000, stdio: 'pipe',
  });
  t.diagnostic(layoutOutput.trim());
  const layoutResult = JSON.parse(await fs.readFile('test-results/reader-layout-smoke.json', 'utf8'));
  assert.equal(layoutResult.executable, executable);
  assert.equal(layoutResult.layoutPassed, true);
  const bytes = await fs.readFile(archive);
  const result = { version, archive, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), zipEntries: entries.length, userDataFilesIncluded: false, uninstallerIncluded: false, extractedRuntimePassed: true };
  await fs.writeFile('test-results/portable-smoke.json', JSON.stringify(result, null, 2) + '\n');
  t.diagnostic(JSON.stringify(result));
});
