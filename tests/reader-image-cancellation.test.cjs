const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SharedImageRead } = require('../dist-electron/services/sharedImageRead');
const { ReaderImageRequests } = require('../dist-electron/services/readerImageRequests');

test('one cancelled subscriber does not cancel shared image bytes needed by another', async () => {
  const shared = new SharedImageRead(), a = new AbortController(), b = new AbortController();
  let calls = 0, source, finish;
  const load = signal => { calls++; source = signal; return new Promise(resolve => { finish = resolve; }); };
  const first = shared.read(load, a.signal), second = shared.read(load, b.signal);
  const cancelled = assert.rejects(first, { name: 'AbortError' });
  await Promise.resolve(); a.abort(); await cancelled;
  assert.equal(calls, 1); assert.equal(source.aborted, false);
  finish(Buffer.from('source bytes')); assert.equal((await second).toString(), 'source bytes');
});

test('abandoned image reads abort once and a retry never joins the cancelled promise', async () => {
  const shared = new SharedImageRead(), controller = new AbortController();
  let aborts = 0, oldFinish;
  const first = shared.read(signal => { signal.addEventListener('abort', () => aborts++); return new Promise(resolve => { oldFinish = resolve; }); }, controller.signal);
  const cancelled = assert.rejects(first, { name: 'AbortError' });
  await Promise.resolve(); controller.abort(); await cancelled;
  assert.equal(aborts, 1);
  const retry = await shared.read(async () => Buffer.from('new read'));
  assert.equal(retry.toString(), 'new read');
  oldFinish(Buffer.from('late old result')); await Promise.resolve();
  await assert.rejects(shared.read(async () => { throw new Error('decode failed'); }), /decode failed/);
  assert.equal((await shared.read(async () => Buffer.from('recovered'))).toString(), 'recovered');
});

test('page cancellation is sender-scoped and retiring a book stops its pending requests', () => {
  const requests = new ReaderImageRequests(), one = requests.begin(10, 1, 100), two = requests.begin(11, 1, 100), next = requests.begin(10, 2, 101);
  requests.cancel(10, 1); assert.equal(one.signal.aborted, true); assert.equal(two.signal.aborted, false);
  requests.retire(101); assert.equal(two.signal.aborted, true); assert.equal(next.signal.aborted, false);
  one.end(); two.end(); next.end();
  const reused = requests.begin(10, 2, 102); requests.cancel(10, 2); assert.equal(reused.signal.aborted, true); reused.end();
});
