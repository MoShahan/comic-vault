# Features & usage

## Features

### Library

| Feature          | Description                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Cover grid       | Each comic shows its **first page** as cover art                                            |
| Continue reading | Jump back to the last unfinished issue                                                      |
| Organize         | Filters (all / unread / reading / finished / favorites), sort (recent / title / progress)   |
| Series           | Light grouping inferred from titles (e.g. `Batman #12`)                                     |
| Folder library   | **Select a folder** (Android) - all CBZ/ZIP files in it appear on your shelf                |
| Delete           | Confirmation dialog → remove from app **and** try to delete the original file on device     |

### Reader

| Feature      | Description                                                              |
| ------------ | ------------------------------------------------------------------------ |
| Navigation   | Swipe left/right or up/down · tap edge zones · always LTR page order     |
| Progress     | Page position (and double-page half) saved as you read                   |
| Spreads      | Wide pages auto-split in portrait when enabled                           |
| Controls     | Scrubber, pinch / double-tap zoom, brightness dimmer, dark reader chrome |
| Comfort      | Keep screen awake while reading · pages always fit and centered on screen |
| Mark as read | Manual only - from detail screen or reader chrome                        |

### App

| Feature | Description                                                     |
| ------- | --------------------------------------------------------------- |
| Themes  | Light, dark, or follow system                                   |
| Storage | See how much space the library uses · repair / re-extract pages |
| Privacy | No accounts · no comic uploads · no analytics                   |

---

## How to use

1. **Select folder** (Android) - pick a folder of CBZ/ZIP comics; they appear on your shelf
2. Open a cover → **Start** or **Continue** reading
3. Tap the **center** of a page for controls (scrubber, mark read, dimmer)
4. Tap edges or swipe to turn pages
5. Use **Mark as read** when _you_ decide you’re done
6. **Delete** asks for confirmation, then clears the app copy and attempts to remove the original file

### Delete behavior

After you confirm delete:

1. Extracted pages in the app sandbox are removed
2. The SQLite library row is removed
3. The original file is deleted when the OS allows it

If the system blocks deleting the original (common with some Android `content://` URIs), the comic is still removed from Comic Vault and you’ll get a short alert to delete the file manually.

> Folder selection uses Android’s Storage Access Framework. iOS folder picking is not available in this Expo Go build yet.

---

## Supported formats

| Format            | Status                                                      |
| ----------------- | ----------------------------------------------------------- |
| **CBZ** / **ZIP** | Supported in Expo Go                                        |
| **CBR** (RAR)     | Not supported in Expo Go - convert to CBZ first (see below) |

### Why CBR is hard

**CBZ** is a ZIP archive of images. ZIP is well supported in JavaScript, so Comic Vault can unpack pages with libraries like `fflate` inside Expo Go.

**CBR** is a **RAR** archive. RAR is a proprietary format:

- There is no reliable, pure-JavaScript RAR unpacker suitable for production (especially newer RAR5 archives).
- Unpacking needs a **native** UnRAR / libarchive library on iOS and Android.
- Native modules require a **custom Expo dev build** (or ejecting), not the standard **Expo Go** app.
- UnRAR also has **licensing** constraints that complicate shipping it in an open-source / personal build.

So CBR support is possible later with a native build, but it is intentionally deferred. Converting CBR → CBZ on a PC is the practical path for Expo Go.

### Convert CBR → CBZ (Windows)

1. Open the `.cbr` in [7-Zip](https://www.7-zip.org/) or WinRAR
2. Extract all page images
3. Zip the folder and rename `.zip` → `.cbz`
4. Put the CBZ in your comics folder and select that folder in Comic Vault
