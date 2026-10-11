const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'layout.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const api = {}; vm.runInNewContext(source.outputText, { exports: api });
const { canPairPages, fitPage, fitSpread, fitPanorama, panoramaScrollBounds } = api;
const viewport = { width: 1400, height: 800 };
const portrait = { width: 600, height: 900 }, broad = { width: 1200, height: 1000 };

test('broad pairs fall back to single pages and narrow windows unpair portraits', () => {
  assert.equal(canPairPages(portrait, portrait, viewport, 'fit-window'), true);
  assert.equal(canPairPages(broad, portrait, viewport, 'fit-height'), false);
  assert.equal(canPairPages(portrait, portrait, { width: 750, height: 800 }, 'fit-window'), false);
  assert.equal(canPairPages(portrait, portrait, viewport, 'original'), false);
  const pair = fitSpread([portrait, portrait], viewport, 'fit-window');
  assert.ok(pair[0].width + pair[1].width <= viewport.width);
  assert.ok(pair.every(size => size.height <= viewport.height));
});

test('only fit-window contains both axes; width and height modes respect their chosen axis', () => {
  for (const size of [{ width: 18000, height: 400 }, { width: 400, height: 18000 }]) {
    for (const mode of ['fit-window', 'fit-height', 'fit-width']) {
      const fitted = fitPage(size, viewport, mode);
      if (mode === 'fit-window') assert.ok(fitted.width <= viewport.width + .01 && fitted.height <= viewport.height + .01);
      else if (mode === 'fit-height') assert.equal(fitted.height, viewport.height);
      else assert.equal(fitted.width, viewport.width);
      assert.ok(Math.abs(fitted.width / fitted.height - size.width / size.height) < .0001);
    }
    assert.equal(fitPage(size, viewport, 'original'), size);
    const vertical = fitPanorama(size, viewport, true), horizontal = fitPanorama(size, viewport, false);
    assert.equal(vertical.width, viewport.width);
    assert.equal(horizontal.height, viewport.height);
  }
});

test('pair eligibility follows the selected scale without overriding width or height', () => {
  assert.equal(canPairPages(portrait, portrait, viewport, 'fit-width'), false);
  assert.equal(canPairPages(broad, broad, viewport, 'fit-width'), true);
  for (const mode of ['fit-width', 'fit-height']) {
    const pair = fitSpread([broad, broad], viewport, mode);
    if (mode === 'fit-width') assert.equal(pair[0].width + pair[1].width, viewport.width);
    else assert.equal(pair[0].height, viewport.height);
  }
});

test('a single long panorama can reach both actual edges, not just its center', () => {
  const { min, max } = panoramaScrollBounds(4000, 4000, 8000, 8000, 1400, 4000);
  assert.equal(min, -3300); assert.equal(max, 3300);
  const short = panoramaScrollBounds(300, 1500, 600, 600, 1400, 900);
  assert.equal(short.min, -600); assert.equal(short.max, 600);
});
