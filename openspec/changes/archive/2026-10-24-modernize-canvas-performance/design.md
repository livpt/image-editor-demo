# Design

## Context

See `proposal.md` and `specs/canvas-editing/spec.md`. Today one visible canvas stores committed pixels, previews restore a PNG data URL on every mouse move, input is mouse-only, coordinates assume an unscaled canvas, and history stores unlimited duplicated `ImageData`. This change deliberately leaves loading, resize, filters, export, Bootstrap, and delivery tooling to `modernize-image-processing`.

## Goals / Non-Goals

**Goals:**

- Separate committed pixels from transient previews.
- Centralize pointer lifecycle, coordinate conversion, and commit behavior.
- Render no more than one preview per animation frame.
- Bound history to the current image plus 20 undo states and release discarded resources.
- Preserve current editing behavior while supporting current Chrome, Firefox, and Safari.

**Non-Goals:**

- Changing image decode, resize, filter, or export implementations.
- Replacing Bootstrap or upgrading build and delivery tooling.
- Adding layers, text, brushes, new filters, or server processing.

## Decisions

### 1. Stack a transparent overlay over the committed canvas

`canvas.js` owns the existing base canvas and a transparent overlay canvas inside a responsive positioned container. Both surfaces share intrinsic dimensions and CSS geometry. Pen strokes, shape previews, and crop bounds render only on the overlay; a valid drawing composites once on pointer release. Crop uses normalized bounds and a scratch canvas before replacing the base.

This removes interaction-time PNG encoding and base restoration. Restoring `ImageData` per move was rejected because it still copies a full frame; retained vector replay was rejected because crop and future raster operations require pixel state.

### 2. Use one captured pointer session with frame scheduling

A pointer-session API accepts one primary pointer, calls `setPointerCapture`, converts `clientX`/`clientY` through the overlay's bounding rectangle, and retains the latest point. One `requestAnimationFrame` callback renders the latest shape position or accumulated coalesced pen points. Pointer up finalizes; pointer cancel or lost capture clears without commit.

Pointer Events provide one lifecycle for mouse, touch, and stylus. Time-based throttling and separate input handlers were rejected because they produce uneven rendering and duplicated state.

### 3. Store closeable bitmap history through a serialized queue

History keeps the current `ImageBitmap` and at most 20 past states. Commits use `createImageBitmap(baseCanvas)` and a promise queue so snapshots cannot reorder. Undo and redo draw the selected bitmap after resizing both canvas surfaces. History actions are ignored while a commit or restore is pending.

Evicted past states, discarded redo states, replacement-image history, and teardown call `close()`. Capped `ImageData` was rejected because every commit forces readback and stores frames in JavaScript heap; encoded Blobs were rejected because undo would require repeated decode.

### 4. Keep compatibility at the canvas boundary

The existing synchronous `drawImage`, filter, resize, and download callers remain callable. `drawImage` resets history after a replacement image; raster operations commit through the new history queue. The existing data-URL method remains temporarily for resize/export only, but drawing and crop code no longer call it.

This boundary lets the canvas half ship independently while the follow-up replaces image-processing paths.

## Risks / Trade-offs

- [The overlay adds a second full-size backing surface] → Clear it after every transaction and verify memory against the eliminated transient PNG/frame copies.
- [Large bitmap history can still consume substantial process memory] → Cap past states at 20 and close every evicted, discarded, or reset resource immediately.
- [Asynchronous snapshots can race with rapid edits] → Serialize commits and block history actions while work is pending.
- [Pointer capture behavior differs at browser edges] → Handle pointer up, cancel, and lost capture idempotently and verify the browser matrix.

## Migration Plan

1. Preserve the completed test setup and record the canvas baseline with the 4000 by 3000 fixture.
2. Add the canvas stack, coordinate mapping, pointer session, and frame scheduler.
3. Migrate pen, shape, and crop tools to overlay transactions.
4. Replace history with bounded bitmap snapshots and resource cleanup.
5. Run unit tests, production build, and canvas scenarios in current Chrome, Firefox, and Safari.

Each step remains a reviewable checkpoint. No persistent user data migration is required.
