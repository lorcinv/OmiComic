// Windows integration: built application, real files and IPC, isolated userData.
// Run after npm run build: node --test tests/external-open.electron.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { _electron, expect } = require('@playwright/test');

test('external opens persist and route to the running app; temporary actions preserve files', { timeout: 90000 }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-external-'));
  const profile = path.join(dir, 'profile');
  await fs.mkdir(profile);
  const loader = path.join(dir, 'launch.cjs');
  await fs.writeFile(loader, `const { app } = require('electron'); app.setPath('userData', ${JSON.stringify(profile)}); require(${JSON.stringify(path.resolve('dist-electron/main.js'))});`);
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNQ8yoBAAF+AOUqTs0pAAAAAElFTkSuQmCC', 'base64');
  const folder = path.join(dir, '漫画 A'), other = path.join(dir, '漫画 B');
  await fs.mkdir(folder); await fs.mkdir(other);
  const first = path.join(folder, '01.png'), selected = path.join(folder, '02.png'), second = path.join(other, '01.png');
  for (const file of [first, selected, second]) await fs.writeFile(file, pixel);
  let electron;
  t.after(async () => {
    if (electron) await electron.close();
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('omicomic-external-'));
    await fs.rm(dir, { recursive: true, force: true });
  });
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
  const launch = async (...files) => {
    electron = await _electron.launch({ executablePath: require('electron'), args: [loader, ...files], env: environment });
    const page = await electron.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    return page;
  };
  let page = await launch(selected);
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('2');
  await expect(page.locator('.reader-page-frame img')).toBeVisible();
  let data = (await page.evaluate(() => window.omicomic.getAppData())).data;
  assert.equal(data.library.roots.length, 0);
  assert.equal(data.temporaryOpened.length, 1);
  const denied = await page.evaluate(directory => window.omicomic.getResourcePages({ path: directory, type: 'folder' }), dir);
  assert.equal(denied.ok, false, 'opening an image must not authorize its parent directory tree');
  assert.equal(denied.error.code, 'PATH_NOT_ALLOWED');
  const key = data.temporaryOpened[0].resourceKey;
  await electron.close(); electron = null;

  page = await launch();
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await page.getByRole('button', { name: /^临时存放/ }).click();
  await expect(page.locator('[aria-label="临时存放资源列表"] .resource-card')).toHaveCount(1);
  const child = spawn(require('electron'), [loader, second], { env: environment, stdio: 'ignore', windowsHide: true });
  const exited = once(child, 'exit');
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('1');
  await expect(page.getByRole('region', { name: '漫画 B / 01.png', exact: true })).toBeVisible();
  assert.equal((await exited)[0], 0);
  assert.equal(await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: /^临时存放/ }).click();
  const cards = page.locator('[aria-label="临时存放资源列表"] .resource-card');
  await expect(cards).toHaveCount(2);
  await cards.filter({ hasText: '漫画 A' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: '删除临时引用', exact: true }).click();
  await page.getByRole('dialog', { name: '删除选中' }).getByRole('button', { name: '删除', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await cards.first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: '将所在目录加入资源库', exact: true }).click();
  await expect(page.getByRole('heading', { name: '暂无临时存放文件' })).toBeVisible();
  data = (await page.evaluate(() => window.omicomic.getAppData())).data;
  assert.equal(data.library.roots[0].path, other);
  assert.deepEqual(data.temporaryOpened, []);
  assert.ok(data.readingProgress[key]);
  for (const file of [first, selected, second]) assert.deepEqual(await fs.readFile(file), pixel);
  await electron.close(); electron = null;

  page = await launch();
  await expect(page.locator('.omi-home')).toBeVisible();
  await expect.poll(async () => (await page.evaluate(() => window.omicomic.getAppData())).data.temporaryOpened.length).toBe(0);
  const reopened = await page.evaluate(file => window.omicomic.getResourcePages({ path: file, type: 'image' }), selected);
  assert.equal(reopened.ok, true, 'removing a temporary reference must not break persisted reading progress access');
  await page.screenshot({ path: 'test-results/external-open-home.png' });
});
