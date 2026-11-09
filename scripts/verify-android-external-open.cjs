const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { XMLParser } = require('fast-xml-parser');
const root = path.resolve(__dirname, '..');
const array = value => value == null ? [] : Array.isArray(value) ? value : [value];
const requiredMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'application/pdf', 'application/epub+zip', 'application/x-mobipocket-ebook', 'application/x-mobi', 'application/zip', 'application/x-zip', 'application/x-zip-compressed', 'application/x-cbz', 'application/vnd.comicbook+zip', 'application/x-rar', 'application/x-rar-compressed', 'application/vnd.rar', 'application/x-cbr', 'application/vnd.comicbook-rar', 'application/x-7z-compressed', 'application/x-cb7', 'application/octet-stream'];

function checkActivity(activity) {
  const filters = array(activity?.['intent-filter']);
  for (const action of ['VIEW', 'SEND']) {
    const filter = filters.find(f => array(f.action).some(a => a['android:name'] === `android.intent.action.${action}`) && array(f.data).some(d => d['android:mimeType']));
    if (!filter || !array(filter.category).some(c => c['android:name'] === 'android.intent.category.DEFAULT')) throw new Error(`Missing Android ${action} association`);
    const data = array(filter.data);
    for (const mime of requiredMime) if (!data.some(d => d['android:mimeType'] === mime)) throw new Error(`Missing ${action} MIME: ${mime}`);
    if (action === 'VIEW') for (const scheme of ['content', 'file']) if (!data.some(d => d['android:scheme'] === scheme)) throw new Error(`Missing VIEW scheme: ${scheme}`);
  }
  const filenames = filters.find(f => array(f.action).some(a => a['android:name'] === 'android.intent.action.VIEW') && !array(f.data).some(d => d['android:mimeType']));
  for (const suffix of ['cbz', 'cbr', 'cb7', 'zip', 'rar', '7z', 'pdf', 'epub', 'mobi', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp']) {
    if (!array(filenames?.data).some(d => d['android:pathSuffix'] === `.${suffix}` || String(d['android:pathPattern']).endsWith(`.${suffix}`))) throw new Error(`Missing filename association: ${suffix}`);
  }
}
function verifySource(xml = fs.readFileSync(path.join(root, 'android/AndroidManifest.xml'), 'utf8')) {
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(xml);
  const activity = array(parsed.manifest?.application?.activity).find(a => a['android:name'] === '.MainActivity');
  if (String(activity?.['android:exported']) !== 'true') throw new Error('MainActivity must accept external file intents');
  checkActivity(activity);
  for (const [file, tokens] of [
    ['android/src/io/github/lorcinv/omicomic/MainActivity.java', ['onNewIntent(', 'receiveExternalFile(getIntent())', 'takeExternalFile', 'library.openExternalFile']],
    ['android/src/io/github/lorcinv/omicomic/LocalLibrary.java', ['openExternalFile(', 'ExternalFiles.supported']],
    ['android/src/io/github/lorcinv/omicomic/ExternalFiles.java', ['ACTION_VIEW', 'ACTION_SEND']],
    ['src/android/data.ts', ['takeExternalFile', 'omi-external-open']],
  ]) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const token of tokens) if (!source.includes(token)) throw new Error(`Missing external-open handler in ${file}: ${token}`);
  }
}
function verifyApk(apk, aapt) {
  const dump = execFileSync(aapt, ['dump', 'xmltree', apk, 'AndroidManifest.xml'], { encoding: 'utf8' });
  // Reconstruct aapt's element tree so checks stay within MainActivity's filters.
  const tree = {}, stack = [{ indent: -1, value: tree }];
  for (const line of dump.split(/\r?\n/)) {
    const element = /^(\s*)E: ([\w-]+)/.exec(line);
    if (element) {
      const indent = element[1].length;
      while (stack.at(-1).indent >= indent) stack.pop();
      const parent = stack.at(-1).value, value = {};
      (parent[element[2]] ??= []).push(value); stack.push({ indent, value });
    } else {
      const attribute = /^\s*A: (android:\w+)(?:\([^)]*\))?="([^"]*)"/.exec(line);
      if (attribute) stack.at(-1).value[attribute[1]] = attribute[2];
    }
  }
  const activity = tree.manifest?.[0]?.application?.[0]?.activity?.find(a => a['android:name'] === '.MainActivity');
  checkActivity(activity);
}
module.exports = { verifySource, verifyApk };
if (require.main === module) {
  verifySource();
  if (process.argv[2]) verifyApk(process.argv[2], process.argv[3]);
  console.log(`Android external-open contract verified${process.argv[2] ? ' in packaged APK' : ' in source'}.`);
}
