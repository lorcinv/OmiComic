// Exercise the shipped Android search UI against its granted SAF library.
const assert = (value, message) => { if (!value) throw new Error(message); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const wait = async (condition, label) => { const until = Date.now() + (label === 'full catalog' ? 60000 : 12000); while (!await condition()) { if (Date.now() > until) throw new Error('Timeout: ' + label + '; query=' + search()?.value + '; cards=' + JSON.stringify(names()) + '; catalog=' + JSON.stringify([...scanned.values()].filter(item => /Target|Nested|Unrelated|Artists/.test(item.path)))); await pause(80); } };
const api = window.omicomic;
const value = async promise => { const result = await promise; assert(result.ok, JSON.stringify(result)); return result.data; };
const initial = await value(api.getAppData());
const baseRoot = initial.library.roots.find(item => item.name === 'OmiRegression1141');
assert(baseRoot, 'Dedicated library fixture missing');
const root = await value(api.addLibraryRoot({ path: baseRoot.path + '/SearchJKParent', name: 'Search check' }));
await value(api.updateLibraryState({ lastActiveRootPath: root.path, lastCurrentPath: root.path }));
const changes = [];
const stage = async (relative, note, tags) => {
  const sourcePath = root.path + '/' + relative, resourceKey = 'archive:' + sourcePath;
  assert((await value(api.checkResourcePath({ path: sourcePath, type: 'archive' }))).exists, 'Fixture missing: ' + relative);
  const original = initial.resourceMeta[resourceKey];
  changes.push(original || { resourceKey, sourcePath, sourceType: 'archive', title: relative.split('/').pop(), note: '', tags: [] });
  await value(api.updateResourceMeta({ resourceKey, sourcePath, sourceType: 'archive', title: relative.split('/').pop(), note, tags }));
};
const visible = element => element && element.getBoundingClientRect().width > 0 && getComputedStyle(element).visibility !== 'hidden';
const button = label => [...document.querySelectorAll('button')].find(element => visible(element) && (element.getAttribute('aria-label') === label || element.textContent.trim() === label));
const tap = async element => { assert(element, 'Missing touch target'); element.scrollIntoView({ block: 'nearest' }); await pause(160); const rect = element.getBoundingClientRect(); window.__omiTap = { x: rect.x + rect.width / 2, y: rect.y + Math.min(55, rect.height / 2), viewport: innerWidth }; await wait(() => !window.__omiTap, 'native tap'); await pause(160); };
const search = () => document.querySelector('.mobile-library-bar input[role="searchbox"]');
const names = () => [...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card strong')].map(element => element.textContent);
const fill = async query => {
  const input = search();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, query);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  // Direct value injection replaces a complete IME transaction. End that
  // transaction before the large-catalog query waits for composition to finish.
  input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: query }));
  window.__omiKey = 66; await wait(() => !window.__omiKey, 'commit search');
  await pause(180);
};
let catalogComplete = false;
const scanned = new Map();
const originalScan = api.scanLibrary;
api.scanLibrary = async (...args) => { const result = await originalScan(...args); if (result.ok) { for (const item of result.data.items) scanned.set(item.path, item); if (result.data.complete !== false) catalogComplete = true; } return result; };
try {
  await stage('Tag match.cbz', '', ['JK']);
  await stage('Note match.cbz', 'About JK', []);
  await tap(button('打开资源库')); await wait(() => names().includes('Unrelated.cbz'), 'library root');
  await tap(button('搜索')); await wait(() => search(), 'search field');
  await fill('SearchJKParent'); await wait(() => catalogComplete, 'full catalog');
  await wait(() => names().length === 0, 'parent folder does not match descendants');
  const folderMatches = names();
  await fill(root.path); await wait(() => names().length === 0, 'full path excluded');
  await fill('jk'); await wait(() => names().length === 3 && names().includes('Name JK.cbz') && !names().includes('Unrelated.cbz'), 'filename keyword');
  const filenameMatches = names();
  await fill('tag:jk'); await wait(() => names().length === 1 && names()[0] === 'Tag match.cbz', 'tag keyword');
  const tagMatches = names();
  await fill('note:jk'); await wait(() => names().length === 1 && names()[0] === 'Note match.cbz', 'note keyword');
  const noteMatches = names();
  return { version: (await api.getAppInfo()).version, nativeTouch: true, fullCatalogChecked: true, parentPathExcluded: true, fullPathExcluded: true, folderMatches, filenameMatches, tagMatches, noteMatches };
} finally {
  api.scanLibrary = originalScan;
  for (const record of changes) await value(api.updateResourceMeta(record));
  await value(api.updateLibraryState(initial.library));
}
