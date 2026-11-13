# Reader 25% zoom and older Android WebView fixes

> Follow-up (2026-11-13): integrated into the main checkout and the 1.1.98 local delivery branch. See [delivery and verification record](status/2026-11-13-1.1.98-local-delivery.md). The status below describes the original Dot handoff before packaging.


Date: 2026-11-13
Base: d596013 (published 1.1.97 source)
Status: local source fix, not published; affected Huawei Android 9 hardware not available for verification.

## Changes

- The shared reader, desktop logarithmic slider, wheel/pinch handling and Android native frame geometry now consistently allow 25%–600%. Reset remains 100%. Ordinary and both panorama directions retain the lower scale after gesture release.
- Android renderer compilation targets Chromium 70 instead of 94, so startup code is transpiled for older WebViews. Desktop compilation target is unchanged.
- Startup capability detection safely initializes globalThis first. Added missing standard API fallbacks, cryptographically generated UUIDs, legacy media-query listeners and Web Animations completion handling.
- WeakRef remains an optional cache rather than a required runtime. Native PDF thumbnail generation works without it. MOBI workers load compatibility support and can read Blob data without Blob.arrayBuffer.
- Older DOM replacement and transform paths are supported. Android portalled settings menus no longer rely on :has() to appear above their dialog. Cover layout has a fallback for engines without aspect-ratio.
- A small classic ES5 startup guard displays a retry button and WebView version if the app module cannot load or initialize. It does not delete user data, expose raw errors, or overwrite a mounted reader.
- Chinese, English and Japanese reader guides now document the 25% limit.

## Verification

- npm run verify: desktop renderer and Electron type/build checks passed; 152 core tests passed, one existing 7z literal-wildcard test skipped; 333 DOM tests passed.
- All Android Java sources compiled with the installed JDK 17 and Android 35 SDK using --release 8. Existing native queue checks and the new native/web zoom-boundary contract passed.
- npm run build:android:renderer passed.
- npx playwright test --config tests/reader-minimum-zoom.playwright.config.ts: 6 passed. Desktop Ctrl+wheel and Android-style CDP two-finger pinch reach 25% and expand again in ordinary, horizontal panorama and vertical panorama readers.
- npx playwright test --config tests/legacy-startup.playwright.config.ts: 5 passed. Uses the real production Android entry and a mock native file RPC bridge, not the test-only React entry. Includes normal and missing-API startup, real settings-menu mouse clicks with hit testing, module-load failure recovery, and forced old aspect-ratio layout branches at 960×600 and 1280×800.
- Legacy startup browser used Chromium 100. Missing APIs were removed before app initialization. This is regression coverage for fallback logic, not an actual Chromium 70 or Huawei device certification.

## Reproduce

Run npm run verify with JAVA_HOME pointing to an installed JDK to include the native queue test.
Build the Android renderer before running legacy-startup.playwright.config.ts. Optionally set OMI_TABLET_BROWSER to an installed older Chromium executable; the config otherwise uses Playwright's browser. The isolated browser test servers use ports 5198 and 5199 and do not reuse an existing development server.

## Remaining device check

Install a signed test build on the reported Huawei Android 9 tablet and check cold launch, library opening, image/PDF/EPUB reading and 25% pinch zoom in all reader layouts. Record the exact tablet model and Android System WebView/Chrome version if launch still fails. Android OS version alone does not identify its WebView engine.

No remote push, release, installer/APK publication, signing-key creation or user-data migration was performed. The original development checkout and its pending edits were left untouched.
