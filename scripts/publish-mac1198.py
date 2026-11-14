from pathlib import Path
import hashlib, json, os, plistlib, shutil, struct, subprocess, zipfile
import urllib.request, urllib.error

repo, run_id, tag = 'lorcinv/OmiComic', 43591209312, 'v1.1.98'
tested_commit = '5263b3216f4461c765c03f32e1d861f89d0e17eb'
assert os.environ['GITHUB_REPOSITORY'] == repo
root = Path('.cache/mac1198-upload').resolve()
reports = root / 'reports'
reports.mkdir(parents=True, exist_ok=True)

def api(route):
    return json.loads(subprocess.check_output(['gh', 'api', f'repos/{repo}{route}']))

def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def download_artifact(artifact_id, destination):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl): return None
    request = urllib.request.Request(f'https://api.github.com/repos/{repo}/actions/artifacts/{artifact_id}/zip', headers={'Authorization': 'Bearer ' + os.environ['GH_TOKEN'], 'User-Agent': 'OmiComic-release'})
    opener = urllib.request.build_opener(NoRedirect())
    try:
        opener.open(request, timeout=60)
    except urllib.error.HTTPError as error:
        if error.code != 302: raise RuntimeError(f'Artifact redirect failed: HTTP {error.code}') from None
        url = error.headers['Location']
    else:
        raise RuntimeError('Missing artifact download redirect')
    assert url.startswith('https://')
    # Send repository credentials only to api.github.com, never to storage.
    try:
        with urllib.request.urlopen(url, timeout=120) as response, destination.open('wb') as stream:
            shutil.copyfileobj(response, stream, 1024 * 1024)
    except Exception:
        raise RuntimeError('Artifact transfer failed') from None

run = api(f'/actions/runs/{run_id}')
assert run['status'] == 'completed' and run['conclusion'] == 'success' and run['head_sha'] == tested_commit
assert [f['filename'] for f in api(f'/compare/{tag}...{tested_commit}')['files']] == ['tests/apple-desktop.electron.cjs']
before = api(f'/releases/tags/{tag}')
assert not before['draft'] and not before['prerelease']
original = {
    'OmiComic-Setup-1.1.98-x64.exe': 'a3b952d3d3f62c71930cd1019ae4ba7e26542e10be6987039354eb5f7737e92a',
    'OmiComic-Portable-1.1.98-x64.zip': 'cd65221e8c7c4da52322ee49edf86281e3043030a807d52e50288dc6ca4aa555',
    'OmiComic-1.1.98-android.apk': 'ab62ea7196c3e13bef5c1f94c11448e174de40cb81e11080f6eedcf9ade0c59f',
    'OmiComic-1.1.98-source.zip': 'd7f02e1ca0a7411f5309021c99d75e73fd0abb8646aa66f840cce22428b690c4',
}
original_assets = {a['name']: a for a in before['assets'] if a['name'] in original}
assert len(original_assets) == len(original)
for name, sha in original.items(): assert original_assets[name]['digest'] == 'sha256:' + sha
(reports / 'release-before.json').write_text(json.dumps(before, indent=2), encoding='utf-8')
artifacts = api(f'/actions/runs/{run_id}/artifacts')['artifacts']
packages, checks = [], []
for arch in ('arm64', 'x64'):
    artifact = next(a for a in artifacts if a['name'] == f'OmiComic-mac-{arch}')
    assert not artifact['expired']
    archive = root / f'{arch}-ci.zip'
    download_artifact(artifact['id'], archive)
    assert archive.stat().st_size == artifact['size_in_bytes'] and 'sha256:' + digest(archive) == artifact['digest']
    dest = root / arch
    dest.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for name in z.namelist(): assert (dest / name).resolve().is_relative_to(dest), name
        z.extractall(dest)
    evidence = dest / 'test-results/apple-desktop'
    result = json.loads((evidence / 'result.json').read_text())
    assert result['info']['version'] == '1.1.98' and result['info']['platform'] == 'darwin' and result['info']['arch'] == arch
    assert result['archives'] == 4 and result['pdf'] and result['commandWheel'] and result['reopened'] and len(result['measurements']) == 14
    assert {r['flow'] for r in result['minimumZoom']} == {'ordinary', 'horizontal', 'vertical'}
    assert all(r['minimum'] == .25 and r['expanded'] > .8 and r['pageUnchanged'] for r in result['minimumZoom'])
    package = dest / f'release/OmiComic-1.1.98-mac-{arch}.zip'
    with zipfile.ZipFile(package) as z:
        assert z.testzip() is None
        info = plistlib.loads(z.read('OmiComic.app/Contents/Info.plist'))
        assert info['CFBundleShortVersionString'] == '1.1.98' and info['CFBundleVersion'] == '1.1.98'
        with z.open('OmiComic.app/Contents/MacOS/OmiComic') as stream: header = stream.read(8)
        assert header[:4] == b'\xcf\xfa\xed\xfe'
        assert struct.unpack('<I', header[4:8])[0] == {'arm64': 0x100000c, 'x64': 0x1000007}[arch]
    for ext in ('dmg', 'zip'):
        file = dest / f'release/OmiComic-1.1.98-mac-{arch}.{ext}'
        packages.append({'name': file.name, 'file': str(file), 'size': file.stat().st_size, 'sha256': digest(file)})
    shutil.copytree(evidence, reports / arch, dirs_exist_ok=True)
    checks.append({'arch': arch, 'artifact': artifact, 'runtime': result})

for package in packages:
    existing = next((a for a in before['assets'] if a['name'] == package['name']), None)
    if existing:
        assert existing['digest'] == 'sha256:' + package['sha256'] and existing['size'] == package['size']
    else:
        subprocess.run(['gh', 'release', 'upload', tag, package['file'], '--repo', repo], check=True)
    print('Verified and uploaded', package['name'], package['sha256'], flush=True)
checksum = root / 'SHA256SUMS.txt'
lines = [f'{sha}  {name}' for name, sha in original.items()]
lines += [f'{p["sha256"]}  {p["name"]}' for p in packages]
checksum.write_text('\n'.join(lines) + '\n', encoding='utf-8')
subprocess.run(['gh', 'release', 'upload', tag, str(checksum), '--repo', repo, '--clobber'], check=True)
after = api(f'/releases/tags/{tag}')
assert after['id'] == before['id'] and not after['draft'] and not after['prerelease'] and len(after['assets']) == 9
for name in original:
    asset = next(a for a in after['assets'] if a['name'] == name)
    assert asset['id'] == original_assets[name]['id'] and asset['digest'] == original_assets[name]['digest']
for package in packages:
    asset = next(a for a in after['assets'] if a['name'] == package['name'])
    assert asset['state'] == 'uploaded' and asset['size'] == package['size'] and asset['digest'] == 'sha256:' + package['sha256']
assert next(a for a in after['assets'] if a['name'] == checksum.name)['digest'] == 'sha256:' + digest(checksum)
assert api('/releases/latest')['tag_name'] == 'v1.1.99'
for package in packages: del package['file']
report = {'release': after['html_url'], 'testedCommit': tested_commit, 'buildRun': run_id, 'checks': checks, 'packages': packages, 'existingAssetsUnchanged': True, 'checksumSha256': digest(checksum)}
(reports / 'publication-result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
shutil.copy2(checksum, reports / checksum.name)
print(json.dumps({'release': after['html_url'], 'packages': packages, 'existingAssetsUnchanged': True}), flush=True)
