const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { _electron, expect } = require('@playwright/test');

(async () => {
  const base = path.resolve('.cache/home-1145'), root = path.join(base, 'Library');
  const profile = path.join(base, 'profile-' + Date.now());
  const output = path.resolve(process.env.OMICOMIC_TEST_OUTPUT || 'output/implementation-1145');
  await fs.mkdir(root, { recursive: true }); await fs.mkdir(output, { recursive: true });
  await fs.copyFile('tests/fixtures/android-archives/RAR5.cbr', path.join(root, 'Startup check.cbr'));
  const env = { ...process.env, OMICOMIC_TEST_HEADLESS: '1', OMICOMIC_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  const launch = async () => {
    const app = await _electron.launch({ executablePath: path.resolve('release/win-unpacked/OmiComic.exe'), env });
    const page = await app.firstWindow(); await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => !!window.omicomic); return { app, page };
  };
  const settings = async page => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('#settings-category-appearance').click();
    return page.getByRole('checkbox', { name: '显示主界面', exact: true });
  };
  let running;
  try {
    running = await launch();
    await expect(running.page.locator('.omi-home')).toBeVisible();
    await running.page.evaluate(async root => {
      for (const response of [await window.omicomic.addLibraryRoot({ path: root, name: 'Startup check' }),
        await window.omicomic.updateLibraryState({ lastActiveRootPath: root, lastCurrentPath: root })]) {
        if (!response.ok) throw new Error(response.error.message);
      }
    }, root);
    await running.page.getByRole('button', { name: '打开资源库', exact: true }).first().click();
    await expect(running.page.locator('.page-panel.is-visible .resource-card')).toHaveCount(1);
    const toggle = await settings(running.page); await expect(toggle).toBeChecked(); await toggle.uncheck();
    await expect.poll(async () => running.page.evaluate(async () => (await window.omicomic.getAppData()).data.settings.showHomePage)).toBe(false);
    await running.app.close(); running = undefined;

    running = await launch();
    await expect(running.page.locator('.page-panel.is-visible .resource-card')).toHaveCount(1);
    await expect(running.page.locator('.omi-home')).toHaveCount(0);
    await running.page.getByRole('button', { name: 'OmiComic', exact: true }).click();
    await expect(running.page.locator('.omi-home')).toHaveCount(0);
    await running.page.screenshot({ path: path.join(output, 'pc-direct-library.png') });
    await (await settings(running.page)).check();
    await expect.poll(async () => running.page.evaluate(async () => (await window.omicomic.getAppData()).data.settings.showHomePage)).toBe(true);
    const info = await running.page.evaluate(() => window.omicomic.getAppInfo());
    assert.equal(info.version, require('../package.json').desktopVersion);
    await running.app.close(); running = undefined;

    running = await launch(); await expect(running.page.locator('.omi-home')).toBeVisible();
    const result = { version: info.version, packagedApp: true, isolatedProfile: profile,
      defaultHome: true, disabledSettingSavedThroughUi: true, coldRestartDirectLibrary: true,
      rootNavigationKeepsHomeDisabled: true, enabledSettingSavedThroughUi: true, reenabledColdRestartHome: true };
    await fs.writeFile(path.join(output, 'pc-home-toggle-runtime.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally { if (running) await running.app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
