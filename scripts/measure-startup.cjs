// Starts the built app in hidden windows with isolated data; never touches the user's library.
const { _electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

async function main() {
  const output = process.argv[2] || 'test-results/startup.json';
  const count = Number(process.argv[3] || 5);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-startup-'));
  const samples = [];
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  try {
    for (let index = 0; index < count; index++) {
      const profile = path.join(root, String(index));
      await fs.mkdir(profile);
      const loader = path.join(root, `launch-${index}.cjs`);
      await fs.writeFile(loader, `
        const { app, BrowserWindow, ipcMain } = require('electron');
        app.setPath('userData', ${JSON.stringify(profile)});
        global.__startup = { calls: {} };
        BrowserWindow.prototype.show = function () { global.__startup.readyToShowMs ??= performance.now(); };
        BrowserWindow.prototype.focus = function () {};
        const handle = ipcMain.handle.bind(ipcMain);
        ipcMain.handle = (name, handler) => handle(name, (...args) => {
          global.__startup.calls[name] = (global.__startup.calls[name] || 0) + 1;
          return handler(...args);
        });
        const before = performance.now();
        require(${JSON.stringify(path.resolve('dist-electron/main.js'))});
        global.__startup.mainModuleMs = performance.now() - before;
      `);
      let electron;
      const start = performance.now();
      try {
        electron = await _electron.launch({ executablePath: require('electron'), args: [loader], env });
        const page = await electron.firstWindow();
        await page.waitForSelector('.omi-home__empty, .omi-home__books');
        const homeReadyMs = performance.now() - start;
        const renderer = await page.evaluate(() => ({
          domContentLoadedMs: performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd,
          initialScripts: performance.getEntriesByType('resource').filter(item => /\.js(?:\?|$)/.test(item.name)).map(item => item.name),
        }));
        const main = await electron.evaluate(() => global.__startup);
        samples.push({ homeReadyMs, ...renderer, ...main });
      } finally { if (electron) await electron.close(); }
    }
    const median = key => [...samples].map(sample => sample[key]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    const result = { measuredAt: new Date().toISOString(), profile: 'isolated empty library, hidden Electron process; cached filesystem, not a cold boot',
      samples, median: Object.fromEntries(['homeReadyMs', 'domContentLoadedMs', 'mainModuleMs'].map(key => [key, median(key)])) };
    await fs.mkdir(path.dirname(output), { recursive: true });
    await fs.writeFile(output, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ output, median: result.median }));
  } finally {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('omicomic-startup-')) throw new Error('Unexpected benchmark directory');
    await fs.rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
