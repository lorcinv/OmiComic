const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const output = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, 'imageProcessing.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const api = {}; vm.runInNewContext(output.outputText, { exports: api, Uint8ClampedArray, Float32Array });
const { processPixels } = api;
function raster(width, height, color) {
  const result = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; result.set([...color(x, y), 255], i); }
  return result;
}
test('processing preserves input, alpha, defaults and crisp fine lines/halftones', () => {
  const input = raster(64, 64, (x, y) => (x === 31 || x > 45 && (x + y) % 2 ? [0, 0, 0] : [255, 255, 255]));
  input[3] = 70; const copy = input.slice();
  assert.deepEqual(processPixels(input, 64, 64, 0, 0), input);
  assert.deepEqual(processPixels(input, 64, 64, 100, 100), input);
  assert.deepEqual(input, copy);
});
test('bilateral denoise reduces low amplitude noise without bleeding high contrast edges', () => {
  const input = raster(64, 64, (x, y) => { const value = (x < 32 ? 65 : 190) + ((x * 17 + y * 11) % 13 - 6); return [value, value, value]; });
  const result = processPixels(input, 64, 64, 100, 0);
  let before = 0, after = 0;
  for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) { const i = (y * 64 + x) * 4, base = x < 32 ? 65 : 190; before += (input[i] - base) ** 2; after += (result[i] - base) ** 2; }
  assert.ok(after < before * .6, `${after} < ${before} * .6`);
  assert.ok(result[(32 * 64 + 31) * 4] < 75 && result[(32 * 64 + 32) * 4] > 180);
});
test('sharpening has real bounded effect at soft text edges and leaves flat areas alone', () => {
  const input = raster(64, 64, x => { const value = x < 30 ? 80 : x === 30 ? 100 : x === 31 ? 160 : 190; return [value, value, value]; });
  const result = processPixels(input, 64, 64, 0, 100);
  assert.notDeepEqual(result, input);
  for (let i = 0; i < input.length; i++) assert.ok(Math.abs(result[i] - input[i]) <= 17);
  assert.equal(result[4 * 20], input[4 * 20]);
});
