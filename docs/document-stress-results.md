# Document reader stress verification

Run date: 2026-10-09. Linux cloud environment, Node 24.19.0, PDF.js 6.4.299.
These are measured synthetic workloads, not universal performance guarantees.

## Automated service tests

Command: `npm run build:electron && node --test --test-concurrency=1 tests/documents.test.cjs tests/document-stress.test.cjs`

Nine tests passed. Coverage includes archive path traversal/scheme rejection, HTML
sanitization, unsafe/oversized image rejection, exact PDF ranges, EPUB spine order,
embedded raster images, malformed archives, oversized chapter payloads, compression
ratio limits, closing an active source and cancellation during worker initialization.

| Workload | Size | Work performed | Time | RSS increase |
| --- | --- | --- | --- | --- |
| Sparse PDF transport | 512 MiB logical / 8 KiB physical | 64 × 64 KiB reads across file, 4 MiB total | 27 ms | 5.1 MiB |
| Stored EPUB | 33,823,719 bytes, 1,000 chapters, 1,002 entries | Index and extract chapters 0, 500, 999; 102,274 bytes returned | 549 ms | 32.9 MiB |
| Invalid ZIP | 8 bytes | Reject | 152 ms | 10.8 MiB |
| Missing OPF | 224 bytes | Reject | 153 ms | 7.3 MiB |
| Oversized markup | 4,194,871-byte archive | Reject >4 MiB chapter | 145 ms | 4.9 MiB |
| Compression bomb | 2,552-byte archive, 2 MiB repeated chapter | Reject expansion ratio >1,000 | 175 ms | 4.6 MiB |
| EPUB immediate cancellation | 1,000 chapters | Reject in-flight initialization and subsequent request | 9 ms | 1.5 MiB |

RSS is process-wide, includes worker threads, and is sampled every 5 ms. Dataset
construction precedes each measurement. Sparse PDF tests validate transport only:
the sparse fixture is not a complete renderable PDF.

## Actual PDF raster rendering

Reproduction (requires Python Pillow/reportlab and npm optional @napi-rs/canvas):

```sh
python3 scripts/generate-pdf-stress.py /tmp/omicomic-raster-stress.pdf 24
node --expose-gc scripts/run-pdf-stress.mjs /tmp/omicomic-raster-stress.pdf
```

The generated file is a real 139,324,730-byte PDF (132.9 MiB), containing 24
independent 2,400 × 3,200 JPEG raster pages. PDF.js actually decoded and rendered
all 24 pages into a reused 1,200 × 1,600 native canvas. Pixel assertions verified
nonblank raster content. Each page was cleaned up. A render task was cancelled
and its cancellation exception was verified.

- Indexing: 160 ms; 6,417,722 bytes fetched
- Whole pass: 24.77 seconds; individual pages 0.85–1.69 seconds
- Bounded source reads: 169 calls, 139,324,730 total bytes after all pages
- RSS before: 84,615,168 bytes (80.7 MiB)
- Sampled peak RSS: 364,376,064 bytes (347.5 MiB)
- OS process peak RSS: 365,154,304 bytes (348.2 MiB)
- RSS after document destruction and explicit GC: 275,841,024 bytes (263.1 MiB)

This measures Node's PDF.js legacy build and @napi-rs/canvas. It does **not** prove
Chromium canvas, Electron IPC, sandbox/CSP or interactive navigation behavior.
Those UI checks remain necessary on a runnable desktop/browser environment.
The first page includes a PNG export, so its timing includes encoding and writing.
PDF.js retains fetched document bytes while reading; the native allocator can
retain reserved memory after destruction. Only live page surfaces/work queues are
bounded, not a claim that all process RSS immediately returns to its baseline.

## Launch and cleanup review

Static review verified that document resource metadata uses `total: 0` and empty
pages until parsing. Library and Home preserve saved document indexes; the Library
pre-open progress saver skips empty pages. Once parsing succeeds, DocumentReader
clamps the saved index to the discovered count and emits progress. The persistence
service preserves first-read timestamps and queues mutations. Failed initialization
now destroys the PDF loading task and closes the document session automatically.
Resize/zoom no longer re-saves progress, and EPUB resize does not re-extract chapters.

No real personal library was used in these tests.
