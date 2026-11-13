const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
test('native Android frame zoom range matches the shared reader limits',()=>{
  const hook=readFileSync('src/hooks/useReaderZoom.ts','utf8');
  const native=readFileSync('android/src/io/github/lorcinv/omicomic/NativeReaderSurface.java','utf8');
  const minimum=Number(hook.match(/MIN_READER_ZOOM\s*=\s*([\d.]+)/)[1]);
  const maximum=Number(hook.match(/MAX_READER_ZOOM\s*=\s*([\d.]+)/)[1]);
  const frame=native.match(/next\.zoom=\(float\)Math\.max\(([\d.]+),Math\.min\(([\d.]+),args\.optDouble\("zoom",1\)\)\)/);
  assert.ok(frame);assert.equal(minimum,.25);assert.equal(Number(frame[1]),minimum);assert.equal(Number(frame[2]),maximum);
});
