---
name: verify-image-editor
description: Drive the Simple Web Image Editor (the Vite + vanilla JS canvas app in this repo) in a browser the way a user does and capture proof. Use after changing canvas.js, index.js, index.html, history-store.js, image-io.js or processing-utils.js, before claiming an editing feature works, or when a unit test cannot reach the real pointer/canvas path.
---

# Verify the image editor

The app is one static page served by Vite. A user drops or chooses an image, then uses the toolbar (Draw, Crop, Resize, Filter, Undo, Redo, Save). Everything observable lives in the DOM: the status line, the toolbar's disabled states, and the committed canvas `#imageProcessed`. This skill starts an isolated dev server, drives it with the `cursor-ide-browser` tools, and stores evidence outside the repo.

Read [features/README.md](features/README.md) before driving; it is the maintained map of what to verify and how.

## Launch

The developer usually has `npm run dev` on port 5173. Never drive that instance. The harness uses port 5199 by default and refuses 5173.

```sh
.cursor/skills/verify-image-editor/scripts/control.sh up
```

Prints `up (pid N) at http://127.0.0.1:5199/` once the page serves `<title>Simple Web Image Editor</title>`. The server is detached, so it survives the end of the shell command that started it. Run this and the other `control.sh` commands outside the sandbox (they bind a port and write to `/tmp`). There is no data directory, migration or seed: a fresh page is the empty state. Override `IMAGE_EDITOR_VERIFY_PORT` to run two harnesses side by side.

Teardown is `control.sh down` (see Cleanup).

## Doctor

```sh
.cursor/skills/verify-image-editor/scripts/control.sh doctor
```

Read-only. Exit 0 means: our pid is alive, it owns the port, the page serves the right title. It also prints the git revision plus dirty-file count (so evidence can be tied to a commit) and the evidence directory. Run it first whenever a browser step behaves oddly; a `FOREIGN` port means someone else's server is there and you must not drive it.

## Drive

Harness: the `cursor-ide-browser` MCP tools, plus three page scripts in `scripts/` that you paste into `browser_cdp` `Runtime.evaluate`.

1. `browser_navigate` to `http://127.0.0.1:5199/` (omit `position`). A fresh page reload is the only way to reset state; there is no "new document" command.
2. Load an image. The OS file dialog is unreachable from the browser tool, so paste [scripts/load-fixture.js](scripts/load-fixture.js) (strip the comment lines) into `browser_cdp` with `{ "method": "Runtime.evaluate", "params": { "expression": "...", "awaitPromise": true, "returnByValue": true } }`. It generates a PNG in-page, hands it to `#fileInput` through a `DataTransfer` and fires `change`; from there the app's own decode and load path runs. Edit the last line for size: `(800, 600)` for quick checks, `(4000, 3000)` for the large-image check. Returns `{ status, canvasWidth, canvasHeight, controlsEnabled }`; expect `"<name> is ready to edit."` and `controlsEnabled: true`.
3. Toolbar actions: `browser_snapshot` with `interactiveOnly: true`, then `browser_click` by accessible name. Menu items (Pen, Line, Rectangle, Ellipse, Grayscale, Threshold, Sepia, Invert colors) need their `<details>` opened first: click `Draw` or `Filter`, then the item. Direct buttons: `Crop`, `Resize`, `Undo`, `Redo`, `Save`.
4. Canvas gestures (draw, crop): the overlay canvas has no accessibility ref and CDP `Input.*` is denied, so use [scripts/drag-pointer.js](scripts/drag-pointer.js). Select the tool first, then evaluate the script; edit its last line for `from`/`to` in intrinsic canvas pixels and the number of move steps. Returns `{ status, canUndo, sizeBefore, sizeAfter }`.
5. Resize dialog: click `Resize`, then `browser_fill` the `Width` / `Height` spinbuttons, toggle `Keep the image ratio`, click `Save changes` or `Cancel`.
6. Read state before and after every action with [scripts/read-state.js](scripts/read-state.js) (`returnByValue: true`). It returns the status text, `statusError`, control enablement, intrinsic canvas size, `canUndo`/`canRedo`, whether the resize dialog is open, and RGBA samples at the intrinsic coordinates you list on its last line.

Wait on observable state (status text, `canUndo` flipping, canvas size), not fixed sleeps. The scripts already poll.

## Evidence

Evidence directory: `control.sh evidence` prints and creates `/tmp/image-editor-verify/evidence/<RUN_ID>/` (`RUN_ID` defaults to the UTC start time of `up`). Put there, per feature:

- `<feature>.json`: feature ID, entry point used, fixture size, git revision from `doctor`, and the `read-state.js` output before and after each action (pixel samples included).
- `<feature>-<step>.png`: screenshots. `browser_take_screenshot` ignores directories and always writes under `$TMPDIR/cursor/screenshots/<filename>`; pass a bare filename, then `cp "$TMPDIR/cursor/screenshots/<filename>" <evidence dir>/`.

Proof standards:

- Exercise the real user path: toolbar clicks and pointer gestures. `load-fixture.js` is the one accepted shortcut (it only replaces the OS file picker). Never call `canvas.*` methods from `index.js`'s imports directly and present that as proof.
- Capture the action and the resulting state: status line plus `read-state.js` before and after, not only a final screenshot. A status message alone is not proof; confirm pixels or canvas size changed.
- Undo proof means the pixel samples return to their exact pre-action values and `canRedo` becomes true.
- Side effects: there is no persistence. The only side effect is the PNG download from `Save`, which the Cursor browser cannot inspect; record the status `"PNG download started."` and note that file content was not checked. Full export checks stay in `test/manual/README.md`.
- Check `Log.enable` / `Runtime.exceptionThrown` via `browser_cdp` for uncaught errors during the run and record any.

## Cleanup

```sh
.cursor/skills/verify-image-editor/scripts/control.sh down
```

Kills only the pid recorded in `/tmp/image-editor-verify/<port>/vite.pid` and removes that pid file. It never kills by name and never touches port 5173. Evidence under `/tmp/image-editor-verify/evidence/` is kept. Close the browser tab you opened with `browser_tabs` `close` if the user did not ask to see it. Run `down` after a failed run too, so ports are not stranded.

## Helpers

| Script | How to run | Purpose |
| --- | --- | --- |
| `scripts/control.sh up\|doctor\|evidence\|down` | shell, outside the sandbox | server lifecycle and evidence dir |
| `scripts/load-fixture.js` | paste into `browser_cdp` `Runtime.evaluate`, `awaitPromise: true` | load a generated PNG through `#fileInput` |
| `scripts/drag-pointer.js` | paste into `browser_cdp` `Runtime.evaluate`, `awaitPromise: true` | one pointer drag on the overlay canvas |
| `scripts/read-state.js` | paste into `browser_cdp` `Runtime.evaluate` | read-only state and pixel samples |

Unit tests (`npm test`, Node's built-in runner) and the production build (`npm run build`) complement this skill; they do not replace driving the page.

## Maintenance

When a feature changes, update its file in `features/` and re-run its recipe. Use `/maintain-verification-skill` to keep the map honest as the app changes.
