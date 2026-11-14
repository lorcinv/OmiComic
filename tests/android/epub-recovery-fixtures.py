"""Small synthetic EPUBs for the dedicated Android test provider."""
import struct
import sys
import zlib
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

destination = Path(sys.argv[1])
destination.mkdir(parents=True, exist_ok=True)

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

row = b'\x00' + bytes([32, 73, 97]) * 800
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 800, 1200, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(row * 1200)) + chunk(b'IEND', b'')
for kind in ['Compatibility', 'Missing', 'Unsupported']:
    with ZipFile(destination / (kind + '.epub'), 'w', ZIP_DEFLATED) as archive:
        archive.writestr('mimetype', 'application/epub+zip', compress_type=0)
        archive.writestr('META-INF/container.xml', '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>')
        manifest = ''.join(f'<item id="p{i}" href="p{i}.xhtml" media-type="application/xhtml+xml"/>' for i in range(8))
        spine = ''.join(f'<itemref idref="p{i}"/>' for i in range(8))
        archive.writestr('OPS/package.opf', f'<package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">omi-{kind}</dc:identifier><dc:title>{kind}</dc:title><dc:language>en</dc:language><meta name="fixed-layout" content="true"/></metadata><manifest>{manifest}<item id="pic" href="page.png" media-type="image/png"/><item id="svg" href="page.svg" media-type="image/svg+xml"/></manifest><spine>{spine}</spine></package>')
        archive.writestr('OPS/page.png', png)
        archive.writestr('OPS/page.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="#204961"/></svg>')
        for i in range(8):
            picture = 'missing.png' if kind == 'Missing' and i == 0 else 'page.svg' if kind == 'Unsupported' and i == 0 else 'page.png'
            archive.writestr(f'OPS/p{i}.xhtml', f'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Page {i + 1}</title></head><body><img src="{picture}"/></body></html>')
    print(destination / (kind + '.epub'))
