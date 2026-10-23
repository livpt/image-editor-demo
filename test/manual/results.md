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
