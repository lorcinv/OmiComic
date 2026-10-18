"""Bounded hostile archive metadata fixtures; no files are extracted from them."""
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED, ZIP_BZIP2

base = Path('.cache/android-metadata-fixtures/Metadata')
base.mkdir(parents=True, exist_ok=True)
pixel = Path('tests/fixtures/images/pixel.png').read_bytes()
for suffix, method in [('cbz', ZIP_STORED), ('zip', ZIP_BZIP2)]:
    with ZipFile(base / f'LongName.{suffix}', 'w', compression=method) as archive:
        archive.writestr('x' * 4093 + '.png', pixel)
    with ZipFile(base / f'NameBudget.{suffix}', 'w', compression=method) as archive:
        for i in range(2050):
            archive.writestr(f'{i:04d}' + 'x' * 4088 + '.png', b'')
with ZipFile(base / 'UnicodeBudget.cbz', 'w') as archive:
    for i in range(700):
        archive.writestr(f'{i:04d}' + '漫' * 4088 + '.png', b'')
with ZipFile(base / 'LongAllowed.cbz', 'w') as archive:
    archive.writestr('x' * 4092 + '.png', pixel)
print(base.resolve())
