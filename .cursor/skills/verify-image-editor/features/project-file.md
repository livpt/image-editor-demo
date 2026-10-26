# Project file

Export can save a `.msho` project. Opening a `.msho` file, from the picker or a drop, restores the layer tree, the float buffers, and the colour profile. The composite pixels match the document that was saved.

## Sub-features

- `project-export` downloads a project and reports `Project download started.`
- `project-open` loads a `.msho` file through the file input and enables the toolbar.
- `project-pixels` shows the same sampled pixels after that file is opened.
- `project-history` replaces history, so Undo is disabled after open.

## How to get to it (user POV)

- Click `Save`, choose `Project`, and click `Export`.
- Choose a `.msho` file, or drop one on the page.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/control.sh doctor` exits 0 and the 800x600 fixture is loaded.
- Apply `Grayscale` and record `read-state.js` samples `[[10, 10], [400, 300]]`. Those samples are the pixels a reopened project must match.

- **Export.** `browser_click` `Save`, choose `Project` in the format select, `browser_click` `Export`. Status reads `Project download started.` The file itself is not inspectable here.
- **Open.** Build a one-pixel `.msho` in the page (stored ZIP with `document.json` and `layers/1.png`) and hand it to `#fileInput` the same way `scripts/load-fixture.js` does, with the file name ending in `.msho`. Status reads `<name> is ready to edit.` The canvas is the size written in `document.json`, and a sample matches the PNG that was packed. `canUndo` is false. `read-state.js` history present label is `Open project`.
- **Proof.** Save the grayscale samples, the export status, and the reopened samples to `project-file.json`. A full float-buffer diff stays in `test/manual/README.md` and in `npm test`.

## Gotchas

- The OS file dialog is unreachable. A script may only replace the picker, the same exception as `load-fixture.js`. Do not call `canvas.loadProject` and report that as the user path.
- A ZIP that is not this format reports an error in the status line and leaves the previous image in place.
- `image/png` files are not routed to the project loader. A file is a project when its name ends in `.msho` or its first bytes are the ZIP signature.
