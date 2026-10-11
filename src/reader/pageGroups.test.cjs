const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, 'pageGroups.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
const api = {}; vm.runInNewContext(code.outputText, { exports: api });
const { groupIndices, nextGroup, previousGroup, normalizeGroup } = api;
const settings = anchor => ({ readerPageMode: 'double', smartDetectSpreadPage: true, pairingAnchor: anchor });
const indices = (...args) => Array.from(groupIndices(...args));

test('double-page starts with 1+2 and reaches complete final pairs for even and odd books', () => {
  for (const count of [1, 2, 7, 8, 79, 80]) {
    const seen = []; let at = 0;
    for (let turn = 0; turn < count; turn++) {
      const group = indices(at, count, settings(0)); seen.push(...group);
      if (group.includes(count - 1)) break;
      const next = nextGroup(at, count, settings(0), () => false);
      assert.equal(previousGroup(next, count, settings(0), () => false), at); at = next;
    }
    assert.deepEqual(seen, Array.from({ length: count }, (_, i) => i));
    assert.ok(indices(count - 1, count, settings(0)).includes(count - 1));
  }
});

test('entering at page 6 pairs 6+7, then 8+9, and walks backward without duplicate or skipped pages', () => {
  const config = settings(5);
  assert.deepEqual(indices(5, 10, config), [5, 6]);
  assert.deepEqual(indices(nextGroup(5, 10, config, () => false), 10, config), [7, 8]);
  assert.deepEqual(indices(9, 10, config), [9]);
  assert.deepEqual(indices(previousGroup(5, 10, config, () => false), 10, config), [3, 4]);
  assert.deepEqual(indices(0, 10, config), [0]);
  assert.deepEqual(indices(1, 10, config), [1, 2]);
});

test('spread boundaries stay single on either side of an arbitrary entry page', () => {
  for (let anchor = 0; anchor < 10; anchor++) {
    const config = settings(anchor), spread = i => i === 1 || i === 4 || i === 8;
    const groups = new Map();
    for (let page = 0; page < 10; page++) {
      const start = normalizeGroup(page, 10, config, spread);
      const group = indices(page, 10, config, spread);
      assert.ok(group.includes(page));
      if (group.some(spread)) assert.equal(group.length, 1);
      groups.set(start, group);
    }
    assert.deepEqual([...groups.values()].flat(), Array.from({ length: 10 }, (_, i) => i));
    assert.equal(normalizeGroup(anchor, 10, config, spread), anchor);
  }
});
