const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { verifySource } = require('../scripts/verify-android-external-open.cjs');
test('Android external-open declarations and handlers ship together', () => verifySource());
test('a launcher-only manifest cannot pass the release gate', () => {
  const xml = fs.readFileSync(path.join(__dirname, '../android/AndroidManifest.xml'), 'utf8');
  assert.throws(() => verifySource(xml.replace(/<intent-filter>[\s\S]*?<\/intent-filter>/g, '')), /Missing Android VIEW/);
});
test('losing the generic file-manager MIME is a release failure', () => {
  const xml = fs.readFileSync(path.join(__dirname, '../android/AndroidManifest.xml'), 'utf8');
  assert.throws(() => verifySource(xml.replaceAll('<data android:mimeType="application/octet-stream"/>', '')), /Missing VIEW MIME/);
});
