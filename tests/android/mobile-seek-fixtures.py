"""200 real large JPEG pages for sustained scrubbing and cache eviction."""
from pathlib import Path
from io import BytesIO
import json
import zipfile
import numpy as np
from PIL import Image, ImageDraw
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--over-gib', action='store_true')
parser.add_argument('--deflate', action='store_true')
args = parser.parse_args()
target = Path('.cache/android-native-fixtures/Native112/LargeOver1GiB.cbz' if args.over_gib else '.cache/android-native-fixtures/Native112/LargeSeek.cbz')
if args.deflate:
    target = target.with_name('LargeDeflateOver1GiB.zip')
target.parent.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(1116)
# High resolution with scan-like grain: small thumbnails must not retain the
# 14.4-megapixel source, and archive bytes must really be read, not padding.
grain = rng.integers(0, 256, (4500, 3200), dtype=np.uint8)
base = Image.fromarray(grain).convert('RGB')
pages = []
sample = BytesIO()
quality = 1
for candidate in range(1, 96):
    sample.seek(0)
    sample.truncate()
    base.save(sample, format='JPEG', quality=candidate)
    if sample.tell() > 382.4 * 1024 * 1024 / 200:
        break
    quality = candidate
for number in range(12):
    page = base.copy()
    draw = ImageDraw.Draw(page)
    draw.rectangle((150, 150, 3050, 750), fill='white', outline='black', width=10)
    draw.text((280, 250), f'Omi large seek / image {number + 1}', fill='black', font_size=140)
    out = BytesIO()
    page.save(out, format='JPEG', quality=58 if args.over_gib else quality)
    pages.append(out.getvalue())
with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED if args.deflate else zipfile.ZIP_STORED, compresslevel=1 if args.deflate else None) as archive:
    for number in range(200):
        archive.writestr(f'{number + 1:03}.jpg', pages[number % len(pages)])
print(json.dumps({'path':str(target.resolve()),'pages':200,'width':3200,'height':4500,'bytes':target.stat().st_size}))
