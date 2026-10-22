# Design

## Context

See `proposal.md` for motivation and the two capability specs for required behavior. Today `canvas.js` owns one visible canvas, synchronous `ImageData` history, and mouse-only interaction hooks. `index.js` snapshots that canvas through `toDataURL()` for shape and crop previews, loads files through `FileReader`, performs filters on the main thread, and installs resize listeners every time the Bootstrap modal opens. The page has no responsive coordinate mapping, and the project has no automated tests.

The refactor must stay client-only and framework-free at runtime, support current Chrome, Firefox, and Safari, and remain usable after each implementation phase. A 4000 by 3000 image is the representative large-image fixture for verification.

## Goals / Non-Goals

**Goals:**

- Keep committed image pixels separate from transient interaction visuals.
- Centralize pointer lifecycle, coordinate conversion, and commit semantics.
- Put an explicit upper bound on retained history resources.
- Remove synchronous base64 conversion from interaction, load, resize, and export paths.
- Isolate pixel readback so normal drawing can remain hardware accelerated.
- Land the work in independently verifiable phases with simple rollback boundaries.

**Non-Goals:**

- Adding layers, text editing, configurable brushes, new filters, or server-side processing.
- Guaranteeing identical filter rounding across browser rendering engines.
- Supporting legacy browsers outside current Chrome, Firefox, and Safari.
- Introducing a frontend framework, persistent document format, or cross-session history.
- Building a general-purpose canvas abstraction beyond this editor's tools.

## Decisions

### 1. Use committed and overlay canvases

`canvas.js` will own a visible canvas stack: a base canvas containing the committed image and a transparent overlay canvas containing the current pen stroke, shape preview, or crop bounds. Both canvases share intrinsic dimensions and identical responsive CSS dimensions. A surrounding positioned container replaces direct layout of the base canvas.

Pointer movement clears and redraws only the overlay. Pointer release composites a valid drawing overlay onto the base once; crop release uses normalized bounds and a scratch canvas to replace the base. Pointer cancellation clears the overlay without committing.

This avoids PNG encoding and full base-canvas restoration during previews. It also gives all drawing tools one transaction boundary for history.

Alternatives considered:

- `toDataURL()` snapshots retain the current architecture but synchronously encode and allocate large strings.
- Restoring `ImageData` on every move avoids PNG encoding but still performs large CPU-to-canvas copies.
- A single canvas plus retained vector commands reduces surfaces but requires replaying mixed raster and vector operations and complicates filters and crop.

### 2. Use one captured pointer session and one animation-frame scheduler

The canvas wrapper will expose a pointer-session API used by every drawing and crop tool. On `pointerdown`, it accepts one active primary pointer and calls `setPointerCapture`. It stores the latest mapped coordinate, batches any coalesced pen points, and schedules at most one render callback with `requestAnimationFrame`. `pointerup`, `pointercancel`, and lost capture complete or cancel the session and clear pending animation work.

A single coordinate helper maps `clientX` and `clientY` from `getBoundingClientRect()` into intrinsic coordinates using separate X and Y scale factors. Pointer Events replace the current mixture of page and offset coordinates. The overlay receives `touch-action: none` while editing so touch gestures do not steal active strokes.

Alternatives considered:

- Throttling by elapsed milliseconds is not synchronized with display paint and can produce uneven latency.
- Separate mouse and touch handlers duplicate lifecycle and coordinate logic.
- Window-level mouseup handlers fix only release handling and do not add stylus support.

### 3. Store at most 21 snapshots as closeable image resources

History will represent the current state plus up to 20 prior states. Commits capture the base canvas with `createImageBitmap`, serialized through a short promise queue so rapid actions cannot reorder history. Undo and redo draw the selected bitmap into a correctly resized base canvas. The editor temporarily disables history actions while a capture or restore is pending.

Evicted past entries, discarded redo entries, replacement-image history, and teardown all call `ImageBitmap.close()`. If bitmap creation fails, the edit remains visible but the operation reports a recoverable history error rather than corrupting the current image. No additional `Uint8ClampedArray` copy is made.

Alternatives considered:

- Capped `ImageData` is simpler but forces GPU readback for every commit and consumes four bytes per pixel in JavaScript heap.
- Command-only history is efficient for vector tools but cannot cheaply reverse crop, resize, filters, and replacement images.
- PNG Blobs reduce retained memory but add encode/decode latency to every commit, undo, and redo.

### 4. Use dedicated scratch canvases for raster transforms

Resize, crop, accelerated filters, and fallback pixel filters will use temporary in-memory canvases. Operations render a complete result to scratch storage, then atomically replace and commit the base image. A scratch context used for `getImageData()` will request `willReadFrequently`; the visible base and overlay contexts will not, preserving their normal rendering path.

For grayscale, sepia, and invert, the processing layer first feature-detects `CanvasRenderingContext2D.filter` and draws through that filter. Threshold always uses pixel data. Fallback loops index channels directly, preserve alpha, and avoid per-pixel array allocation. Each filter produces one history commit.

Alternatives considered:

- Applying reads and transforms directly to the base risks a partially transformed image on failure and may cause the browser to switch the visible canvas to software rendering.
- A Web Worker with `OffscreenCanvas` can further reduce main-thread work but adds messaging and Safari-specific complexity; it can be considered later if measured native and optimized paths remain inadequate.

### 5. Decode and export without base64

Local files will use `createImageBitmap(file)` for asynchronous decode. An object-URL-backed `Image` with `decode()` is the fallback, and its URL is always revoked. Loading a replacement image resets and closes prior history only after decode succeeds.

Resize draws the current base into a correctly sized scratch canvas with image smoothing enabled and high quality, avoiding self-resize pixel loss. Export uses `canvas.toBlob()` to create `image/png`, assigns a temporary object URL to the download, triggers it, and revokes the URL after the browser has consumed the click. Failed decode, resize, and export paths leave the committed image unchanged and surface a concise error.

External URL drops are retained only when the browser can decode them without violating canvas origin rules; otherwise the editor reports that the image must be downloaded and dropped as a local file.

Alternatives considered:

- `FileReader.readAsDataURL()` and `toDataURL()` allocate base64 strings roughly one-third larger than their binary content and synchronously encode on export.
- Fetching arbitrary remote URLs cannot bypass CORS and would create misleading support expectations in a client-only app.

### 6. Replace Bootstrap after canvas behavior stabilizes

The resize modal becomes a native `<dialog>` and drawing/filter menus use semantic `<details>` controls. Toolbar triggers become actual buttons, invalid self-closing HTML is corrected, and the resize listeners are registered once during startup. CSS keeps the canvas stack responsive and supplies keyboard focus and disabled states.

Native controls remove the Bootstrap CSS/JavaScript and CDN round trips without introducing another runtime dependency. `<details>` is preferred over the newer Popover API because its interaction model and compatibility are sufficient for these small menus.

Alternatives considered:

- Keeping Bootstrap and importing only modal/dropdown modules reduces bundle size but retains a runtime dependency for two simple controls.
- Custom ARIA menu and modal implementations require more focus-management code than the editor needs.

### 7. Upgrade tooling last and add focused verification seams

Vite and GitHub Actions will be upgraded only after functional phases pass. Pure logic—coordinate conversion, crop normalization, dimension validation, history bounds, and pixel fallbacks—will move into small modules testable with Node's built-in test runner, avoiding a test framework dependency. Browser verification covers canvas APIs and uses the 4000 by 3000 fixture in current Chrome, Firefox, and Safari. CI will run tests and build on pull requests before deployment.

Alternatives considered:

- A full browser automation dependency would improve repeatability but substantially expands this small project's development footprint. It can be added later if manual browser verification becomes unreliable.
- Upgrading Vite first mixes toolchain migration failures with behavior changes and makes regressions harder to isolate.

## Risks / Trade-offs

- [A 21-snapshot bitmap history can still consume significant GPU/process memory for very large images] → Close entries immediately when evicted, reset history on replacement images, verify memory with the representative fixture, and reduce the cap only through a follow-up spec change.
- [Asynchronous snapshot capture could reorder rapid edits or history commands] → Serialize commits and disable undo/redo while history is pending.
- [Canvas filter output can vary slightly across browsers] → Test effect semantics and alpha preservation rather than byte-identical color rounding; retain deterministic pixel fallbacks.
- [A second full-size canvas consumes additional backing-store memory] → Keep the overlay transparent and clear it after every transaction; this fixed allocation replaces repeated full-frame copies and encoded strings.
- [Object URLs can leak when error or repeated-export paths are missed] → Centralize creation/revocation and cover success, replacement, cancellation, and failure cases.
- [Native dialog and details styling differs across browsers] → Keep behavior semantic, use focused CSS, and verify keyboard and pointer operation in the browser matrix.
- [External URL drops may stop working for sources that previously displayed but later tainted the canvas] → Detect failure and explain the local-file workaround instead of allowing a broken editing session.

## Migration Plan

1. Add pure helper tests and a repeatable 4000 by 3000 fixture-generation procedure; record the current behavior and confirm the existing build.
2. Introduce the canvas stack, coordinate mapping, pointer sessions, frame scheduler, and tool migration. Keep the existing history and image-processing paths temporarily behind the new commit boundary.
3. Replace history with capped bitmap snapshots and resource cleanup; verify load, commit, undo, redo, branch-after-undo, and history reset.
4. Replace load, crop, resize, and export base64 paths with decode, scratch-canvas, Blob, and object-URL paths.
5. Add accelerated filter paths and optimized fallbacks, verifying all filters and alpha preservation.
6. Replace Bootstrap and invalid toolbar markup with native controls, responsive styles, and one-time listeners.
7. Upgrade Vite and CI, then run tests, production build, and the complete browser/large-image matrix.

Each phase remains a reviewable checkpoint. If a phase regresses behavior, revert that phase without rolling back earlier verified phases; no persistent user data or migration is involved.
