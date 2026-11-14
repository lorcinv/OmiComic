const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {imageAnimation, probeImageAnimation} = require('../dist-electron/shared/imageAnimation');

for (const name of ['animated.gif','animated.webp','animated.png','animated.apng','metadata.png','static.webp','static.png']) {
  test(`detects animation from ${name} content`, async () => {
    const bytes = await fs.readFile(path.join(__dirname,'fixtures/animations',name));
    const expected = !name.startsWith('static');
    assert.equal(imageAnimation(bytes), expected);
    let readBytes = 0;
    assert.equal(await probeImageAnimation(async (offset,size) => {
      readBytes += size; return bytes.subarray(offset,offset+size);
    },bytes.length),expected);
    assert.ok(readBytes < 100,'metadata probe must skip large chunks');
  });
}
test('truncated and invalid metadata cannot trigger unbounded reads', async () => {
  for (const bytes of [Buffer.alloc(0), Buffer.from('RIFF'), Buffer.from('89504e470d0a1a0affffffff74455874','hex')]) {
    assert.equal(await probeImageAnimation(async(offset,size)=>bytes.subarray(offset,offset+size),bytes.length),false);
  }
});
