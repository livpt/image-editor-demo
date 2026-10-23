# Draw shapes

Draw lets a user pick Pen, Line, Rectangle or Ellipse from the Draw menu, then drag on the image. The stroke previews while dragging and is committed into the image on release as exactly one undo step. A drag that does not move commits nothing.

## Sub-features

- `draw-select` selects a tool from the `Draw` menu and the status names it.
- `draw-rect` strokes an axis-aligned rectangle between press and release.
- `draw-ellipse` strokes an ellipse inscribed in that rectangle.
- `draw-line` strokes a straight line from press to release.
- `draw-pen` strokes a freehand path through every move point.
- `draw-one-step` adds exactly one history entry per gesture.
- `draw-cancel` discards the preview when the pointer is cancelled or released without movement.

## How to get to it (user POV)

- Open `Draw` in the toolbar and choose `Pen`, `Line`, `Rectangle` or `Ellipse`.
- Press, drag and release on the image.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/control.sh doctor` exits 0 and the 800x600 fixture is loaded.
- `read-state.js` shows `canUndo: false`.

- **Select Rectangle.** `browser_click` `Draw`, then `browser_click` `Rectangle`. The status reads `Rectangle tool selected.` and the menu closes.
- **Draw it.** Evaluate `scripts/drag-pointer.js` with `({ x: 100, y: 100 }, { x: 300, y: 250 }, 8)`. Result has `canUndo: true` and `sizeAfter: [800, 600]`. `read-state.js` with samples `[[100, 100], [200, 100], [200, 175]]` shows the edge pixels `100,100` and `200,100` darker than before (black stroke) and the interior `200,175` unchanged.
- **One step.** `browser_click` `Undo`. `canUndo: false`, `canRedo: true`, and the three samples return to their pre-draw values. `browser_click` `Redo` to restore.
- **Ellipse.** `browser_click` `Draw`, `Ellipse`, then drag `({ x: 400, y: 300 }, { x: 600, y: 450 }, 8)`. Sample `500,300` (top of the ellipse) darkens; sample `400,300` (corner of the bounding box) does not.
- **Line.** `browser_click` `Draw`, `Line`, drag `({ x: 50, y: 500 }, { x: 250, y: 500 }, 4)`. Sample `150,500` darkens; `150,480` does not.
- **Pen.** `browser_click` `Draw`, `Pen`, drag `({ x: 600, y: 100 }, { x: 700, y: 200 }, 12)`. Sample `650,150` darkens.
- **No movement.** With any tool selected, drag `({ x: 50, y: 50 }, { x: 50, y: 50 }, 1)`. `canUndo` does not change count: `browser_click` `Undo` once undoes the Pen stroke, not an empty step.
- **Cancel.** Start a drag by hand: dispatch `pointerdown` and two `pointermove` events as in `drag-pointer.js`, then `overlay.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 1, bubbles: true }))`. The committed pixels and the undo count are unchanged.
- **Proof.** Save before/after `read-state.js` output per tool to `draw-shapes.json` and a screenshot `draw-shapes-all.png` showing all four strokes.

## Gotchas

- Clicking a menu item while the `<details>` is closed fails; always click `Draw` first and confirm the status text changed.
- Selecting a new tool clears any in-progress preview; select before dragging, not between press and release.
- Stroke color and width are fixed by `styles.css`/canvas defaults (black, thin); sample on the stroke, not next to it. Use coordinates that fall on the rectangle edge or the line itself.
- The commit is asynchronous (`createImageBitmap`); `drag-pointer.js` waits for `Undo` to flip. On a 4000x3000 fixture the commit can take several hundred milliseconds.
- `read-state.js` reads `#imageProcessed`, so an in-progress overlay preview never shows up in its pixel samples.
