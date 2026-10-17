"""Large PNG data and a valid indexed+tRNS regression, all generated locally."""
from pathlib import Path
import json, zipfile
from PIL import Image, ImageDraw, ImageCms
import numpy as np

root = Path('.cache/android-png-fixtures/Png117')
root.mkdir(parents=True, exist_ok=True)
w, h = 3444, 5120
rng = np.random.default_rng(117)
records = []
for i, levels in enumerate([4, 8, 4, 8]):
    data = rng.integers(0, levels, (h, w, 3), dtype=np.uint8) * (255 // (levels - 1))
    image = Image.fromarray(data)
    draw = ImageDraw.Draw(image)
    draw.rectangle((100, 100, 1700, 450), fill='white')
    draw.text((150, 150), f'PNG 117 / {i+1}', font_size=150, fill='black')
    image.save(root / f'rgb-{i}.png', compress_level=3, **({'icc_profile': ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes()} if i == 2 else {}))
    records.append({'name': f'rgb-{i}.png', 'bytes': (root / f'rgb-{i}.png').stat().st_size})
    print(records[-1], flush=True)
# Valid palette + transparency: protect colour models as well as file size.
array = rng.integers(0, 32, (h, w), dtype=np.uint8)
image = Image.fromarray(array, 'P')
image.putpalette([v for i in range(256) for v in (i*7 % 256, i*11 % 256, i*17 % 256)])
image.save(root / 'palette-alpha.png', transparency=bytes([0]+[255]*255), compress_level=6)
Image.open(root / 'palette-alpha.png').convert('RGBA').reduce(4).save(root / 'palette-alpha-reference.png')
records.append({'name': 'palette-alpha.png', 'bytes': (root / 'palette-alpha.png').stat().st_size})
print(records[-1], flush=True)
names=['palette-alpha.png', 'rgb-0.png', 'rgb-1.png', 'rgb-2.png', 'rgb-3.png']
with zipfile.ZipFile(root / 'LargePng110.cbz', 'w', compression=zipfile.ZIP_STORED) as archive:
    for page in range(110):
        name=names[page % len(names)]
        archive.write(root / name, f'{page+1:03}.png')
manifest={'width':w, 'height':h, 'pages':110, 'variants':records, 'archiveBytes':(root / 'LargePng110.cbz').stat().st_size}
(root / 'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
# Small exact reference protects palette transparency and filtering in every regression run.
small=Image.fromarray((np.indices((512,512)).sum(axis=0)%2).astype('uint8'), 'P')
small.putpalette([240,40,80]*256)
small.save('tests/fixtures/android-antialias/palette-alpha.png', transparency=bytes([0]+[255]*255))
Image.open('tests/fixtures/android-antialias/palette-alpha.png').convert('RGBA').reduce(8).save('tests/fixtures/android-antialias/palette-alpha-expected.png')
print(json.dumps(manifest),flush=True)
