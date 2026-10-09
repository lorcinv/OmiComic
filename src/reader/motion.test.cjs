// Run: node --test src/reader/motion.test.cjs (uses the project's TypeScript).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, 'motion.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const exportsObject = {};
vm.runInNewContext(compiled.outputText, { exports: exportsObject });
const { advanceInertia, estimateReleaseVelocity, trimPrefetchBuffer, MIN_MOTION_SPEED } = exportsObject;
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);

function travel(intervals, speed = 3.2) {
  let velocity = speed, distance = 0;
  for (const interval of intervals) {
    const step = advanceInertia(velocity, interval);
    velocity = step.velocity;
    distance += step.distance;
  }
  return { velocity, distance };
}

test('30/60/120/144 Hz produce the same inertial distance and speed', () => {
  const expected = advanceInertia(3.2, 1000);
  for (const hz of [30, 60, 120, 144]) {
    const actual = travel(Array(hz).fill(1000 / hz));
    near(actual.distance, expected.distance);
    near(actual.velocity, expected.velocity);
  }
  const stalled = travel([16, 16, 100, 200, 168, 500]);
  near(stalled.distance, expected.distance);
});

test('inertia slows continuously past 720 ms, then settles without sign reversal', () => {
  assert.ok(advanceInertia(3.2, 720).velocity > MIN_MOTION_SPEED);
  let velocity = -3.2, distance = 0, frames = 0;
  while (Math.abs(velocity) >= MIN_MOTION_SPEED) {
    const step = advanceInertia(velocity, 1000 / 120);
    assert.ok(step.velocity <= 0 && step.distance <= 0);
    assert.ok(Math.abs(step.velocity) < Math.abs(velocity));
    velocity = step.velocity; distance += step.distance; frames++;
    assert.ok(frames < 1000);
  }
  assert.ok(distance > -768 && distance < -760);
});

const swipe = delay => [...Array.from({ length: 7 }, (_, i) => ({ time: i * 10, x: i * 10, y: -i * 20 })), { time: 60 + delay, x: 60, y: -120 }];
test('50 ms release pause no longer drops inertia abruptly', () => {
  const before = estimateReleaseVelocity(swipe(49), false).x;
  const after = estimateReleaseVelocity(swipe(51), false).x;
  assert.ok(before > 0 && after > 0);
  assert.ok(Math.abs(before - after) < 0.03);
  near(estimateReleaseVelocity(swipe(0), false).x, 1);
  near(estimateReleaseVelocity(swipe(0), true).y, -2);
});

test('holding still, a tap, and empty samples do not initiate inertia', () => {
  near(estimateReleaseVelocity(swipe(140), false).x, 0);
  near(estimateReleaseVelocity([], false).x, 0);
  near(estimateReleaseVelocity([{ time: 0, x: 1, y: 1 }, { time: 100, x: 1, y: 1 }], true).y, 0);
});

test('high-rate coalesced pointer samples remain bounded in velocity', () => {
  const samples = Array.from({ length: 96 }, (_, i) => ({ time: 1 + i / 8, x: -i * 4, y: i * 8 }));
  near(estimateReleaseVelocity(samples, false).x, -3.2);
  near(estimateReleaseVelocity(samples, true).y, 3.2);
});

test('100,000-page speculative traversal does not grow buffer with library size', () => {
  const buffer = new Map();
  let maximum = 0;
  for (let center = 0; center < 100000; center++) {
    buffer.set(center + 12, 1024 * 1024);
    trimPrefetchBuffer(buffer, center, 16 * 1024 * 1024, value => value);
    maximum = Math.max(maximum, buffer.size);
    assert.ok(buffer.size <= 16);
  }
  assert.equal(maximum, 16);
});

test('zero budget retains only essential nearby pages, including oversized images', () => {
  const buffer = new Map(Array.from({ length: 200 }, (_, index) => [index, 64 * 1024 * 1024]));
  trimPrefetchBuffer(buffer, 100, 0, value => value);
  assert.equal(buffer.size, 5);
  assert.deepEqual([...buffer.keys()], [98, 99, 100, 101, 102]);
});
