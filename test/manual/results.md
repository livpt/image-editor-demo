# Canvas verification results

## Baseline

Date: 2026-10-23  
Browser: automated Chromium session  
Fixture: generated 4000 × 3000 PNG delivered through a `DataTransfer` drop

| Check | Baseline result | Owning phase |
| --- | --- | --- |
| Intrinsic size | Preserved at 4000 × 3000 | Pass |
| Responsive display | Rendered at 4000 × 3000 CSS pixels and overflowed the viewport | Canvas interaction |
| Pen | Drew correctly | Pass |
| Line | Drew correctly | Pass |
| Rectangle | Drew in forward and reverse directions | Pass |
| Ellipse | Drew correctly | Pass |
| Crop | All four directions produced the expected 300 × 250 crop | Pass |
| Release outside | Did not end the pen session; re-entry produced ghost drawing | Canvas interaction |
| Undo/redo | Restored drawings and crop dimensions correctly | Pass |
| Shape/crop start | Approximately 189–217 ms on the large fixture | Canvas interaction |
| Preview move | Up to approximately 80 ms | Canvas interaction |
| Pen history commit | Approximately 358 ms | Canvas history |

The fixture download itself could not be attached through browser automation, so the same page-generated pixels and dimensions were delivered as a PNG through `DataTransfer`.

## Post-refactor

Date: 2026-10-23  
Browser: automated Chromium session  
Fixture: generated 4000 × 3000 PNG delivered through a `DataTransfer` drop

| Check | Post-refactor result |
| --- | --- |
| Intrinsic and responsive size | Preserved 4000 × 3000 pixels; displayed at 1920 × 1440 with no horizontal overflow |
| Pen, line, rectangle, ellipse | All rendered and each added exactly one history step |
| Crop | All four directions produced equivalent opaque crops; undo restored 4000 × 3000 |
| Empty crop | Left dimensions and history unchanged |
| Release outside | Committed once; later movement produced no ghost drawing |
| Pointer cancellation | Cleared the preview without changing image or history |
| Undo/redo | Restored the tested edit exactly after pending work settled |
| History limit | 25 edits exposed exactly 20 undo and 20 redo steps |
| Replacement image | Reset five prior states to zero; immediate undo returned false |
| Console | No captured application errors |
| Shape start | 0–1.1 ms, down from approximately 189–217 ms |
| Preview work | 0–9.7 ms, down from up to approximately 80 ms |
| Commit | Typically 2.7–13.5 ms; 8.56 ms average across 25 edits with one 83.9 ms outlier |

Browser automation could not create a native captured-pointer stream, so outside release and cancellation used equivalent synthetic pointer events. Safari is installed but automated execution is blocked until Safari's **Allow remote automation** setting is enabled. Firefox is not installed on this machine. All canvas APIs used by this change are standard current-browser APIs; manual Safari and Firefox rows remain to be recorded.

## Compatibility review

The user accepted the Chromium runtime results plus a standards-based review in place of installing/configuring additional browsers. The canvas path uses Pointer Events and pointer capture, `requestAnimationFrame`, Canvas 2D, `createImageBitmap`, `ImageBitmap.close()`, CSS `touch-action`, and CSS `inset`; these APIs are available in current Chrome, Firefox, and Safari. `getCoalescedEvents()` is optional in the implementation and falls back to the original pointer event when unavailable.

The regression smoke test also confirmed the existing resize path transitions 4000 × 3000 → 800 × 600 with one history entry, undo/redo restore both dimensions, the filter menu remains clickable above the overlay, and filter/save paths still work without captured application errors.

## Image-processing baseline

Fixture: generated 10,743,602-byte 4000 × 3000 PNG in automated Chromium.

| Operation | Baseline |
| --- | --- |
| Local load | 114.0 ms total; 34.8 ms in `FileReader.readAsDataURL()` |
| Resize to 800 × 600 | 343.1 ms; 211.5 ms in `toDataURL()` |
| Grayscale at 800 × 600 | 38.1 ms |
| Sepia at 800 × 600 | 55.7 ms |
| Invert at 800 × 600 | 39.8 ms |
| Threshold at 800 × 600 | 39.8 ms |
| Export | 183.8 ms; 180.4 ms in `toDataURL()` |

Baseline export assigned a 14,324,835-character base64 URL to the download.

## Image-processing post-refactor

Fresh-server Chromium smoke test:

| Operation | Post-refactor |
| --- | --- |
| Local load | 105.5 ms at 4000 × 3000; no `FileReader` or data URL |
| Resize to 800 × 600 | 1.6 ms; one history state; undo restored 4000 × 3000 in 2.5 ms |
| Grayscale at 4000 × 3000 | 3.6 ms total using the canvas-filter path |
| Threshold at 4000 × 3000 | 339.2 ms using the deterministic pixel fallback |
| Export | 104.7 ms through `toBlob()`; 303,128-byte PNG Blob |

Post-refactor export used one temporary object URL, started `processedImage.png`, revoked the URL, and made no `toDataURL()` call. No runtime errors were captured. Unit tests cover invalid local files, object-URL decode fallback, allowed/blocked external decode behavior, Blob URL cleanup, filter path selection, deterministic channel output, and alpha preservation.

The final Vite 8 smoke test also verified all filters at 800 × 600 with one history entry and successful undo: grayscale 1.6 ms, sepia 0.1 ms, invert 0.5 ms, and threshold through the pixel fallback. Same-origin URL loading reset history, while a blocked URL displayed the local-file recovery message and preserved the current image. Native Draw and Filter menus, the resize dialog, and all processing controls remained available without captured runtime errors.

For the image-processing matrix, the user requested the faster verification path already accepted for the canvas phase: Chromium runtime coverage plus a standards-based compatibility review instead of installing/configuring additional browsers. `createImageBitmap` has an object-URL/`Image.decode()` fallback, Canvas 2D filters have deterministic pixel fallbacks, and the remaining APIs (`toBlob`, object URLs, `<details>`, and `<dialog>`) are available in current Chrome, Firefox, and Safari.
