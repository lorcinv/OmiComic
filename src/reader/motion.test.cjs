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
const { advanceInertia, estimateReleaseVelocity, trimPrefetchBuffer, mouseDragGain, acceleratedMouseVelocity, MAX_MOTION_SPEED, MIN_MOTION_SPEED } = exportsObject;
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const { touchDragGain, acceleratedTouchVelocity, estimateTouchVelocity, touchInertiaTime } = exportsObject;

test('fast touch release corrections of any size cannot start a reverse fling', () => {
  for (const vertical of [false,true]) for (const sign of [-1,1]) for (const correction of [8,14,24,40,80]) {
    const held=[0,90,190,300].map((distance,i)=>({x:distance*sign,y:distance*sign,time:1+i*16}));
    const released=exportsObject.touchReleaseSample(held,{x:(300-correction)*sign,y:(300-correction)*sign,time:57},vertical);
    near(vertical?released.y:released.x,300*sign);
    const velocity=estimateTouchVelocity([...held,released],vertical);
    assert.ok((vertical?velocity.y:velocity.x)*sign>1);
    const paused=exportsObject.touchReleaseSample(held,{x:(300-correction)*sign,y:(300-correction)*sign,time:220},vertical);
    near(vertical?estimateTouchVelocity([...held,paused],true).y:estimateTouchVelocity([...held,paused],false).x,0);
  }
});

test('a deliberate held reversal and forward release retain their final direction', () => {
  const held=[0,-30,-60,-90,-70,-40].map((x,i)=>({x,y:0,time:1+i*16}));
  const released=exportsObject.touchReleaseSample(held,{x:-25,y:0,time:89},false);
  near(released.x,-25);assert.ok(estimateTouchVelocity([...held,released],false).x>0);
});

test('touch preserves slow placement and gains progressively for quick sweeps', () => {
  near(touchDragGain(0.2), 1);
  near(touchDragGain(0.45), 1);
  assert.ok(touchDragGain(1.5) > 1.2);
  assert.ok(touchDragGain(3) > touchDragGain(1.5));
  near(touchDragGain(100), 1.65);
  near(acceleratedTouchVelocity(-2), -acceleratedTouchVelocity(2));
  near(acceleratedTouchVelocity(100), MAX_MOTION_SPEED);
});

test('a reversing finger releases in its latest direction without old momentum', () => {
  const samples = [0, -25, -50, -75, -100, -80, -60].map((x, i) => ({x, y: -x, time: i * 10}));
  assert.ok(estimateTouchVelocity(samples, false).x > 1.9);
  assert.ok(estimateTouchVelocity(samples, true).y < -1.9);
  near(estimateTouchVelocity([...samples, {x:-60,y:60,time:220}], false).x, 0);
});

test('WebView release correction cannot reverse an otherwise forward touch fling', () => {
  const samples=[{x:820.7,time:0},{x:786.7,time:10},{x:754.1,time:30},{x:732,time:54},{x:740,time:69}].map(p=>({...p,y:-p.x}));
  assert.ok(estimateTouchVelocity(samples,false).x < -0.8);
  assert.ok(estimateTouchVelocity(samples,true).y > 0.8);
  near(estimateTouchVelocity([...samples,{x:740,y:-740,time:220}],false).x,0);
});

test('touch inertia is refresh-rate independent and keeps the initial release speed', () => {
  const speed = acceleratedTouchVelocity(2), decay = touchInertiaTime(speed);
  assert.ok(decay > 300 && decay <= 400);
  assert.ok(advanceInertia(speed, 600, decay).distance > advanceInertia(2, 600).distance * 1.6);
  for (const hz of [30, 60, 90, 120, 144]) {
    let velocity=speed, distance=0;
    for(let frame=0;frame<hz;frame++){
      const next=advanceInertia(velocity,1000/hz,decay);distance+=next.distance;velocity=next.velocity;
    }
    const expected=advanceInertia(speed,1000,decay);
    near(distance,expected.distance);near(velocity,expected.velocity);
  }
  near(advanceInertia(speed,0,decay).velocity,speed);
});

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
  near(estimateReleaseVelocity(samples, false).x, -MAX_MOTION_SPEED);
  near(estimateReleaseVelocity(samples, true).y, MAX_MOTION_SPEED);
});

test('fast mouse sweeps gain speed while precise drags remain one-to-one', () => {
  near(mouseDragGain(0.2), 1);
  assert.ok(mouseDragGain(2) > mouseDragGain(1));
  assert.ok(mouseDragGain(4) > mouseDragGain(2));
  assert.ok(acceleratedMouseVelocity(4) > acceleratedMouseVelocity(2) * 2);
  near(acceleratedMouseVelocity(-2), -acceleratedMouseVelocity(2));
  near(acceleratedMouseVelocity(100), MAX_MOTION_SPEED);
  const medium = estimateReleaseVelocity(swipe(0).map(sample => ({ ...sample, x: sample.x * 4 })), false).x;
  const fast = estimateReleaseVelocity(swipe(0).map(sample => ({ ...sample, x: sample.x * 8 })), false).x;
  assert.ok(fast > medium * 1.9, 'fast swipes must not plateau at the old 3.2px/ms cap');
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
