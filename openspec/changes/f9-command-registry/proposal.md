# Proposal

## Why

Toolbar actions, a future script, and undo labels do not share one validated edit. History stores unnamed bitmaps, so the page cannot say which command it undid. Later editor work depends on this command layer, and this change does not need a new pixel model.

## What Changes

- Add named commands for the edits that exist today. Those are load, crop, resize, grayscale, threshold, sepia, invert, pen, line, rectangle, and ellipse.
- Reject invalid parameters before any paint. The image and the history stay as they were.
- Store each history entry as a name, a label, JSON parameters, and a snapshot. Keep at most 20 prior states. Also release prior snapshots once their bytes pass 256 MiB. The current image does not count toward that budget.
- Expose a frozen `window.app` facade with `run`, `undo`, `redo`, `commands`, and `doc`. Add undo and redo keyboard shortcuts and a small console panel.
- **BREAKING** for callers of the old canvas mutators. The page is the only caller, and those methods are removed in this change.

## Capabilities

### New Capabilities

- `command-registry`: Named, validated edits, labelled history, the DevTools facade, and undo/redo shortcuts.

### Modified Capabilities

- `canvas-editing`: Prior history releases snapshots once their bytes pass 256 MiB, so a large image keeps fewer than 20 undo steps.

## Impact

- Code. `commands.js`, `history-store.js`, `canvas.js`, `index.js`, `index.html`, `styles.css`, and the unit tests for the registry and the history store.
- Dependencies. None added. The editor stays client-only.
- Browsers. Current Chrome, Firefox, and Safari. The change uses `createImageBitmap` and `ImageBitmap.close()`, which those browsers already provide for the existing history.

Performance. A command builds one scratch canvas and one bitmap, which is the same commit cost as today. Parameter checks run before that allocation. Pointer moves still preview on the overlay and commit once, on release. Undo and redo stay blocked while a commit is in flight, and the busy flag is set before the bitmap await so a second command cannot start on the pre-commit pixels.

Memory. A snapshot costs about `width * height * 4` bytes. Twenty frames of a 4000 by 3000 image are about 960 MiB before the current frame. The 256 MiB cap on prior frames keeps about five of those frames and closes the rest. A small image never reaches that cap, so the count of 20 still applies. The current frame is exempt, so one large image can still be opened and edited. The command table and the console log are small next to a single frame. The tradeoff is that undo still stores full frames, and a large image can drop the original load from history after a few edits. Partial-frame undo is out of scope.
