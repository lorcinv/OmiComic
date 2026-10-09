// Reproducible real-filesystem stress test: node --test electron/services/directoryService.test.cjs
// Creates 11,000 valid tiny PNGs (8 KiB each), then removes its own temporary tree.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const ts = require('typescript');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function loadService() {
  const text = await fs.readFile(path.join(__dirname, 'directoryService.ts'), 'utf8');
  const code = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require, AbortController });
  return { ...exports, code };
}

test('11,000-image directory stress, natural sort, errors, root security and rapid cancellation', { timeout: 120000 }, async t => {
  const service = await loadService();
  if (global.gc) global.gc();
  const baselineRss = process.memoryUsage().rss;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-directory-stress-'));
  await fs.chmod(root, 0o755);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-outside-'));
  let peakRss = baselineRss;
  const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 10);
  const metrics = { images: 11000, imageWidth: 1, imageHeight: 1, bytesPerImageIncludingPadding: 8192, imageBytes: 11000 * 8192, exposedGc: typeof global.gc === 'function', baselineRssMiB: baselineRss / 1024 / 1024, endRssMiB: 0, afterCleanupRssMiB: 0, fixtureMs: 0, scanMs: 0, imageListMs: 0, nestedScansMs: 0, cancellationMs: 0, cancelledStats: 0, rapidScansMs: 0, maxActiveStats: 0, peakRssMiB: 0, permissionTest: '' };
  let active = 0;
  const measuredStat = async file => {
    active++;
    metrics.maxActiveStats = Math.max(metrics.maxActiveStats, active);
    try { return await fs.stat(file); }
    finally { active--; }
  };
  try {
    const start = performance.now();
    const png = await fs.readFile(path.join(__dirname, '../../tests/fixtures/images/pixel.png'));
    assert.equal(png.readUInt32BE(16), 1); assert.equal(png.readUInt32BE(20), 1);
    const image = Buffer.alloc(8192); png.copy(image);
    const files = Array.from({ length: 10000 }, (_, i) => path.join(root, `page${i + 1}.png`));
    for (let folder = 1; folder <= 10; folder++) {
      const directory = path.join(root, `chapter${folder}`);
      await fs.mkdir(directory);
      for (let i = 1; i <= 100; i++) files.push(path.join(directory, `page${i}.png`));
    }
    for (let i = 0; i < files.length; i += 64) await Promise.all(files.slice(i, i + 64).map(file => fs.writeFile(file, image)));
    await fs.writeFile(path.join(root, 'notes.txt'), 'synthetic fixture');
    await fs.writeFile(path.join(root, 'book.pdf'), '%PDF-fixture');
    await fs.symlink(path.join(root, 'missing'), path.join(root, 'broken.png'));
    await fs.writeFile(path.join(outside, 'secret.png'), png);
    await fs.symlink(path.join(outside, 'secret.png'), path.join(root, 'escaped.png'));
    await fs.symlink(outside, path.join(root, 'escaped-folder'));
    metrics.fixtureMs = performance.now() - start;

    let time = performance.now();
    const entries = await service.scanDirectory(root, { authorizedRoot: root, stat: measuredStat });
    metrics.scanMs = performance.now() - time;
    assert.equal(entries.length, 10015);
    assert.equal(entries[0].name, 'chapter1');
    assert.equal(entries[9].name, 'chapter10');
    assert.ok(entries.findIndex(entry => entry.name === 'page2.png') < entries.findIndex(entry => entry.name === 'page10.png'));
    assert.equal(entries.find(entry => entry.name === 'page10000.png').size, 8192);
    assert.equal(entries.find(entry => entry.name === 'broken.png').hasError, true);
    assert.equal(entries.find(entry => entry.name === 'escaped.png').hasError, true);
    assert.equal(entries.find(entry => entry.name === 'escaped-folder').hasError, true);

    time = performance.now();
    const images = await service.listDirectoryImages(root, { authorizedRoot: root });
    metrics.imageListMs = performance.now() - time;
    assert.equal(images.length, 10000);
    assert.equal(images[0], 'page1.png'); assert.equal(images[9999], 'page10000.png');
    time = performance.now();
    const nested = await Promise.all(Array.from({ length: 10 }, (_, i) => service.scanDirectory(path.join(root, `chapter${i + 1}`), { authorizedRoot: root, stat: measuredStat })));
    metrics.nestedScansMs = performance.now() - time;
    assert.equal(nested.flat().length, 1000);
    assert.ok(metrics.maxActiveStats <= service.DIRECTORY_STAT_CONCURRENCY);

    await assert.rejects(service.scanDirectory(outside, { authorizedRoot: root }), error => error.code === 'PATH_NOT_ALLOWED');
    await assert.rejects(service.scanDirectory(path.join(root, 'escaped-folder'), { authorizedRoot: root }), error => error.code === 'PATH_NOT_ALLOWED');
    await assert.rejects(service.listDirectoryImages(path.join(root, 'escaped-folder'), { authorizedRoot: root }), error => error.code === 'PATH_NOT_ALLOWED');
    await assert.rejects(service.scanDirectory(path.join(root, 'missing'), { authorizedRoot: root }), error => error.code === 'ENOENT');
    const preCancelled = new AbortController(); preCancelled.abort();
    await assert.rejects(service.scanDirectory(root, { authorizedRoot: root, signal: preCancelled.signal }), error => error.name === 'AbortError');

    const controller = new AbortController();
    time = performance.now();
    const cancelled = service.scanDirectory(root, { authorizedRoot: root, signal: controller.signal, stat: async file => { metrics.cancelledStats++; await delay(3); return measuredStat(file); } });
    const cancelledAssertion = assert.rejects(cancelled, error => error.name === 'AbortError');
    await delay(35); controller.abort(); await cancelledAssertion;
    metrics.cancellationMs = performance.now() - time;
    assert.ok(metrics.cancelledStats < 1000, `${metrics.cancelledStats} calls unexpectedly launched after cancellation`);

    time = performance.now();
    const scans = [];
    let previous;
    for (let index = 0; index < 12; index++) {
      previous?.abort();
      const current = new AbortController(); previous = current;
      scans.push(service.scanDirectory(root, { authorizedRoot: root, signal: current.signal, stat: measuredStat }).then(result => ({ result }), error => ({ error })));
      await delay(5);
    }
    const outcomes = await Promise.all(scans);
    metrics.rapidScansMs = performance.now() - time;
    assert.equal(outcomes[11].result.length, 10015);
    assert.ok(outcomes.slice(0, 11).every(outcome => outcome.error?.name === 'AbortError'));
    assert.ok(metrics.maxActiveStats <= service.DIRECTORY_STAT_CONCURRENCY);

    // Verify real EACCES under an unprivileged UID when this test runs as root.
    const denied = path.join(root, 'permission-denied');
    await fs.mkdir(denied, { mode: 0o000 });
    if (process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() === 0) {
      const script = `const exports={}; new Function('exports','require',${JSON.stringify(service.code)})(exports,require); exports.scanDirectory(${JSON.stringify(denied)},{authorizedRoot:${JSON.stringify(root)}}).then(()=>process.exit(2),e=>{ console.log(e.code); process.exit(e.code==='EACCES'?0:3); });`;
      const result = spawnSync(process.execPath, ['-e', script], { uid: 65534, gid: 65534, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr || result.error?.message);
      assert.equal(result.stdout.trim(), 'EACCES');
      metrics.permissionTest = 'real EACCES verified as uid 65534';
    } else if (process.platform !== 'win32') {
      await assert.rejects(service.scanDirectory(denied, { authorizedRoot: root }), error => error.code === 'EACCES');
      metrics.permissionTest = 'real EACCES verified';
    } else metrics.permissionTest = 'chmod permission case requires POSIX; run Windows ACL smoke separately';
    await fs.chmod(denied, 0o755);
    // Deterministic entry-level failure preserves metadata instead of failing the whole directory.
    const withDeniedEntry = await service.scanDirectory(path.join(root, 'chapter1'), { authorizedRoot: root, stat: async file => { if (file.endsWith('page2.png')) throw Object.assign(new Error('denied'), { code: 'EACCES' }); return fs.stat(file); } });
    assert.equal(withDeniedEntry.length, 100);
    assert.equal(withDeniedEntry.find(entry => entry.name === 'page2.png').hasError, true);
    metrics.endRssMiB = process.memoryUsage().rss / 1024 / 1024;
    metrics.peakRssMiB = Math.max(peakRss, process.memoryUsage().rss) / 1024 / 1024;
  } finally {
    clearInterval(sampler);
    await fs.chmod(path.join(root, 'permission-denied'), 0o755).catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
  if (global.gc) global.gc();
  metrics.afterCleanupRssMiB = process.memoryUsage().rss / 1024 / 1024;
  for (const key of Object.keys(metrics)) if (typeof metrics[key] === 'number') metrics[key] = Math.round(metrics[key] * 100) / 100;
  t.diagnostic(JSON.stringify(metrics));
});
