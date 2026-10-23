# Crop

Crop lets a user drag a rectangle on the image and keep only that region. Any drag direction works, an empty rectangle does nothing, and undo restores the full image at its original size.

## Sub-features

- `crop-select` selects the tool and the status reads `Crop tool selected.`.
- `crop-region` replaces the image with the dragged region, in intrinsic pixels.
- `crop-direction` produces the same result from all four drag directions.
- `crop-empty` ignores a zero-width or zero-height drag.
- `crop-undo` restores the previous image and dimensions as one history step.

## How to get to it (user POV)

- Click `Crop` in the toolbar, then press, drag and release on the image.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/control.sh doctor` exits 0 and the 800x600 fixture is loaded.
- `read-state.js` shows `canvasWidth: 800`, `canvasHeight: 600`.

- **Select.** `browser_click` `Crop`. Status reads `Crop tool selected.`.
- **Crop forward.** Evaluate `drag-pointer.js` with `({ x: 100, y: 100 }, { x: 400, y: 350 }, 6)`. Result `sizeAfter: [300, 250]`, `canUndo: true`. `read-state.js` sample `0,0` equals the pre-crop sample at `100,100`.
- **Undo.** `browser_click` `Undo`. `canvasWidth: 800`, `canvasHeight: 600`, `canRedo: true`.
- **Reverse directions.** Select `Crop` again and repeat with `({ x: 400, y: 350 }, { x: 100, y: 100 }, 6)`, then `({ x: 400, y: 100 }, { x: 100, y: 350 }, 6)`, then `({ x: 100, y: 350 }, { x: 400, y: 100 }, 6)`, undoing between each. Every run yields `[300, 250]` and the same `0,0` sample.
- **Empty crop.** Select `Crop`, drag `({ x: 200, y: 200 }, { x: 200, y: 450 }, 3)` (zero width). Size stays `[800, 600]` and the undo count is unchanged (`Undo` is disabled if no other edit exists).
- **Large image.** Load the fixture at `(4000, 3000)`, select `Crop`, drag `({ x: 500, y: 500 }, { x: 2500, y: 2000 }, 6)`. `sizeAfter: [2000, 1500]`; note the wall time of the commit in the evidence.
- **Proof.** Save `read-state.js` before/after for each direction and the empty case to `crop.json`, plus a screenshot `crop-result.png` of the cropped canvas with the status visible.

## Gotchas

- Coordinates are intrinsic pixels; the displayed canvas is CSS-scaled, which is why `drag-pointer.js` maps through the bounding rect for you.
- The tool stays armed after a crop; a stray later drag crops again. Click `Undo` or reselect a draw tool before another recipe.
- Sub-pixel bounds are rounded; compare sizes with `Math.round`, not strict float equality.
- Crop does not clear the Draw selection semantics: selecting `Crop` replaces the active pointer tool, so a previous Pen selection is gone.
