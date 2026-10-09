"""Optional fixture regeneration: python3 -m pip install Pillow; python3 tests/fixtures/images/generate.py.
Original solid-color test images. No source/downloaded/copyrighted artwork.
"""
from pathlib import Path
from PIL import Image
root = Path(__file__).parent
for name, size, format in [
    ('pixel.png', (1, 1), 'PNG'),
    ('oversized-8192x4096.png', (8192, 4096), 'PNG'),
    ('oversized-8192x4096.jpg', (8192, 4096), 'JPEG'),
    ('portrait-3000x4000.png', (3000, 4000), 'PNG'),
]:
    image = Image.new('RGB', size, (38, 74, 116))
    image.save(root / name, format=format, optimize=True)
    with Image.open(root / name) as check:
        check.verify()
    print(name, size, (root / name).stat().st_size)
