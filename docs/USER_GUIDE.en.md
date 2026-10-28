# OmiComic · User guide

In the app: Settings → About OmiComic → User guide. Search, category jumps and expandable answers work offline. This document shares the in-app content source.

[Getting started](#guide-start) · [Library](#guide-library) · [Reading](#guide-reading) · [Shortcuts](#guide-shortcuts) · [Appearance](#guide-appearance) · [Troubleshooting](#guide-help)

<a id="guide-start"></a>

## Getting started

<details>
<summary>How do I open comics?</summary>

**Windows：** Open My library → Add folder at the bottom left, select your comic folder, then double-click a comic. Use Open file for a single file.

**Android：** Open the library → top-left menu → Add folder. Choose a folder in the system picker, grant access, then tap a comic.

</details>

<details>
<summary>How do I resume reading?</summary>

**Windows：** Double-click a recent cover on Home, click Continue reading on hover, or use the Omi icon at the top left.

**Android：** Tap a recent cover on Home. Reading progress is saved automatically.

</details>

<details>
<summary>Which files are supported?</summary>

Image folders, JPG/PNG/WebP/BMP/GIF, ZIP/CBZ, RAR/CBR, 7z/CB7, PDF and EPUB. Archives open without manual extraction; EPUB progress counts chapters.

</details>

<a id="guide-library"></a>

## Library

<details>
<summary>What do the card controls do?</summary>

The heart toggles favorites; on Android it is at the top right of the card. The three dots open details. Folder arrows expand the tree; folder names navigate. Details show paths, tags, notes and page previews.

**Windows：** Double-click a page preview to read from there. Double-click the description to edit; click outside to save.

**Android：** In a grid, tap a comic to read. In a list, tap its cover for details or its text to read. Long-press for actions.

</details>

<details>
<summary>How do I search and filter?</summary>

PC and Android share the same search syntax. Library search includes every subfolder of the active root and matches each file or folder by its own name, notes and tags, excluding its path. Results appear in discovery batches, with folders before comics in each batch; later results append without moving existing hits or your page position. Favorites and Bookmarks search their current view. Bookmarks also match bookmark titles and page names. Separate conditions with English or Chinese commas; choose Any condition or All conditions in Settings → Library → Condition matching. The same setting controls multiple selected tags.

**Windows：** Ctrl+K focuses search.

- **school,daily** — Any condition matches either term; All conditions requires both.
- **Keywords with spaces** — By default, blue moon stays one keyword. Enable Space-separated conditions to require every unquoted space-separated term.

</details>

<details>
<summary>What advanced search syntax is available?</summary>

Both platforms support the syntax below. Space-separated conditions are off by default and can be enabled in Settings → Library. Spaces, commas and pipes inside quotes remain literal. Separate exclusions too: tag:school,-romance with All conditions requires school and excludes romance.

- **adventure | growth** — Always matches either condition, regardless of the condition setting.
- **-school** — Exclude entries containing this keyword.
- **tag:school** — Search tags only.
- **name:volume** — Search names only; title: is also supported.
- **note:later** — Search notes and supplementary text.
- **tag:school$** — Match the complete tag. artist:Alice$ also matches a full namespaced tag.
- **"blue moon" / tag:"full color"$** — Quotes preserve a phrase, including spaces and separators in names or tags.

</details>

<details>
<summary>How do compact windows and tablets adapt?</summary>

**Windows：** Wide windows keep page navigation in the footer. Compact windows place page and selection actions above the cards at the lower right, with labels beside their icons. Page numbers and page size stay in the footer, and the top toolbar stays on one row.

**Android：** Tablets automatically add grid columns as the screen grows; wide list layouts use two columns. The grid setting remains your phone density baseline. Rotation adjusts the layout, while settings and sheets keep comfortable widths.

</details>

<details>
<summary>How do I browse random comics?</summary>

Library, Favorites and Bookmarks support random browsing after search and tag filters. Your page size sets the batch size; use Shuffle again to change the order. Known comics appear first while the catalog discovers subfolders in the background. Each image folder is one book. Newly discovered comics join the next shuffle. Reading preserves the current batch; turning random off restores the ordinary order and position.

**Windows：** Random reading sits immediately right of Add folder in the footer; enabling it reveals the refresh icon within the same control, separated by a vertical line.

**Android：** Open display options at the top right and enable Random beside sorting; the page control becomes Shuffle.

</details>

<details>
<summary>How do folder navigation and position restore work?</summary>

Select Library, Bookshelves or another navigation entry again to return to its top level. Back goes up one level and restores the previous list position.

**Windows：** The footer keeps Back and Forward; Forward reopens the directory you just left.

</details>

<details>
<summary>Shelves, favorites or bookmarks?</summary>

Shelves group comics by series or plan, favorites keep frequent reads, bookmarks point to a page, and recent reads resume progress. These store references without moving files.

**Windows：** Middle-drag cards where manual ordering is supported. Files opened directly are listed in Temporary files.

**Android：** Long-press to enter selection or ordering, then drag cards to reorder.

</details>

<details>
<summary>Does removing a record delete the comic?</summary>

Removing favorites, bookmarks, history or shelf entries affects those records. Remove index only keeps the file but clears related records; restoring the index does not restore cleared progress.

**Windows：** Only explicitly choosing to delete the local file sends it to the Recycle Bin. Renaming a local file updates related references.

**Android：** Delete local file is permanent. Deleting a folder includes its contents; check the path before confirming.

</details>

<a id="guide-reading"></a>

## Reading

<details>
<summary>What do the reading controls do?</summary>

- **Single / double** — Choose pages shown together; narrow windows show one page at a time.
- **Reading direction** — Switch left-to-right / right-to-left.
- **Horizontal / vertical** — Change how pages are arranged.
- **Panorama** — Read continuously; horizontal fits height, vertical fits width.
- **Progress / page number** — Click, drag or enter a page number to jump.
- **Bookmark / play** — Save the current page / start or pause auto-reading.

</details>

<details>
<summary>How do I zoom and pan?</summary>

Normal reading offers fit window, width, height or original size. Panorama chooses fitting from the reading flow.

**Windows：** Ctrl+wheel zooms, left-drag pans, and double-click resets free zoom. F toggles immersive reading; move to the top or bottom for tools.

**Android：** Pinch to zoom, drag to pan, and double-tap to reset. Comics open fitted to the window.

</details>

<details>
<summary>How do I enable auto-reading?</summary>

Press play to start and pause to stop. Normal mode advances at intervals; panorama scrolls continuously. Leaving the reader or reaching the end stops it.

**Windows：** Open Settings → Comic reading settings from the comic details to set interval and speed. Manual actions stop playback.

**Android：** Play is at the right end of the progress bar. Set speed in Comic reading settings; manual actions pause temporarily, then resume.

</details>

<details>
<summary>Do image adjustments change my files?</summary>

No. Brightness, contrast, gamma and color effects change display only; Reset restores the original view. Sharpening and denoising do not apply to EPUB; set both to zero if details look soft.

**Windows：** Adjustments are saved per comic.

**Android：** Adjustments apply globally.

</details>

<a id="guide-shortcuts"></a>

## Shortcuts

<details>
<summary>Reading keys · Windows</summary>

- **← / →** — Turn pages in the selected reading direction.
- **PageUp / Backspace** — Previous page or spread.
- **PageDown / Space** — Next page or spread.
- **Home / End** — First / last page.
- **↑ / ↓** — Previous / next comic when available.
- **F / Esc** — Toggle immersive mode / dismiss overlays, leave immersive mode, then go back.

</details>

<details>
<summary>Library keys and mouse · Windows</summary>

- **Ctrl+K** — Focus search.
- **Ctrl+wheel** — Resize cards / previews; zoom the reading image.
- **Middle-drag** — Reorder where manual sorting is supported.
- **Ctrl+A / Delete** — Select all / remove entries in selection mode.
- **PageUp / PageDown** — Jump to the previous / next list group when pagination is shown.
- **Esc** — Dismiss menus or selection first; go up in subfolders.

</details>

<details>
<summary>Touch and volume keys · Android</summary>

- **Tap center** — Show / hide the toolbar.
- **Swipe / pinch** — Turn pages or scroll / zoom.
- **Long-press card** — Open actions, selection or ordering.
- **Drag progress** — Jump live; tap preview thumbnails to refine.
- **Volume + / −** — Enable volume-key paging in Default reading for previous / next page; direction can be reversed.
- **Back key / gesture** — Dismiss the topmost surface before going back.

</details>

<a id="guide-appearance"></a>

## Appearance

<details>
<summary>How do I change theme and display size?</summary>

**Windows：** Settings → Appearance: choose theme and language, and adjust global and page-number text sizes. Change card size in View.

**Android：** Settings → Appearance: choose theme, language and the view to customize, then set grid columns or cover size. Each view keeps its own layout.

</details>

<details>
<summary>How do I start directly in the library?</summary>

Settings → Appearance → Show home screen is on by default. Turn it off to start directly in the library; turn it back on to restore Home.

</details>

<details>
<summary>How do I change the home mascot? · Windows</summary>

Settings → Appearance → Home mascot: choose an image, crop and save. PNG/JPG/WebP/BMP up to 20 MB. Custom art hides all default Omi mascots; Restore default brings them back.

</details>

<details>
<summary>Defaults or per-comic settings?</summary>

Default reading sets initial preferences. Page order and auto-reading speed can be saved per comic; open that comic's details before changing reading settings. PDF/EPUB retain document order.

</details>

<a id="guide-help"></a>

## Troubleshooting

<details>
<summary>Why is a comic missing from the list?</summary>

Clear search and tag filters, check the current folder, then refresh. Restore the index for hidden files. If files moved or Android access expired, check paths and permissions.

</details>

<details>
<summary>Missing tools or no double-page spread?</summary>

**Windows：** Move the mouse to the top or bottom to reveal tools, or adjust auto-hide. For double pages, check window width, spread detection and vertical panorama.

**Android：** Tap the center for tools. For double pages, check screen width, spread detection and vertical panorama.

</details>

<details>
<summary>Does clearing cache remove progress?</summary>

No. Cache speeds up loading; clearing it does not remove comics or progress and may trigger regeneration. Start with default performance settings; set preload to 0 to disable it.

</details>

<details>
<summary>How do I update and back up?</summary>

Back up comic files separately from app records. Comic downloading and cross-device cloud sync are not built in.

**Windows：** Close the app and back up %APPDATA%\OmiComic. For portable updates, fully extract the new ZIP and run its EXE; local records are retained.

**Android：** Install the new APK with the original signing key over the existing app to retain data; do not uninstall first.

</details>
