# Proposal

## Why

The editor synchronously encodes and repaints full-resolution images during drawing and crop interactions, while unbounded history repeatedly copies whole frames. This first half of the modernization focuses only on making the canvas responsive and memory-bounded before image processing changes begin.

## What Changes

- Introduce a responsive base-and-overlay canvas stack for transient drawing and crop previews.
- Replace mouse-only handlers with captured Pointer Events for mouse, touch, and stylus.
- Coalesce pointer updates to one preview render per animation frame and map displayed coordinates to intrinsic image pixels.
- Normalize crop bounds in every drag direction and safely cancel interrupted interactions.
- Replace unbounded `ImageData` history with serialized, closeable snapshots capped at 20 undo steps.
- Keep existing load, resize, filter, export, Bootstrap, and delivery-tooling behavior for the separate image-processing change.

Expected performance impact: drawing and crop previews no longer encode PNGs or restore the full base image on every pointer move, and retained history has a fixed upper bound. The overlay adds one controlled full-size backing surface, trading a fixed allocation for removal of repeated encoded strings and frame copies. Current Chrome, Firefox, and Safari remain supported.

## Capabilities

### New Capabilities

- `canvas-editing`: Responsive drawing, crop, pointer input, coordinate mapping, and bounded undo/redo behavior.

### Modified Capabilities

None.

## Impact

- Primary code: `canvas.js`, the drawing/crop portions of `index.js`, `index.html`, `styles.css`, and focused tests.
- Browser APIs: Pointer Events, pointer capture, `requestAnimationFrame`, Canvas 2D, and `createImageBitmap`.
- Dependencies: no new runtime dependency or framework.
- Follow-up: `modernize-image-processing` owns loading, resizing, filters, export, application-shell cleanup, and tooling upgrades.
