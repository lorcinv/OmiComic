# OmiComic · User guide

In the app: Settings → About OmiComic → User guide. Browse a category or search by keyword, even offline. This document uses the same content as the in-app guide.

[Getting started](#guide-start) · [Library](#guide-library) · [Reading](#guide-reading) · [Shortcuts](#guide-shortcuts) · [Appearance](#guide-appearance) · [Troubleshooting](#guide-help)

<a id="guide-start"></a>

## Getting started

<details>
<summary>How do I add comics to the library?</summary>

Keep each comic in its own folder or archive, then add their parent folder to the library. For example, Comics → Volume 1 → 001.webp, 002.webp: add Comics. Adding a folder does not copy or move files.

**Windows**: Use Add folder, or drag one folder from your file manager onto any OmiComic screen. Adding it keeps your current view. Use Open file for individual comic files; files outside the library appear in Temporary.

**Android**: Open Library, tap the top-left menu, then Add folder. Choose the folder in the system picker and grant access, then tap a comic card to read.

</details>

<details>
<summary>How do I resume reading?</summary>

Reading progress is saved automatically. If Show home screen is off, use Recent reads to continue.

**Windows**: Double-click a recent cover on Home, click Continue reading on hover, or use the Omi icon at the top left.

**Android**: Tap a recent cover on Home. Reading progress is saved automatically.

</details>

<details>
<summary>Which comic and image formats are supported?</summary>

Supported: image folders; JPG/JPEG/PNG/WebP/BMP/GIF images; ZIP/CBZ, RAR/CBR, 7z/CB7, PDF and EPUB. Archives can be read without extracting them first. EPUB progress is shown by chapter.

</details>

<a id="guide-library"></a>

## Library

<details>
<summary>How do I open a comic and preview its pages?</summary>

The large image on a card is its cover. The heart adds or removes a favorite; the three dots open details with the file location, tags, description and page thumbnails.

**Windows**: Double-click a card to open it. In details, double-click a page thumbnail to read from that page. Double-click the description to edit it; click outside the editor to save.

**Android**: In grid view, tap a card to read. In list view, tap the cover for details or the title to read. The favorite heart is at the top right; long-press a card for organization actions.

</details>

<details>
<summary>How do I search and filter?</summary>

PC and Android share the same search syntax. Library search includes every subfolder of the active root and matches each file or folder by its own name, notes and tags, excluding its path. Results appear in discovery batches, with folders before comics in each batch; later results append without moving existing hits or your page position. Favorites and Bookmarks search their current view. Bookmarks also match bookmark titles and page names. Separate conditions with English or Chinese commas; choose Any condition or All conditions in Settings → Library → Condition matching. The same setting controls multiple selected tags.

**Windows**: Ctrl+K focuses search.

- **school,daily**: Any condition matches either term; All conditions requires both.
- **Keywords with spaces**: By default, blue moon stays one keyword. Enable Space-separated conditions to require every unquoted space-separated term.

</details>

<details>
<summary>What advanced search syntax is available?</summary>

Both platforms support the syntax below. Space-separated conditions are off by default and can be enabled in Settings → Library. Spaces, commas and pipes inside quotes remain literal. Separate exclusions too: tag:school,-romance with All conditions requires school and excludes romance.

- **adventure | growth**: Always matches either condition, regardless of the condition setting.
- **-school**: Exclude entries containing this keyword.
- **tag:school**: Search tags only.
- **name:volume**: Search names only; title: is also supported.
- **note:later**: Search notes and supplementary text.
- **tag:school$**: Match the complete tag. artist:Alice$ also matches a full namespaced tag.
- **"blue moon" / tag:"full color"$**: Quotes preserve a phrase, including spaces and separators in names or tags.

</details>

<details>
<summary>How do compact windows and tablets adapt?</summary>

**Windows**: Wide windows keep page navigation in the footer. Compact windows place page and selection actions above the cards at the lower right, with labels beside their icons. Page numbers and page size stay in the footer, and the top toolbar stays on one row.

**Android**: Tablets automatically add grid columns as the screen grows; wide list layouts use two columns. The grid setting remains your phone density baseline. Rotation adjusts the layout, while settings and sheets keep comfortable widths.

</details>

<details>
<summary>How do I browse random comics?</summary>

Library, Favorites and Bookmarks support random browsing after search and tag filters. Your page size sets the batch size; use Shuffle again to change the order. Known comics appear first while the catalog discovers subfolders in the background. Each image folder is one book. Newly discovered comics join the next shuffle. Reading preserves the current batch; turning random off restores the ordinary order and position.

**Windows**: Random reading sits immediately right of Add folder in the footer; enabling it reveals the refresh icon within the same control, separated by a vertical line.

**Android**: Open display options at the top right and enable Random beside sorting; the page control becomes Shuffle.

</details>

<details>
<summary>How do folder navigation and position restore work?</summary>

Select Library, Shelves or another navigation entry again to return to its top level. Back restores the previous list position; returning from a folder opened in search restores that search.

**Windows**: The footer keeps Back and Forward; Forward reopens the directory you just left.

</details>

<details>
<summary>Does removing a favorite, shelf item or bookmark delete the file?</summary>

No. Removing a favorite, shelf item, bookmark or history entry only removes that record. The comic file remains. Remove index only keeps the file but clears related records; restoring the index does not restore progress that was cleared.

**Windows**: Only explicitly choosing to delete the local file sends it to the Recycle Bin. Renaming a local file updates related references.

**Android**: Delete local file is permanent. Deleting a folder includes its contents; check the path before confirming.

</details>

<a id="guide-reading"></a>

## Reading

<details>
<summary>What do the reading controls do?</summary>

- **Single / double**: Choose pages shown together; narrow windows show one page at a time.
- **Reading direction**: Switch left-to-right / right-to-left.
- **Horizontal / vertical**: Change how pages are arranged.
- **Panorama**: Read continuously; horizontal fits height, vertical fits width.
- **Progress / page number**: Click, drag or enter a page number to jump.
- **Bookmark / play**: Save the current page / start or pause auto-reading.

</details>

<details>
<summary>How do I zoom and pan?</summary>

Normal reading offers fit window, width, height or original size. Panorama chooses fitting from the reading flow.

**Windows**: Ctrl+wheel zooms, left-drag pans, and double-click resets free zoom. F toggles immersive reading; move to the top or bottom for tools.

**Android**: Pinch to zoom, drag to pan, and double-tap to reset. Comics open fitted to the window.

</details>

<details>
<summary>How do I enable auto-reading?</summary>

Press play to start and pause to stop. Normal mode advances at intervals; panorama scrolls continuously. Leaving the reader or reaching the end stops it.

**Windows**: Open Settings → Comic reading settings from the comic details to set interval and speed. Manual actions stop playback.

**Android**: Play is at the right end of the progress bar. Set speed in Comic reading settings; manual actions pause temporarily, then resume.

</details>

<details>
<summary>Do image adjustments change my files?</summary>

No. Brightness, contrast, gamma and color effects change display only; Reset restores the original view. Sharpening and denoising do not apply to EPUB; set both to zero if details look soft.

**Windows**: Adjustments are saved per comic.

**Android**: Adjustments apply globally.

</details>

<a id="guide-shortcuts"></a>

## Shortcuts

<details>
<summary>Reading keys · Windows</summary>

- **← / →**: Turn pages in the selected reading direction.
- **PageUp / Backspace**: Previous page or spread.
- **PageDown / Space**: Next page or spread.
- **Home / End**: First / last page.
- **↑ / ↓**: Previous / next comic when available.
- **F / Esc**: Toggle immersive mode / dismiss overlays, leave immersive mode, then go back.

</details>

<details>
<summary>Library keys and mouse · Windows</summary>

- **Ctrl+K**: Focus search.
- **Ctrl+wheel**: Resize resource cards or page thumbnails in details; zoom while reading.
- **Middle-drag**: Reorder where manual sorting is supported.
- **Ctrl+A / Delete**: Select all / remove entries in selection mode.
- **PageUp / PageDown**: Jump to the previous / next list group when pagination is shown.
- **Esc**: In random mode, exit random first. Later presses dismiss menus, selection or search as applicable, then return to the parent folder.

</details>

<details>
<summary>Touch and volume keys · Android</summary>

- **Tap center**: Show / hide the toolbar.
- **Swipe / pinch**: Turn pages or scroll / zoom.
- **Long-press card**: Open actions, selection or ordering.
- **Drag progress**: Jump live; tap preview thumbnails to refine.
- **Volume + / −**: Enable volume-key paging in Default reading for previous / next page; direction can be reversed.
- **Back key / gesture**: Exit random mode first; later Back actions dismiss the keyboard, menus or search as applicable, then navigate back.

</details>

<a id="guide-appearance"></a>

## Appearance

<details>
<summary>How do I change theme and display size?</summary>

**Windows**: Settings → Appearance: choose theme and language, and adjust global and page-number text sizes. Change card size in View.

**Android**: Settings → Appearance: choose theme, language and the view to customize, then set grid columns or cover size. Each view keeps its own layout.

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
<summary>Can I add a folder by dropping it? · Windows</summary>

Yes. Drag one folder from your file manager onto the OmiComic window and release it. Home, the reader, settings and other screens all accept folders without interrupting reading. Existing folders are not added twice, and files are neither copied nor moved. Drop one folder at a time; use Open file for files.

</details>

<details>
<summary>Does one card mean one page or one comic?</summary>

A card is an entry in the current folder, not necessarily one page. Folder cards open folders; archive, PDF and EPUB cards open a comic or document. Inside an image folder, each image has its own card; opening one lets you read the other images in that folder too. For browsing by book, keep each comic in its own folder or archive.

</details>

<details>
<summary>Library, shelves, favorites or bookmarks?</summary>

Use Library to browse added folders, shelves to organize comics, favorites for quick access, and bookmarks to mark a page. These keep references without copying or moving your files.

- **Library**: Shows the folders you added and the comics inside them.
- **Shelves**: Create groups such as To read, an author or a series. Shelf bars organize several shelves.
- **Favorites**: Tap the heart to keep favorite or frequent reads in one quick-access list. No group is required.
- **Bookmarks**: Manually mark a page, or a chapter in EPUB. Open it from Bookmarks to return to that location.
- **Recent reads**: Automatically remembers your progress so you can continue without adding a bookmark.

</details>

<details>
<summary>How do I add comics to a shelf?</summary>

Find the comic in Library, then choose a shelf. Create one when prompted if you do not have a suitable shelf. Open Shelves to find it later.

**Windows**: Right-click the comic card → Add to shelf → choose a shelf, or choose Create shelf and add.

**Android**: Long-press the comic card in Library → Add to shelf → choose an existing shelf or create a new one.

</details>

<details>
<summary>How do I add or remove a favorite?</summary>

Tap or click the heart on a comic card. A highlighted heart means it is saved; press it again to remove it. Find these comics in Favorites. This does not download, copy or move files.

**Android**: On Android, the favorite heart is at the top right in both grid and list views.

</details>

<details>
<summary>How do I bookmark a page and return to it?</summary>

Open a comic and go to the page you want to keep. Press the bookmark icon in the reading toolbar; a highlighted icon means it is saved. Press it again to remove it. Open the card in Bookmarks to return to that location. EPUB bookmarks mark the current chapter.

**Windows**: If the toolbar is hidden, move the mouse to the top or bottom. Double-click a card in Bookmarks to open it.

**Android**: If the toolbar is hidden, tap the center of the screen. Tap a card in Bookmarks to open it.

</details>

<details>
<summary>Why do different images create only one favorite?</summary>

An image folder is treated as one comic. Favoriting an image saves its containing folder, so other images in the same folder do not create duplicate favorites. Adding it to a shelf also uses that image folder. To keep a particular page, open it and add a bookmark.

</details>

<details>
<summary>Why can a supported WebP image have no cover?</summary>

WebP images can be read, but opening the original and generating its cover are separate steps. If the original opens but the cover is blank, the issue is cover generation or compatibility, not a lack of WebP support. Some large WebP images can currently be affected. Report the app version and image dimensions, and keep the original sample.

</details>

<details>
<summary>Why is a comic missing from the list?</summary>

Clear search and tag filters, check the current folder, then refresh. Restore the index for hidden files. If files moved or Android access expired, check paths and permissions.

</details>

<details>
<summary>Missing tools or no double-page spread?</summary>

**Windows**: Move the mouse to the top or bottom to reveal tools, or adjust auto-hide. For double pages, check window width, spread detection and vertical panorama.

**Android**: Tap the center for tools. For double pages, check screen width, spread detection and vertical panorama.

</details>

<details>
<summary>Does clearing cache remove progress?</summary>

No. Cache speeds up loading; clearing it does not remove comics or progress and may trigger regeneration. Start with default performance settings; set preload to 0 to disable it.

</details>

<details>
<summary>How do I update and back up?</summary>

Back up comic files separately from app records. Comic downloading and cross-device cloud sync are not built in.

**Windows**: Close the app and back up %APPDATA%\OmiComic. For portable updates, fully extract the new ZIP and run its EXE; local records are retained.

**Android**: Install the new APK with the original signing key over the existing app to retain data; do not uninstall first.

</details>
