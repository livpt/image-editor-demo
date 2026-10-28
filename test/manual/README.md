# Browser verification

## Generate the representative image

1. Run `npm run dev`.
2. Open `/test/manual/large-image-fixture.html` in the browser under test.
3. Confirm the page reports `Intrinsic dimensions: 4000 × 3000`.
4. Select **Download large-image-4000x3000.png**.
5. Drop the downloaded PNG onto the editor.

Generate a fresh fixture in each browser when testing browser-specific decode or download behavior.

## Browser matrix

Run the checklist in the current stable Chrome, Firefox, and Safari releases. Record the browser version and result in `results.md`.

- Load the generated local PNG and confirm editing controls become available.
- Use Pen, Line, Rectangle, and Ellipse with mouse input.
- Repeat one drawing operation with touch or device emulation and one with a stylus where available.
- Release an active pointer outside the canvas and confirm later movement does not draw.
- Crop in all four drag directions and confirm an empty crop does nothing.
- Resize with ratio preservation on and off; reject zero and negative dimensions.
- Apply Grayscale, Threshold, Sepia, and Invert; undo and redo each result.
- Make 25 edits and confirm no more than 20 undo operations are retained.
- Export twice and confirm each PNG contains the latest committed image.
- Export JPEG and WebP with the quality slider below 100 and confirm the files are smaller than a PNG of the same image. JPEG and WebP do not contain an embedded ICC profile; the status says `Profile not embedded.` when the document has one.
- Save a `.msho` project, reopen it, and confirm the pixel diff against the image before export is 0, including a layer that has a float buffer (apply Grayscale, save, reopen, undo the reopen is unavailable, and the pixels match).
- In Safari, export WebP and confirm the file extension follows `blob.type` when the browser falls back to PNG. The status names that fallback.
- Fill IndexedDB until a write throws `QuotaExceededError` (devtools Application panel, or a very large float document) and confirm the status says `Autosave paused: storage is full.`
- Save a PNG that was opened with an embedded profile and confirm the exported file still has an `iCCP` chunk (`pngcheck -v` or `exiftool`). A file with no profile exports without one.
- Confirm all controls are reachable by keyboard and focus remains visible.
- Check the browser console for uncaught errors.
- Check the browser task manager or developer tools for retained memory after history eviction and replacement-image loading.
