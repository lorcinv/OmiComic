# Archive implementation and regression checks

Run `npm run build:electron && node --test tests/archive.test.cjs`.

## Implemented

- ZIP/CBZ remains streamed through yauzl, with incremental CRC32 checking. A bounded validated-directory cache avoids rescanning every entry on page turns. Legacy Windows separators are normalized safely.
- RAR/CBR and 7z/CB7 use the pinned `7zip-bin-full@26.4.1` package's **official** `path7z` executable (7-Zip 26.04); custom executables are not used.
- The obsolete `7zip-bin` and `node-unrar-js` dependencies were removed.
- Reading never writes archive contents to disk. Child processes use argument arrays, no shell, closed stdin, literal file selectors, and a 30-second timeout.
- At most two archive jobs run concurrently; the pending queue is capped at 128. Only metadata is cached, for at most 16 archives, invalidated by file size/mtime/ctime.
- Limits: 20,000 entries, 8 GiB total declared expanded data, 256 MiB per requested image (callers may lower it), 8 MiB names/listing output, 1,000:1 expansion ratio above 1 MiB. Large LZMA/PPMd dictionary metadata is rejected above 128 MiB.
- Absolute/traversal/control/drive/alternate-stream paths, duplicate names, known links, encrypted data and split-volume entries are refused. Native decoding checks CRC; ZIP adds its own CRC check.
- 7-Zip's `-mmemuse=256m` is an advisory decoder setting, **not an OS-level hard memory quota**. Output, metadata, concurrency and execution duration are hard-bounded by this service. This is defense in depth, not a guarantee against every native decoder defect.

## Verified fixture sizes and outcomes (Linux x64, 7-Zip 26.04)

| Scenario | Size/count | Outcome |
|---|---:|---|
| ZIP natural order and nested Unicode | 2 images + text | Correct order and exact bytes |
| ZIP many-file index + last page | 10,000 images; 1,147,802 bytes | Pass |
| ZIP excessive entries | 20,001 | Rejected |
| ZIP large stored page | 33,554,432 expanded bytes; 33,554,548 archive bytes | Pass; 1 KiB caller cap rejects |
| ZIP CRC/truncation/encryption/traversal/duplicate paths | Generated independent cases | Rejected |
| CB7 many-file index + page reads | 1,001 images; about 5.4 KiB archive | Pass |
| 7z content/header encryption and corruption | Generated independent cases | Rejected |
| CBR stored RAR4 index + last page | 1,000 images; 55,917 bytes | Pass |
| RAR large stored page | 8 MiB | Pass; lower caller cap rejects |
| RAR CRC/encryption/traversal/corruption | Generated independent cases | Rejected |
| 7z large stored page | 32 MiB; 33,554,554 archive bytes | Pass; lower caller cap rejects |
| 7z high-expansion fixture | 32 MiB expanded from about 7.2 KiB | Rejected before extraction |
| Literal wildcard page name | `a*.jpg` plus `abc.jpg` | Only literal page read (POSIX) |
| Replacement + parallel reads | 12 requests | Cache refresh and correct bytes |

17 tests passed in the final focused run. Durations are logged at runtime and depend on machine contention. Fixtures are created under an OS temporary directory and removed after tests. The tests exercise real ZIP/RAR4/7z data, not mocked codec results. RAR fixtures cover stored RAR4; this run does not establish RAR5/solid-RAR/password UI support. Password and multipart archives are intentionally unsupported. Native Windows execution and packaged-ASAR distribution still need Windows release smoke testing.

## Packaging and notices

Unpack `node_modules/7zip-bin-full/**` from Electron's ASAR. On Windows keep **both** `7z.exe` and the matching `7z.dll` alongside each other. Keep their `License.txt`, `readme.txt` and notices. POSIX binaries must retain their executable bit (the pinned package includes it). The service resolves `app.asar` paths to `app.asar.unpacked` and refuses the package's optional system-executable override.

Redistribution notices are copied unchanged into `licenses/7zip-License.txt` and `licenses/7zip-bin-full-MIT.txt`. 7-Zip is primarily LGPL-2.1-or-later, with BSD portions and the unRAR restriction described in its notice. Preserve the complete notices and provide corresponding 7-Zip source with binary releases as required by its license. Source release: https://github.com/ip7z/7zip/releases/tag/26.04 . This patch does not create or distribute an installer.

Package provenance: https://github.com/ollm/7zip-bin-full . Its shipped `update-binaries.js` downloads the official `ip7z/7zip` release assets. The runtime selects the official binary, not `path7zc`. npm integrity is pinned in `package-lock.json`.

### Independent provenance verification

Official 26.04 release downloads were retrieved separately, their SHA-256 digests matched the GitHub release API, and extracted executables were compared byte-for-byte with the installed npm package. Linux x64 `7zz` and Windows x64 `7z.exe` plus `7z.dll` all matched.

- `7z2604-linux-x64.tar.xz`: `fc0327ba27e89bd086cf426dff17d77de582953cdbbc10a6576540a06853ffcd`
- `7z2604-x64.exe`: `d54bf805f9f3704d1e8db2fa3498ae7ef2df0312b40b558e7c71c734430a665d`

Other bundled architecture binaries were not independently byte-compared in this run.
