from pathlib import Path
import base64, json, subprocess

repo = 'lorcinv/OmiComic'
source = 'fa44bd983aaa6b558dee0beb56028ec787c6976f'
previous = '3a7ce1ea0c60d56ef6a0406414c1b2429edae66d'

def api(route, body=None):
    command = ['gh', 'api', f'repos/{repo}{route}']
    if body is not None: command += ['--method', 'PATCH', '--input', '-']
    return json.loads(subprocess.check_output(command, input=json.dumps(body, ensure_ascii=False).encode() if body is not None else None))

def notes(tag, ref):
    file = api(f'/contents/docs/releases/{tag}.md?ref={ref}')
    return base64.b64decode(file['content']).decode('utf-8').replace('\r\n', '\n')

assert api('/releases/latest')['tag_name'] == 'v1.1.99'
results = []
for tag in ['v1.1.98', 'v1.1.99']:
    before = api(f'/releases/tags/{tag}')
    text = notes(tag, source)
    assert before['body'].replace('\r\n', '\n').strip() in [notes(tag, previous).strip(), text.strip()], 'Release notes changed; inspect before replacing.'
    after = api(f'/releases/{before["id"]}', {'body': text, 'make_latest': 'false' if tag == 'v1.1.98' else 'true'})
    assert after['body'].replace('\r\n', '\n') == text
    assert [(a['id'], a['digest']) for a in before['assets']] == [(a['id'], a['digest']) for a in after['assets']]
    results.append({'tag': tag, 'url': after['html_url'], 'assetDigestsUnchanged': True})
assert api('/releases/latest')['tag_name'] == 'v1.1.99'
out = Path('.cache/mac1198-upload/reports')
out.mkdir(parents=True, exist_ok=True)
(out/'notes-result.json').write_text(json.dumps({'source': source, 'releases': results}, indent=2) + '\n')
print(json.dumps({'source': source, 'releases': results}))
