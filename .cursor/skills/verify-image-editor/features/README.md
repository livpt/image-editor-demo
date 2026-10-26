# Image editor verification map

This directory is the maintained source for verifying the user-facing behavior of the Simple Web Image Editor. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Start the harness with `scripts/control.sh up` and require `scripts/control.sh doctor` to exit 0 at `http://127.0.0.1:5199/`.
- Never drive port 5173 or any server the harness did not start.
- Navigate to the harness URL with `browser_navigate`; a reload is the reset.
- Load `verify-fixture-800x600.png` through `scripts/load-fixture.js` unless the recipe names another size. The fixture is a red-to-yellow-to-blue gradient with a dark grid and the size printed top-left, so any pixel sample is predictable and any stroke is visible.
- Record the git revision from `doctor` with every artifact.

## Driving conventions

- Toolbar: `browser_snapshot` (`interactiveOnly: true`) then `browser_click` by accessible name. Open the `Draw` or `Filter` menu before clicking an item inside it.
- Canvas gestures: `scripts/drag-pointer.js` with `from`/`to` in intrinsic canvas pixels.
- State: `scripts/read-state.js` before and after every action. Pixel samples use intrinsic coordinates. Its `layers` array is the panel as rendered, front of the stack first.
- Wait on status text, `canUndo`/`canRedo`, or canvas size, never on a fixed delay.
- The status line (`#appStatus`) is the mono strip directly above the canvas, inside the scrolling canvas column. Errors render in the orange `--color-primary`, not red.
- The console is a `<details>` drawer at the bottom of the canvas column, under the image. Click `Console` to open it. `browser_type` with `submit: true` does not run the expression; click `Run`.
- Do not call app modules directly and report it as a user path.

## Proof and skip reporting

- Capture the user action and the resulting state (status plus `read-state.js`), not only the final screen.
- Screenshots go through `browser_take_screenshot` with a bare filename, then `cp` from `$TMPDIR/cursor/screenshots/` into the evidence directory printed by `scripts/control.sh evidence`.
- Undo proof requires the sampled pixels to return to their exact previous values.
- Record the feature ID and entry point with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition. The known one is `Save`: the downloaded PNG cannot be read from the Cursor browser.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior, then exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with cursor-ide-browser` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact tool call and observable result.
4. `Gotchas` lists traps that can waste or invalidate a run.

## Features

- [Load an image](./load-image.md) covers choosing a file, dropping a file or URL, the enabled toolbar, and replacing an image.
- [Draw shapes](./draw-shapes.md) covers Pen, Line, Rectangle and Ellipse, one history step per gesture, and pointer cancellation.
- [Crop](./crop.md) covers all four drag directions, empty crops, and undo restoring the original size.
- [Resize](./resize.md) covers the dialog, ratio lock, validation and cancel.
- [Filters, undo and redo](./filters-undo-redo.md) covers the four filters, the undo/redo stack and its 20-step cap, and export status.
- [Layers](./layers.md) covers the layers panel: add, group, duplicate, delete, eye toggle, rename, pointer reorder, opacity and blend, painting the selected layer, and the group paint refusal.
- [Colour and bit depth](./colour.md) covers the foreground picker, the colour under the cursor, brightness round trip, and the document profile line.
