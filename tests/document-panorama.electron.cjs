// Optional real-file benchmark. Reads COMIC_PERF_FILE without changing it or the user's profile.
// Build first, then set COMIC_PERF_FILE and run node --test tests/document-panorama.electron.cjs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron, expect } = require('@playwright/test');

test('real document panorama latency and scroll responsiveness', { timeout: 90000, skip: !process.env.COMIC_PERF_FILE }, async t => {
  const source = process.env.COMIC_PERF_FILE;
  const before = await fs.stat(source);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-panorama-'));
  const profile = path.join(dir, 'profile'); await fs.mkdir(profile);
  const loader = path.join(dir, 'launch.cjs');
  await fs.writeFile(loader, `const { app } = require('electron'); app.setPath('userData', ${JSON.stringify(profile)}); require(${JSON.stringify(path.resolve('dist-electron/main.js'))});`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ executablePath: require('electron'), args: [loader, source], env });
  t.after(async () => { await app.close(); assert.equal(path.dirname(dir), path.resolve(os.tmpdir())); assert.ok(path.basename(dir).startsWith('omicomic-panorama-')); await fs.rm(dir, { recursive: true, force: true }); });
  const page = await app.firstWindow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const content = '.reader-page-frame img, .reader-page-frame canvas, .reader-chapter';
  await expect(page.locator(content).first()).toBeVisible({ timeout: 30000 });
  const input = page.locator('.reader-page-jump input');
  await input.fill('13'); await input.press('Enter');
  await expect(page.locator('[data-reader-page-index="12"]').locator('img, canvas, .reader-chapter')).toBeVisible();
  await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
  await expect(page.locator('.reader-stage')).toHaveClass(/is-panorama/);
  await page.locator('.reader-stage').hover();
  await page.evaluate(() => {
    window.__perf = { gaps: [], encodedMs: 0, encodes: 0, running: true, mismatch: 0, samples: 0 };
    const encode = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(...args) { const start = performance.now(); const result = encode.apply(this, args); window.__perf.encodedMs += performance.now() - start; window.__perf.encodes++; return result; };
    let previous = performance.now();
    const frame = now => {
      const p = window.__perf; if (!p.running) return;
      p.gaps.push(now - previous); previous = now;
      const stage = document.querySelector('.reader-stage').getBoundingClientRect(), center = (stage.left + stage.right) / 2;
      const figure = [...document.querySelectorAll('.reader-page-spread > figure')].find(f => { const r = f.getBoundingClientRect(); return r.left <= center && r.right >= center; });
      if (figure) { p.samples++; if (Number(figure.dataset.readerPageIndex) + 1 !== Number(document.querySelector('.reader-page-jump input').value)) p.mismatch++; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  for (let i = 0; i < 65; i++) { await page.mouse.wheel(0, 380); await page.waitForTimeout(16); }
  const stopped = Date.now();
  await expect.poll(() => page.evaluate(() => {
    const stage = document.querySelector('.reader-stage').getBoundingClientRect(), x = (stage.left + stage.right) / 2, y = (stage.top + stage.bottom) / 2;
    const figure = [...document.querySelectorAll('.reader-page-spread > figure')].find(f => { const r = f.getBoundingClientRect(); return r.left <= x && r.right >= x && r.top <= y && r.bottom >= y; });
    const media = figure?.querySelector('img,canvas,iframe');
    return !!media && (media.tagName !== 'IMG' || media.complete && media.naturalWidth > 0);
  }), { timeout: 25000 }).toBe(true);
  const metrics = await page.evaluate(() => { window.__perf.running = false; const p = window.__perf; return { maxFrameGap: Math.round(Math.max(...p.gaps)), slowFrames: p.gaps.filter(n => n > 50).length, encodedMs: Math.round(p.encodedMs), encodes: p.encodes, mismatchedFrames: p.mismatch, frames: p.samples, lastPage: Number(document.querySelector('.reader-page-jump input').value) }; });
  t.diagnostic(JSON.stringify({ type: path.extname(source), waitAfterScrollMs: Date.now() - stopped, ...metrics }));
  const after = await fs.stat(source); assert.equal(after.size, before.size); assert.equal(after.mtimeMs, before.mtimeMs);
});
