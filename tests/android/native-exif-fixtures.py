"""Owned test images with all EXIF orientations, including mirrored axes."""
from pathlib import Path
from PIL import Image, ImageDraw

base = Path('.cache/android-native-fixtures/Native112/Exif')
base.mkdir(parents=True, exist_ok=True)
image = Image.new('RGB', (1200, 1800), '#e2e8ee')
draw = ImageDraw.Draw(image)
for box, color in [((0, 0, 599, 899), '#e02030'), ((600, 0, 1199, 899), '#20b060'),
                   ((0, 900, 599, 1799), '#2060d0'), ((600, 900, 1199, 1799), '#e0b020')]:
    draw.rectangle(box, fill=color)
for orientation in range(1, 9):
    exif = Image.Exif()
    exif[274] = orientation
    image.save(base / f'{orientation}.jpg', quality=93, exif=exif)
print(base.resolve())
