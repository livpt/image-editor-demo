# Load an image

Load an image lets a user bring a picture into the editor by choosing a local file, dropping a file, or dropping an image URL. Until an image loads, every tool is disabled and the drop helper is visible; afterwards the toolbar is live and the status names the file.

## Sub-features

- `load-choose` loads a local file from the `Choose image` control.
- `load-drop-file` loads a file dropped anywhere on the page.
- `load-drop-url` loads an image from a dropped URL and reports an error for sources that block canvas access.
- `load-enable` enables the toolbar and hides the helper once the image is ready.
- `load-replace` replaces the current image and discards its history.
- `load-reject` rejects non-image files with a status error and no change.

## How to get to it (user POV)

- Click `Choose image` in the helper and pick a file.
- Drag an image file from the desktop onto the page.
- Drag an image from another browser tab or a URL onto the page.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/control.sh doctor` exits 0.
- A fresh `browser_navigate` to `http://127.0.0.1:5199/` so no image is loaded.

- **Empty state.** Take `browser_snapshot` with `interactiveOnly: true`. Every toolbar button (`Draw`, `Pen`, `Crop`, `Resize`, `Filter`, `Undo`, `Redo`, `Save`) lists `states: [disabled]`; `read-state.js` returns `controlsEnabled: false`, `canvasVisible: false`.
- **Choose a file.** Evaluate `scripts/load-fixture.js` with `(800, 600)`. The result is `status: "verify-fixture-800x600.png is ready to edit."`, `controlsEnabled: true`, `canvasWidth: 800`, `canvasHeight: 600`.
- **Toolbar live.** Take `browser_snapshot` again. Only `Undo` and `Redo` remain disabled; a `status` node reads `verify-fixture-800x600.png is ready to edit.`; `read-state.js` returns `canvasVisible: true` and pixel `10,10` near `{ r: 230, g: 62, b: 72 }`.
- **Drop a file.** Build the same `File` as `load-fixture.js` but, instead of the `#fileInput` lines, dispatch `new DragEvent("drop", { dataTransfer, bubbles: true, cancelable: true })` on `#dragAndDropZone`. Same ready status and size as above.
- **Drop a URL.** Dispatch a `drop` on `#dragAndDropZone` whose `DataTransfer` has `setData("text/uri-list", "http://127.0.0.1:5199/assets/images/dragImg.png")` and no files. Status reads `Image is ready to edit.` and the canvas takes that PNG's intrinsic size.
- **Replace.** With an edit in history (apply `Sepia`), load the fixture again at `(400, 300)`. `read-state.js` shows `canvasWidth: 400`, `canUndo: false`, `canRedo: false`.
- **Reject.** Dispatch `change` on `#fileInput` with a `File(["x"], "note.txt", { type: "text/plain" })`. Status reads `Choose a valid image file.` with `statusError: "true"`; canvas size and `controlsEnabled` are unchanged.
- **Proof.** Save `read-state.js` output from the empty, loaded and rejected steps to `load-image.json`, plus `browser_take_screenshot` `load-image-loaded.png` copied into the evidence directory.

## Gotchas

- The OS file picker never opens from the browser tool; `load-fixture.js` is the accepted stand-in and must be named as such in the evidence.
- A cross-origin URL that lacks CORS headers loads visually but fails the canvas-access probe with `This image cannot be edited because its source blocks canvas access.`; that is correct behavior, not a bug.
- `statusError` is the string `"true"`/`"false"`, not a boolean.
- Loading a 4000x3000 fixture takes noticeably longer; `load-fixture.js` waits up to 20 s for the ready status.
