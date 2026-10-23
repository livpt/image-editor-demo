# Resize

Resize opens a dialog pre-filled with the current dimensions. With `Keep the image ratio` on, editing one field updates the other; saving rescales the image with smoothing as one history step. Zero, negative or empty values are rejected in place, and Cancel or Close leaves the image unchanged.

## Sub-features

- `resize-open` opens the `Resolution` dialog with the current width and height.
- `resize-ratio` keeps the aspect ratio while the checkbox is on.
- `resize-free` allows independent dimensions when it is off.
- `resize-save` rescales the image and reports the new size.
- `resize-reject` shows `Enter positive width and height values.` for invalid input and keeps the dialog open.
- `resize-cancel` closes without change via `Cancel`, `Close` or Escape.

## How to get to it (user POV)

- Click `Resize` in the toolbar.
- Focus `Resize` and press Enter or Space.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/control.sh doctor` exits 0 and the 800x600 fixture is loaded.

- **Open.** `browser_click` `Resize`. `browser_snapshot` shows a dialog with heading `Resolution`, spinbuttons `Width` = `800` and `Height` = `600`, checkbox `Keep the image ratio` checked; `read-state.js` shows `resizeDialogOpen: true`.
- **Ratio lock.** `browser_fill` `Width` with `400`. Snapshot shows `Height` = `300`.
- **Save.** `browser_click` `Save changes`. Dialog closes, status reads `Resized to 400 × 300.`, `read-state.js` shows `canvasWidth: 400`, `canvasHeight: 300`, `canUndo: true`.
- **Undo.** `browser_click` `Undo`. Size returns to `800x600`.
- **Free resize.** `browser_click` `Resize`, `browser_click` the `Keep the image ratio` checkbox to uncheck it, `browser_fill` `Width` `200`, `browser_fill` `Height` `600`, `browser_click` `Save changes`. Status `Resized to 200 × 600.` and the canvas matches.
- **Reject.** `browser_click` `Resize`, `browser_fill` `Width` with `0`, `browser_click` `Save changes`. The `alert` text reads `Enter positive width and height values.`, `resizeDialogOpen: true`, canvas size unchanged. Repeat with an empty `Width`.
- **Cancel.** `browser_fill` `Width` `50`, `browser_click` `Cancel`. Dialog closes and the canvas size is unchanged. Reopen and `browser_press_key` `Escape`; same result.
- **Proof.** Save `read-state.js` before/after each save and reject to `resize.json`, and a screenshot `resize-dialog.png` of the open dialog with values visible.

## Gotchas

- `browser_fill` sets the value and fires `input`, which is what the ratio sync listens to; typing character by character also works but produces intermediate ratio updates.
- The browser's own `min="1"` validation can block submit before the app's message appears; the `alert` text is the app's, the tooltip is the browser's. Either proves rejection, but record which one fired.
- The ratio used for syncing is the ratio at dialog open, so after a free resize to `200x600` the next ratio-locked edit keeps 1:3.
- Resize is lossy; after undo, pixel samples match the pre-resize image exactly, but after redo they are interpolated.
