# Filters, undo and redo

Filter applies Grayscale, Threshold, Sepia or Invert colors to the whole image in one step and reports how long it took. Undo and Redo walk a history of up to 20 prior states; a new edit after undo discards the redo branch. Save downloads the committed image as `processedImage.png`.

## Sub-features

- `filter-apply` applies each of the four filters and reports `<Name> applied in N ms`.
- `filter-path` notes `using the canvas filter path` for Grayscale, Sepia and Invert; Threshold always uses the pixel loop.
- `history-undo` restores the previous committed pixels and enables `Redo`.
- `history-redo` reapplies the undone state.
- `history-branch` clears `Redo` when a new edit follows an undo.
- `history-cap` keeps at most 20 undo steps.
- `export-save` starts a PNG download and reports `PNG download started.`.

## How to get to it (user POV)

- Open `Filter` in the toolbar and choose `Grayscale`, `Threshold`, `Sepia` or `Invert colors`.
- Click `Undo` or `Redo` in the toolbar.
- Click `Save` in the toolbar.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/control.sh doctor` exits 0 and the 800x600 fixture is loaded.
- `read-state.js` with samples `[[10, 10], [400, 300]]` shows `canUndo: false` and records the baseline pixels (about `230,62,72` and `102,105,59`).

- **Sepia.** `browser_click` `Filter`, then `Sepia`. Status reads `Sepia applied in N ms using the canvas filter path.`; `Undo` is enabled; both samples change (observed `152,135,105` and `132,118,92`).
- **Undo.** `browser_click` `Undo`. `canUndo: false`, `canRedo: true`, samples equal the baseline exactly.
- **Redo.** `browser_click` `Redo`. Samples return to the sepia values; `canRedo: false`.
- **Grayscale.** `browser_click` `Filter`, `Grayscale`. Each sample has `r == g == b`.
- **Invert.** `browser_click` `Filter`, `Invert colors`. Each sample channel equals `255 - previous`.
- **Threshold.** `browser_click` `Filter`, `Threshold`. Status lacks `using the canvas filter path`; each sample is `0,0,0` or `255,255,255`.
- **Branch.** `browser_click` `Undo` twice, then apply `Sepia`. `canRedo: false`.
- **Cap.** Apply filters 25 times alternating `Invert colors` and `Grayscale`. Then click `Undo` until it disables; count the clicks. Expect exactly 20.
- **Export.** `browser_click` `Save`. Status reads `PNG download started.`. The file itself is not inspectable here; record that explicitly.
- **Proof.** Save all `read-state.js` outputs to `filters-undo-redo.json` and a screenshot `filters-sepia-after.png` with the status line visible.

## Gotchas

- Open the `Filter` menu before each item click; it closes after every selection.
- Buttons go disabled while a commit is pending; if a click does nothing, re-read `canUndo`/status and click again rather than assuming a bug.
- Exact sepia/grayscale values depend on the browser's canvas filter implementation; assert direction and relationships (`r == g == b`, `255 - x`), not literal numbers, except for undo which must be exact.
- Threshold's pixel loop on a 4000x3000 fixture takes noticeably longer; wait on the status text.
- Download verification lives in `test/manual/README.md`; do not claim the exported file was checked.
