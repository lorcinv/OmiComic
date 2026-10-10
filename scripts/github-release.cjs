// Uses Git's existing credential helper in memory; credentials are never printed or written.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createReadStream } = require('node:fs');

async function main() {
  const repo = 'lorcinv/OmiComic';
  const credentials = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\npath=lorcinv/OmiComic.git\n\n', encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  const token = credentials.split(/\r?\n/).find(line => line.startsWith('password='))?.slice('password='.length);
  if (!token) throw new Error('Git credential helper did not return a GitHub credential.');
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'OmiComic-release' };
  const api = async (route, options = {}) => {
    const response = await fetch(`https://api.github.com/repos/${repo}${route}`, { ...options, headers: { ...headers, ...options.headers } });
    if (!response.ok) throw new Error(`GitHub ${options.method || 'GET'} ${route}: HTTP ${response.status}`);
    return response.json();
  };
  if (process.argv[2] === 'check') {
    const metadata = await api('');
    const releases = await api('/releases?per_page=5');
    console.log(JSON.stringify({ repo, push: metadata.permissions?.push, releases: releases.map(release => ({ tag: release.tag_name, url: release.html_url })) }));
    return;
  }
  if (process.argv[2] !== 'publish') throw new Error('Usage: node scripts/github-release.cjs check | publish <tag> <notes-file> <asset>...');
  const [tag, notesFile, ...assets] = process.argv.slice(3);
  if (!tag || !notesFile || !assets.length) throw new Error('Tag, release notes and assets are required.');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
  const existing = (await api('/releases?per_page=100')).find(release => release.tag_name === tag);
  if (existing && !existing.draft) throw new Error('This version is already published; refusing to replace release assets.');
  const release = existing || await api('/releases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    tag_name: tag, target_commitish: commit, name: `OmiComic ${tag}`, body: await fs.readFile(notesFile, 'utf8'), draft: true, prerelease: false,
  }) });
  for (const file of assets) {
    const name = path.basename(file);
    if (release.assets.some(asset => asset.name === name)) throw new Error(`Draft already contains ${name}; inspect it before retrying.`);
    const stat = await fs.stat(file);
    const response = await fetch(`${release.upload_url.replace(/\{.*$/, '')}?name=${encodeURIComponent(name)}`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Length': String(stat.size) },
      body: createReadStream(file), duplex: 'half',
    });
    if (!response.ok) throw new Error(`Upload ${name}: HTTP ${response.status}; release remains a draft.`);
    const asset = await response.json();
    if (asset.state !== 'uploaded' || asset.size !== stat.size) throw new Error(`Upload verification failed for ${name}.`);
    console.log(`Uploaded ${name} (${stat.size} bytes)`);
  }
  const published = await api(`/releases/${release.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false }) });
  console.log(JSON.stringify({ url: published.html_url, tag: published.tag_name, assets: published.assets.map(asset => ({ name: asset.name, size: asset.size, url: asset.browser_download_url })) }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
