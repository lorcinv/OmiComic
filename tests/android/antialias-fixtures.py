"""Neutral, exact-frequency patterns: expected pixels use area averaging."""
from pathlib import Path
from PIL import Image, ImageCms
import numpy as np
import struct, zlib

out = Path('tests/fixtures/android-antialias')
out.mkdir(parents=True, exist_ok=True)
y, x = np.indices((512, 512))
patterns = {
    'lines': np.uint8((x % 2) * 255),
    'dots': np.uint8(((x + y) % 2) * 255),
    'diagonal': np.uint8(((x * 3 + y * 5) % 16 < 7) * 255),
    'variable': np.uint8(((x * x // 80 + y) % 8 < 4) * 255),
}
for name, array in patterns.items():
    image = Image.fromarray(array).convert('RGB')
    image.save(out / f'{name}.png')
    image.reduce(8).save(out / f'{name}-expected.png')
    image.save(out / f'{name}.jpg', quality=100, subsampling=0)
    Image.open(out / f'{name}.jpg').convert('RGB').reduce(8).save(out / f'{name}-jpg-expected.png')

alpha = Image.fromarray(np.dstack([np.full_like(x, 240), np.full_like(x, 40), np.full_like(x, 80), ((x + y) % 2) * 255]).astype('uint8'), 'RGBA')
alpha.save(out / 'alpha.png')
alpha.reduce(8).save(out / 'alpha-expected.png')
palette = Image.fromarray(patterns['dots']).convert('P', palette=Image.Palette.ADAPTIVE, colors=2)
palette.save(out / 'palette.png', bits=1)
palette.convert('RGB').reduce(8).save(out / 'palette-expected.png')
icc = Image.fromarray(patterns['lines']).convert('RGB')
icc.save(out / 'icc.png', icc_profile=ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes())
icc.reduce(8).save(out / 'icc-expected.png')
def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
raw = np.asarray(Image.fromarray(patterns['diagonal']).convert('RGB'))
passes = [(0,0,8,8),(4,0,8,8),(0,4,4,8),(2,0,4,4),(0,2,2,4),(1,0,2,2),(0,1,1,2)]
scan = b''.join(b'\0' + raw[yy,x0::dx].tobytes() for x0,y0,dx,dy in passes for yy in range(y0,512,dy))
(out / 'interlaced.png').write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR',struct.pack('>IIBBBBB',512,512,8,2,0,0,1)) + chunk(b'IDAT',zlib.compress(scan)) + chunk(b'IEND',b''))
Image.fromarray(raw).reduce(8).save(out / 'interlaced-expected.png')

# A full-size pattern page also exercises the real reader, not only the decoder.
large = Image.new('RGB', (4000, 6000), 'white')
for yy in range(0, 6000, 512):
    for xx in range(0, 4000, 512):
        large.paste(Image.fromarray(patterns[list(patterns)[(yy // 512 + xx // 512) % 4]]).convert('RGB'), (xx, yy))
folder = Path('.cache/android-native-fixtures/Native112/Patterns')
folder.mkdir(parents=True, exist_ok=True)
large.save(folder / 'patterns.png')
