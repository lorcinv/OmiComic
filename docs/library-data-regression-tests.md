# Library data regression tests

`tests/library-data.test.cjs` loads the real compiled `appDataService`, mocking only Electron's `app.getPath('userData')`. Each case uses its own temporary directory, real JSON writes, module reloads, and automatic fixture cleanup. No personal library or source app files are changed.

Run:

```sh
npm run build:electron
node --test --test-concurrency=1 tests/library-data.test.cjs tests/progress-ipc.test.cjs
```

The new suite is also included by `npm test` through its existing test glob.

Coverage (8 new cases):

- Legacy JSON: default settings, inverted legacy delete-confirm settings, historic progress/recent reconstruction, old virtual-folder descriptions and bookshelf ownership.
- Malformed legacy records: valid record preservation, duplicate rejection, bounded cache/preload/concurrency settings, clamped page index and invalid cover removal.
- Unicode multiline notes, tag normalization/order, favorite metadata synchronization and tag removal across metadata, favorites, bookmarks and folders.
- Favorite refresh without duplication, bookmark page toggling, archive inner paths and persistent manual ordering.
- Progress first-read/view-state retention, started-reading state, recent-history removal and restoration only on reopening.
- Bookshelf/folder/item ordering, duplicate-name protection, scoped bookshelf deletion and last-bookshelf protection.
- Reference-only copy, duplicate-target move and batch move: correct counts, identity/path retention, old cover cleanup and byte-for-byte source preservation after clearing/deleting virtual folders.
- Invalid-reference cleanup by source path and resource key across all record collections, without touching source files or unrelated metadata.

Verified 2026-10-09: Electron TypeScript build passed; 8/8 new tests and 2/2 existing progress/IPC tests passed together. These are persistence/service regressions, not a substitute for desktop UI or real archive/PDF/EPUB rendering tests.
