const { build } = require('esbuild');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const root = path.resolve(__dirname, '..');
  const stage = path.join(root, '.packaged-app');
  if (path.dirname(stage) !== root || path.basename(stage) !== '.packaged-app') throw new Error('Unexpected staging path');
  await fs.rm(stage, { recursive: true, force: true });
  await fs.mkdir(stage, { recursive: true });
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  await fs.writeFile(path.join(stage, 'package.json'), JSON.stringify({
    name: manifest.name, version: manifest.version, productName: 'OmiComic',
    description: manifest.description, main: 'dist-electron/main.js', author: manifest.author,
    homepage: manifest.homepage, license: manifest.license, dependencies: {},
  }, null, 2));
  await fs.cp(path.join(root, 'dist'), path.join(stage, 'dist'), { recursive: true });
  const result = await build({
    absWorkingDir: root,
    entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts', epubWorker: 'electron/services/epubWorker.ts' },
    outdir: path.join(stage, 'dist-electron'), bundle: true, platform: 'node', format: 'cjs',
    target: 'node24', external: ['electron'], minify: true, sourcemap: false, legalComments: 'eof',
    define: { __OMICOMIC_BUNDLED__: 'true' }, metafile: true,
  });
  const licenses = path.join(stage, 'licenses');
  await fs.cp(path.join(root, 'licenses'), licenses, { recursive: true });
  // Include the complete license texts of bundled runtime packages, not development tools.
  const packages = new Set(['react', 'react-dom', 'scheduler', 'pdfjs-dist']);
  for (const input of Object.keys(result.metafile.inputs)) {
    const match = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
    if (match) packages.add(match[1]);
  }
  const notices = ['OmiComic third-party notices', 'Electron and Chromium notices are supplied beside OmiComic.exe.',
    '7-Zip 26.04: https://www.7-zip.org/ — source: https://www.7-zip.org/a/7z2604-src.tar.xz',
    '7-Zip is distributed unchanged. Its LGPL/BSD/unRAR terms and wrapper license are included in licenses/.', ''];
  for (const name of [...packages].sort()) {
    const folder = path.join(root, 'node_modules', name);
    const pkg = JSON.parse(await fs.readFile(path.join(folder, 'package.json'), 'utf8'));
    notices.push(`${name} ${pkg.version} — ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license)} — ${pkg.homepage || ''}`);
    const names = (await fs.readdir(folder)).filter(file => /^(license|copying|notice)(\.|$)/i.test(file));
    for (const file of names) {
      if ((await fs.stat(path.join(folder, file))).isFile()) {
        await fs.copyFile(path.join(folder, file), path.join(licenses, `${name.replaceAll('/', '-')}-${file}`));
      }
    }
  }
  await fs.writeFile(path.join(stage, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n'));
  await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
  await fs.writeFile(path.join(root, 'test-results', 'package-bundle.json'), JSON.stringify(result.metafile));
  console.log('Prepared a self-contained runtime: renderer, bundled main/preload/EPUB worker, and licenses.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
