# Android archive fixtures

Disposable, generated OmiComic test artwork from `tests/android/fixtures.cjs`.
Three 800 x 1200 PNGs are stored as `漫画/页1.png`, `漫画/页2.png`, `漫画/页10.png`.
The order exercises Unicode paths and natural sorting. The first pixel colors
are #e2e8ee, #d2dedf, and #e9dfd1 respectively.

- `RAR4.rar`: RAR 4, normal compression, generated with the official RAR 6.24 trial (`a -ma4 -m5 -r`).
- `RAR5.cbr`: RAR 5, solid compression (`a -ma5 -m5 -s -r`).
- `Seven.7z`: 7-Zip 26.04, LZMA2, non-solid (`a -t7z -ms=off`).
- `Solid.cb7`: 7-Zip 26.04, LZMA2, solid (`a -t7z -ms=on`).
- `Encrypted.7z`: same artwork, test-only password `fixture`; must return a clear unsupported-encryption error.
- `Empty.7z`: one text file, no readable images.
- `Broken.rar`: plain text, not a valid archive.

RAR and 7-Zip executables are not included in the fixtures or the APK.
Copy only the seven archive files into the dedicated emulator's authorized
`Download/OmiSmoke` directory after the original `smoke`/`restore` tests.
