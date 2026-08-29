# Compress Image (WebP)

[![Release](https://img.shields.io/github/v/release/bjornclauw/compress-image-webp?logo=github)](https://github.com/bjornclauw/compress-image-webp/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An [Obsidian](https://obsidian.md) plugin that automatically compresses images and converts them to **WebP** — on paste, on drop, on multi-upload, and via batch conversion of existing vault images. All compression happens **client-side** via the Canvas API. Nothing is uploaded anywhere.

## Features

- **Paste & drop interception** — images pasted or dropped into the editor are resized and converted to WebP automatically.
- **File Explorer drop** — drop images onto a folder in the sidebar to save them there, compressed.
- **Multiple uploads** — ribbon icon / command to pick multiple images from a system dialog, compressed and inserted as links.
- **Batch conversion** — one command converts all legacy images (PNG, JPG, BMP, static GIFs) in the vault, rewriting internal links via Obsidian's file manager.
- **Excluded folders** — pick folders from an autocomplete list; their images are always preserved byte-for-byte with their original extension (e.g. high-resolution source art).
- **Animated GIF safety** — animated GIFs are detected by frame count and left untouched, so they never lose their animation.
- **EXIF-safe** — decoding strips metadata and honors EXIF orientation.
- **Smart sizing** — longest dimension capped (default 2000 px) with high-quality iterative downscaling.
- **Detailed batch report** — a summary popup shows converted, skipped, and excluded counts, exact space saved, and per-file errors.
- **Cancel anytime** — batch conversion runs with a progress bar and a cancel button.
- **Mobile support** — works on Android and iOS (`OffscreenCanvas` with a `HTMLCanvasElement` fallback).

## Installation

### From GitHub releases (manual)

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/bjornclauw/compress-image-webp/releases).
2. Create the folder `<vault>/.obsidian/plugins/compress-image-webp/`.
3. Copy the three files into it and reload Obsidian.
4. Enable **Compress Image (WebP)** under Settings → Community plugins.

### Via BRAT

```
BRAT → Add Beta plugin → https://github.com/bjornclauw/compress-image-webp
```

## Usage

| Action | How |
|---|---|
| Paste an image | `Ctrl/Cmd+V` in the editor — saved as WebP and linked |
| Drop an image into a note | Drag onto the editor |
| Drop images into a folder | Drag onto the File Explorer |
| Pick multiple files | Ribbon icon *Add image(s) and compress* or command **Compress and add image(s)** |
| Convert existing vault images | Command **Convert all images to webp** (confirm dialog, progress bar with cancel, detailed result report) |

Converted files are named `originalname_YYYY_MM_DD_HH_mm_ss.webp` (timestamp optional via settings) and all internal links are updated when renaming during batch conversion.

## Settings

| Setting | Default | Description |
|---|---|---|
| Max dimension | `2000` px | Longest edge of the compressed image; larger images are downscaled |
| WebP quality | `0.9` | Encoder quality (0.1–1.0) |
| Skip small files | on | Batch conversion ignores files below the threshold |
| Skip threshold | `200` KB | Size under which files are left alone |
| Add timestamp | on | Append a human-readable timestamp to saved filenames |
| Enable multiple uploads | on | Show the multi-upload ribbon icon and command |
| Skip WebP compression | off | Insert pasted WebP files as-is without re-encoding |
| Image display width | Default | Adds a display width to inserted image links (e.g. `![[image.webp\|500]]`); the file keeps its full resolution. Applies to paste, drop, and multi-upload |
| Excluded folders | empty | List of vault-relative folders with autocomplete, add/delete/reorder; matching is case-insensitive, recursive, and also applies to paste/drop/upload destinations |

On Obsidian 1.13.0+, all settings are searchable from Obsidian's settings search. Older versions get the classic settings panel.

### Behavior details

- **Excluded folders** are checked against the *final attachment path*: if a paste or drop would land inside one, the original bytes and original extension are preserved instead of converting to WebP.
- **Small files** and **animated GIFs** are reported as *skipped* in the batch report; images inside excluded folders are counted as *left in excluded folders*. Failures never abort the batch and are listed by path in the report.
- **SVGs are never rasterized.**

## Compatibility

Tested alongside other plugins to make sure nothing steps on each other's toes:

- [Media Companion](https://github.com/Nick-de-Bruin/obsidian-media-companion) — image compression and batch conversion work cleanly with media managed by Media Companion.

Using Compress Image with another plugin and found an issue (or confirmed it just works)? Open an issue or PR to extend this list.

## Privacy

All image processing uses the browser/Electron Canvas API locally inside Obsidian. No network requests are made, and no image data ever leaves your device.

## Development

```bash
npm install        # install dependencies
npm run dev        # watch mode with inline sourcemaps
npm run lint       # Obsidian plugin review ruleset (eslint-plugin-obsidianmd)
npm run build      # typecheck (tsc -noEmit) + production bundle -> main.js
```

The bundle targets ES2018, CJS, with `obsidian`, `electron`, and `@electron/remote` marked external.

### Releasing

Releases are automated by GitHub Actions: pushing a tag (e.g. `1.0.2`) builds the plugin and attaches `main.js`, `manifest.json`, and `styles.css` to a GitHub release with build-provenance attestation. The workflow fails if the tag does not match `manifest.json` → `version`.

## License

[MIT](LICENSE)

---

If this plugin saves you disk space and time, consider [buying me a coffee](https://buymeacoffee.com/bjornclauw) ☕
