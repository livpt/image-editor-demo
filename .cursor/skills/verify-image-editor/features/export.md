# Export

Save opens a dialog for PNG, JPEG, WebP, or a project file. JPEG and WebP show a quality slider. The download uses the filename stem plus the extension of the blob the browser actually produced. A document with a colour profile says the profile is not embedded for JPEG and WebP.

## Sub-features

- `export-open` opens the dialog from Save.
- `export-png` downloads a PNG and reports `PNG download started.`
- `export-quality` shows the quality slider for JPEG and WebP and hides it for PNG and Project.
- `export-profile` adds `Profile not embedded.` when a JPEG or WebP export leaves an embedded profile behind.
- `export-fallback` names the real file type when `blob.type` differs from the requested type.

## How to get to it (user POV)

- Click `Save` in the toolbar.
- Press `Ctrl+S` or `Command+S` when the pointer is not in a text field and no dialog is open.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/control.sh doctor` exits 0 and the 800x600 fixture is loaded.
- `read-state.js` with samples `[[10, 10], [400, 300]]` records the baseline pixels. `#documentInfo` includes `Profile: none`.

- **Open.** `browser_click` `Save`. `read-state.js` reports `exportDialogOpen: true`. The format select is PNG and `#exportQualityRow` is hidden.
- **Quality.** `browser_select_option` on the format select, value `image/jpeg`. `#exportQualityRow` is visible. Switch back to `image/png` and it hides again.
- **PNG.** With PNG selected, `browser_click` `Export`. Status reads `PNG download started.` The file bytes are not inspectable here.
- **JPEG.** Open `Save` again, choose `image/jpeg`, `browser_click` `Export`. Status reads `JPEG download started.` It does not mention a profile, because this fixture has none.
- **Profile note.** Load a PNG that contains an iCCP chunk the same way the colour recipe does. Open `Save`, choose `image/jpeg`, and export. Status includes `Profile not embedded.`
- **Proof.** Save `read-state.js` outputs to `export.json` and a screenshot `export-dialog.png` with the dialog open. WebP fallback on Safari stays in `test/manual/README.md`.

## Gotchas

- The downloaded file cannot be read back from the Cursor browser. Record the status and leave byte checks to `test/manual/README.md`.
- `Ctrl+S` is swallowed by the page. `Ctrl+T` is not bound; the dialog footer says the browser reserves it.
- Quality is a 1 to 100 readout of a 0.01 to 1 range. PNG ignores it.
