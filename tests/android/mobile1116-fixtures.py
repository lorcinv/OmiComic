"""Disposable real-format fixtures; no user library content is read."""
from pathlib import Path
from io import BytesIO
import json
import shutil
import zipfile
from PIL import Image, ImageDraw

root = Path('.cache/android-format-fixtures/Formats116')
(root / 'Images').mkdir(parents=True, exist_ok=True)
entries = []
for index, (extension, fmt) in enumerate([('jpg', 'JPEG'), ('jpeg', 'JPEG'), ('png', 'PNG'), ('webp', 'WEBP'), ('bmp', 'BMP'), ('gif', 'GIF')]):
    image = Image.new('RGB', (800, 1200), (226, 232, 238))
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 80, 720, 1120), outline=(40, 60, 80), width=5)
    draw.text((140, 350), extension.upper(), font_size=100, fill=(40, 60, 80))
    output = BytesIO()
    if fmt == 'GIF':
        other = image.copy()
        ImageDraw.Draw(other).rectangle((250, 600, 550, 900), fill=(220, 40, 40))
        image.save(output, format=fmt, save_all=True, append_images=[other], duration=180, loop=0)
    else:
        image.save(output, format=fmt, **({'quality': 90} if fmt in ('JPEG', 'WEBP') else {}))
    name = f'{index + 1:02}.{extension}'
    data = output.getvalue()
    (root / 'Images' / name).write_bytes(data)
    (root / name).write_bytes(data)
    entries.append((name, data))
for name, method in [('Stored.zip', zipfile.ZIP_STORED), ('Deflate.cbz', zipfile.ZIP_DEFLATED), ('Lzma.zip', zipfile.ZIP_LZMA), ('Bzip2.zip', zipfile.ZIP_BZIP2)]:
    with zipfile.ZipFile(root / name, 'w', compression=method) as archive:
        for entry, data in entries:
            archive.writestr('漫画/' + entry, data)
for path in Path('tests/fixtures/android-archives').glob('*'):
    if path.suffix in ('.rar', '.cbr', '.7z', '.cb7'):
        shutil.copyfile(path, root / path.name)
shutil.copyfile('tests/fixtures/documents/three-pages.pdf', root / 'Document.pdf')
with zipfile.ZipFile(root / 'Story.epub', 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    archive.writestr('META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>')
    archive.writestr('OPS/book.opf', '<package><manifest><item id="a" href="a.xhtml"/><item id="b" href="b.xhtml"/><item id="cover" href="cover.png" properties="cover-image"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>')
    archive.writestr('OPS/cover.png', entries[2][1])
    for key, title in [('a', 'One'), ('b', 'Two')]:
        archive.writestr(f'OPS/{key}.xhtml', f'<h1>Chapter {title}</h1><p>Offline bitmap EPUB</p><img src="cover.png"/><script>window.top.unsafe116=true</script>')
print(json.dumps({'root': str(root.resolve()), 'files': len(list(root.rglob('*')))}))
