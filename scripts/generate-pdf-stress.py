"""Deterministic, independent raster-image pages; emits a real PDF, not sparse padding."""
import io, random, sys
from PIL import Image
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab import rl_config
rl_config.useA85 = False
output = sys.argv[1]
count = int(sys.argv[2]) if len(sys.argv) > 2 else 24
width, height = 2400, 3200
rng = random.Random(20261009)
pdf = canvas.Canvas(output, pagesize=(600, 800), pageCompression=1)
for page in range(count):
    raster = Image.frombytes('RGB', (width, height), rng.randbytes(width * height * 3))
    encoded = io.BytesIO()
    raster.save(encoded, format='JPEG', quality=85)
    encoded.seek(0)
    pdf.drawImage(ImageReader(encoded), 0, 0, width=600, height=800)
    pdf.setFillColorRGB(1,1,1)
    pdf.drawString(20,780,'OmiComic raster stress page '+str(page+1))
    pdf.showPage()
pdf.save()
print(output)
