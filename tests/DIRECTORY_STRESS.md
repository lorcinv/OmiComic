# Directory, reader-motion and image-guard regression checks

## Run

```sh
node --expose-gc --test electron/services/directoryService.test.cjs tests/image-guards.test.cjs src/reader/motion.test.cjs
npm run typecheck
```

The tests use the project's existing TypeScript dependency. Python/Pillow is **not** needed to run them. Original image fixtures are checked into `tests/fixtures/images`; their optional regeneration script requires Pillow. Directory tests create their own temporary tree and remove it in `finally`, including on assertion failure. The permission/symlink cases were executed on Linux as an unprivileged user. Windows execution needs separate ACL testing and permission to create file symlinks.

## Exact filesystem workload

- 10,000 files in the root and 100 in each of ten nested chapter folders: **11,000 PNG files**.
- Each is a valid **1 × 1 RGB PNG**, originally generated with Pillow. The PNG itself is 69 bytes; zero padding makes each filesystem file **8,192 bytes**.
- Combined image-file size is **90,112,000 bytes** (about 85.94 MiB). Padding is deliberately reported as padding, not compressed image complexity.
- Root directory has 10,015 entries: 10,000 regular PNGs, ten folders, two non-image files and three links (broken image, escaped image and escaped folder).
- These are **directory enumeration/stat/filter/sort/cancellation tests**, not large-image decode, rendering, texture-upload or frame-rate tests. The service does not read image payloads during scanning.
- PNG fixture CRCs are checked independently in `tests/image-guards.test.cjs`. An earlier test constant had an invalid IDAT CRC; it was replaced before the final measurements below. The earlier filesystem-count measurements were unaffected, but their fixture-validity description was incorrect.

## Final focused run, Linux, 2026-10-09

Command: `node --expose-gc --test electron/services/directoryService.test.cjs tests/image-guards.test.cjs`

| Observation | Measured result |
|---|---:|
| Fixture creation | 1,107.40 ms |
| Root scan, 10,015 entries | 397.56 ms |
| Image-only list, 10,000 names | 31.69 ms |
| Ten concurrent nested scans, 1,000 total entries | 40.29 ms |
| Cancellation after a requested 35 ms delay | 35.67 ms, 185 stats had started |
| Twelve rapid scans, newest completes | 522.87 ms |
| Maximum concurrent stat calls across all scans | 24 |
| Baseline RSS after loading TypeScript/service and explicit GC | 96.04 MiB |
| Peak sampled RSS during workload | 176.54 MiB |
| End-of-workload RSS, before fixture cleanup | 169.98 MiB |
| RSS after fixture cleanup and explicit GC | 174.13 MiB |
| Explicit GC available | Yes, `--expose-gc` |

RSS is process-wide and includes the TypeScript test harness, generated fixture buffers, returned metadata, assertions, V8 heap reservation and filesystem cleanup. Peak RSS is sampled every 10 ms and includes the final workload sample; it is not an exact OS high-water mark. V8 and the allocator need not return reserved pages after GC, so post-GC RSS does **not** establish either a memory leak or a zero-retention guarantee. This is a one-run measurement, not a long-session heap-retention profile. Timings vary with machine contention and filesystem caches; no before/after speedup is claimed.

Assertions verify natural page/chapter ordering, folder-first sorting, exact entry/image counts, file sizes, per-entry `hasError`, real directory `EACCES`, missing paths, lexical root rejection, escaped-symlink rejection, already-aborted requests, mid-scan cancellation and obsolete rapid-scan cancellation. The global semaphore, rather than a semaphore per request, prevents overlapping navigation from multiplying outstanding stats.

## Actual large-dimension image fixtures and pre-decode guards

All fixtures are original solid-color images. They are compressed small because solid colors compress well; they are **not** representative high-entropy comic pages.

| Fixture | Dimensions | Pixels | File bytes | RGBA bytes if fully decoded |
|---|---:|---:|---:|---:|
| oversized-8192x4096.png | 8,192 × 4,096 | 33,554,432 | 107,846 | 134,217,728 |
| oversized-8192x4096.jpg | 8,192 × 4,096 | 33,554,432 | 196,894 | 134,217,728 |
| portrait-3000x4000.png | 3,000 × 4,000 | 12,000,000 | 44,261 | 48,000,000 |
| pixel.png | 1 × 1 | 1 | 69 | 4 |

The test extracts the **actual production** dimension parser and preview function from `electron/main.ts` using the TypeScript AST, without importing or launching Electron. It verifies:

- PNG CRCs and parsed PNG/JPEG dimensions.
- Both 33.55-megapixel images are rejected by the existing 16-million-pixel preview guard **before any nativeImage call**.
- A tiny PNG padded beyond the existing 12 MiB compressed-byte limit is rejected before decoding.
- Empty/unrecognized/truncated input is rejected; an empty nativeImage result is rejected.
- The 12-megapixel portrait requests a 270 × 360 thumbnail with preserved aspect ratio.

`nativeImage` is an instrumented **spy**, not a real decoder. The tests establish guard ordering and resize arguments, **not** native decoder memory use, actual preview visual fidelity, full-resolution reading safeguards or Electron/Windows rendering performance. Production native-image decoding and real large-page gesture behavior still require the Windows release smoke test. A preview refusal does not by itself establish a cap for full-size reading.

## Reader motion and bounded speculation

Seven pure-model checks in `src/reader/motion.test.cjs` cover 30/60/120/144 Hz integration consistency, smooth release around the former 50 ms cutoff, decay beyond the former 720 ms cap, hold/tap behavior, axis and speed bounds, a 100,000-page speculative-buffer traversal, and zero-budget behavior. They prove those algorithmic properties, not actual screen FPS. Essential nearby/visible images can individually exceed the configured cache budget; the budget caps disposable speculation, not the decoder allocation of a necessary huge page.
