"""Reproducible, synthetic EPUBs for Android 1.1.86 startup/integrity checks."""
from pathlib import Path
import hashlib
import json
import struct
import sys
import zipfile
import zlib

target = Path(sys.argv[1] if len(sys.argv) > 1 else '.cache/experience1186/fixtures').resolve()
target.mkdir(parents=True, exist_ok=True)
container = b'<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'


def write_entry(archive, name, data, compression=zipfile.ZIP_DEFLATED):
    info = zipfile.ZipInfo(name, (2026, 11, 7, 0, 0, 0))
    info.compress_type = compression
    archive.writestr(info, data)


def make(name, chapters, extras=0, fallback=False):
    path = target / name
    with zipfile.ZipFile(path, 'w') as archive:
        write_entry(archive, 'mimetype', b'application/epub+zip', zipfile.ZIP_STORED)
        write_entry(archive, 'META-INF/container.xml', container)
        manifest = ''.join(f'<item id="c{i}" href="chapter-{i:04}.xhtml" media-type="application/xhtml+xml"/>' for i in range(chapters))
        spine = ''.join(f'<itemref idref="c{i}"/>' for i in range(chapters))
        write_entry(archive, 'OEBPS/package.opf', f'<package xmlns="http://www.idpf.org/2007/opf" version="2.0"><manifest>{manifest}</manifest><spine>{spine}</spine></package>'.encode())
        for i in range(extras):
            write_entry(archive, f'Assets/unused/entry-{i:05}.bin', hashlib.sha256(str(i).encode()).digest() * 8)
        for i in range(chapters):
            payload = f'<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter {i + 1}</title></head><body><h1>Chapter {i + 1}</h1>' + ''.join(f'<p>Test paragraph {i}:{n}. Repeatable chapter content for local reader verification.</p>' for n in range(12)) + '</body></html>'
            write_entry(archive, f'OEBPS/chapter-{i:04}.xhtml', payload.encode(), zipfile.ZIP_BZIP2 if fallback and i == chapters - 1 else zipfile.ZIP_DEFLATED)
    return path


make('StartupDeep.epub', 1200, 2400)
make('StartupFallback.epub', 3, fallback=True)
make('StartupText.epub', 24)


def png(page):
    width, height = 1200, 1800
    def chunk(kind, value):
        return struct.pack('>I', len(value)) + kind + value + struct.pack('>I', zlib.crc32(kind + value) & 0xffffffff)
    rows = bytearray()
    for y in range(height):
        value = 232 if y % 180 < 160 else 50 + page % 150
        rows.extend(b'\0' + bytes((value, value, value)) * width)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 6)) + chunk(b'IEND', b'')


with zipfile.ZipFile(target / 'StartupPictures.epub', 'w') as archive:
    write_entry(archive, 'mimetype', b'application/epub+zip', zipfile.ZIP_STORED)
    write_entry(archive, 'META-INF/container.xml', container)
    manifest = ''.join(f'<item id="c{i}" href="chapter-{i:04}.xhtml" media-type="application/xhtml+xml"/><item id="p{i}" href="Images/page-{i:04}.png" media-type="image/png"/>' for i in range(80))
    spine = ''.join(f'<itemref idref="c{i}"/>' for i in range(80))
    write_entry(archive, 'OEBPS/package.opf', f'<package xmlns="http://www.idpf.org/2007/opf" version="2.0"><metadata><meta name="fixed-layout" content="true"/></metadata><manifest>{manifest}</manifest><spine>{spine}</spine></package>'.encode())
    for i in range(80):
        write_entry(archive, f'OEBPS/chapter-{i:04}.xhtml', f'<html xmlns="http://www.w3.org/1999/xhtml"><body><img src="Images/page-{i:04}.png" width="1200" height="1800" alt="Synthetic page {i + 1}"/></body></html>'.encode())
        write_entry(archive, f'OEBPS/Images/page-{i:04}.png', png(i), zipfile.ZIP_STORED)

(target / 'Startup.png').write_bytes(png(0))
with zipfile.ZipFile(target / 'Startup.cbz', 'w') as archive:
    for i in range(8):
        write_entry(archive, f'page-{i + 1:03}.png', png(i), zipfile.ZIP_DEFLATED)
(target / 'Startup.zip').write_bytes((target / 'Startup.cbz').read_bytes())

corrupt = make('StartupCorrupt.epub', 3)
with zipfile.ZipFile(corrupt) as archive:
    entry = archive.getinfo('OEBPS/chapter-0002.xhtml')
    offset = entry.header_offset
data = bytearray(corrupt.read_bytes())
name_length, extra_length = struct.unpack_from('<HH', data, offset + 26)
data[offset + 30 + name_length + extra_length + entry.compress_size // 2] ^= 0x40
corrupt.write_bytes(data)
files = [{'name': path.name, 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()} for path in target.glob('Startup*.epub')]
(target / 'epub-fixtures.json').write_text(json.dumps(files, indent=2), encoding='utf-8')
print(json.dumps(files, indent=2))
