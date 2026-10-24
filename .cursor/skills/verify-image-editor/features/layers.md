# Layers

The Layers panel on the right lists the document's stack with the front layer at the top. A user adds transparent layers and groups, duplicates, deletes, renames by double-click, hides a layer with its eye button, drags rows to reorder or nest them, and sets opacity and blend for the selected row. Draw and filter tools paint the selected pixel layer only; selecting a group and trying to paint is refused. Every panel action except selecting a row and dragging the opacity slider is one history step, and Save exports the composite, so hidden layers stay out of the PNG.

## Sub-features

- `layers-disabled` keeps every panel control disabled until an image is loaded.
- `layers-load` shows one `Background` row, selected, after a load.
- `layers-add` inserts a transparent `Layer N` in front of the selected row and selects it.
- `layers-target` paints strokes and filters into the selected layer only.
- `layers-eye` hides and shows a layer without changing its pixels; the composite updates.
- `layers-opacity` previews while the slider moves and commits once on release.
- `layers-blend` changes the blend mode of the selected row.
- `layers-group` wraps the selected row in a `Group N` and selects the group.
- `layers-group-paint` refuses a stroke or filter while a group is selected.
- `layers-rename` renames on double-click; Enter commits, Escape cancels, blank or over 80 characters is rejected.
- `layers-duplicate` copies the selected row (and a group's children) in front of the original.
- `layers-reorder` drags a row between rows or onto a group.
- `layers-delete` removes the selected row, selects a neighbour, and refuses the last pixel layer.
- `layers-history` makes each action one Undo step and restores the panel on Undo and Redo.

## How to get to it (user POV)

- The panel is always visible under the toolbar on the right (stacked below the image on a narrow window).
- Click `Add layer`, `Add group`, `Duplicate`, or `Delete` in the panel.
- Click a row to select it. Press Enter or Space on a focused row to select it.
- Click a row's eye button to hide or show it.
- Double-click a row name (or press F2 on a focused row) to rename it.
- Drag a row and drop it above or below another row, or onto a group row.
- Move the `Opacity` slider or pick a `Blend` mode for the selected row.
- From the console: `app.run("layer.add")`, `app.activate(id)`, `app.doc.layers`.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/control.sh doctor` exits 0 and the 800x600 fixture is loaded.
- `read-state.js` shows `layersEnabled: true`, `layers` with one row `Background` that is `active: true`, and `canUndo: false`.
- Before loading, `read-state.js` on a fresh page shows `layersEnabled: false` and `layers: []`.

- **Add a layer.** `browser_click` `Add layer`. Status reads `Added a layer.`. `read-state.js` shows `layers` as `[Layer 2 (active), Background]` and `canUndo: true`.
- **Paint the new layer.** `browser_click` `Draw`, then `Rectangle`, then evaluate `scripts/drag-pointer.js` with `({ x: 100, y: 100 }, { x: 300, y: 250 }, 8)`. `read-state.js` with samples `[[100, 100], [200, 175]]` shows `100,100` darkened and `200,175` unchanged.
- **Hide it.** `browser_snapshot` and `browser_click` the button named `Hide Layer 2`. Status reads `Toggled the layer.`, the row reports `visible: false`, and sample `100,100` returns to its pre-stroke value while `canUndo` stays true. `browser_click` `Show Layer 2` and the stroke returns.
- **Opacity.** With `Layer 2` selected, `browser_fill` the `Opacity` slider with `50` (fires `input`, then `change`). Status reads `Changed the layer opacity.` and sample `100,100` is between the stroke colour and the background. `read-state.js` reports `layerOpacity: 50`. `browser_click` `Undo` and the sample returns to the full stroke; `layerOpacity` reads `100`.
- **Blend.** `browser_select_option` on `Blend` with `multiply`. Status reads `Changed the layer blend mode.` and `layerBlend: "multiply"`. Undo restores `normal`.
- **Group and refuse paint.** `browser_click` `Add group`. Status reads `Grouped the layer.`, `layers` is `[Group 3 (active, depth 0), Layer 2 (depth 1), Background]`. With `Rectangle` still armed, evaluate `drag-pointer.js` with `({ x: 400, y: 400 }, { x: 500, y: 500 }, 4)`. Status turns to an error mentioning `is a group`, `statusError: "true"`, and sample `400,400` is unchanged. `browser_click` `Filter`, `Grayscale`: same error, no new history step (`browser_click` `Undo` once undoes the grouping, not a filter; `browser_click` `Redo` to restore).
- **Rename.** `browser_snapshot`, then double-click the `Layer 2` row name by evaluating `document.querySelector('#layersList .layer-row[data-id="2"] .layer-name').dispatchEvent(new MouseEvent("dblclick", { bubbles: true }))`. `read-state.js` shows that row `renaming: true`. `browser_type` `Ink` into the textbox named `Rename Layer 2` and `browser_press_key` `Enter`. Status reads `Renamed the layer.` and the row name is `Ink`. Repeat with only spaces and press Enter: status is an error ending in `characters.` and the name stays `Ink`.
- **Duplicate.** Select `Ink` by `browser_click` on its row, then `browser_click` `Duplicate`. `layers` gains `Ink copy` above `Ink` inside the group, selected.
- **Reorder.** `browser_drag` from the `Background` row to the top edge of the `Group 3` row. Status reads `Moved the layer.` and `Background` is now the first row. Then `browser_drag` `Background` onto the middle of the `Group 3` row: it becomes the group's top child at `depth: 1`.
- **Delete.** Select `Ink copy` and `browser_click` `Delete`. Status reads `Deleted the layer.` and `Ink` is selected. Delete rows until one pixel layer remains, then `browser_click` `Delete` again: status is an error `cannot delete the last layer` and the row stays.
- **Undo walk.** `browser_click` `Undo` repeatedly and confirm `read-state.js` `layers` steps back through each panel state until `canUndo: false` shows the single `Background` row.
- **Proof.** Save `read-state.js` before and after each action to `layers.json`, and screenshots `layers-panel.png` (panel with a group, a hidden row, and the selection visible) and `layers-narrow.png` after `Emulation.setDeviceMetricsOverride` to `600x900` showing the panel stacked under the image with the console reachable.

## Gotchas

- Row selection is not a history step; `canUndo` does not change when you click a row, and `Undo` after a selection undoes the previous edit.
- The `Opacity` slider's `input` event paints a preview without a history step. Only `change` commits. `browser_fill` fires both, so one fill is one step. If a tool dispatches `input` only, the pixels change but `canUndo` and `layerOpacity` in the DOM do not, which is expected.
- Reorder uses pointer events with a 4px threshold, not HTML5 drag-and-drop. `browser_drag` must move the pointer, not just press and release. If it fails, dispatch `pointerdown`, two `pointermove` events past the threshold, and `pointerup` on `#layersList` with `clientX`/`clientY` from `getBoundingClientRect()` of the source and target rows. Drop in the top quarter of a group row to place above it, the bottom quarter to place below, and the middle to nest inside.
- The list shows the front of the stack first. `app.doc.layers[0]` is the back, so the panel order is the reverse of the array.
- `layer.add` from the console uses the selected row; every other `layer.*` command takes an explicit `id`. The error for a group target comes from the registry and reads `... is a group; select a layer to paint`.
- Delete with a group selected removes the group and every layer inside it. The last-layer refusal counts pixel layers across the whole tree, so deleting a group that holds the only pixel layer is refused even if a sibling group is empty.
- Hidden layers and opacity `0` are excluded from `#imageProcessed`, so they are also excluded from Save. Sample pixels, not the row state, to prove it.
- The accessible name of an eye button changes with its state (`Hide X` when visible, `Show X` when hidden). Re-snapshot before clicking it a second time.
