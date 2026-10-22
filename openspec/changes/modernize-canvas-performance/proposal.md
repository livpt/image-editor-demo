# Proposal

## Why

The editor synchronously encodes, copies, and repaints full-resolution images during common interactions, so modern phone-sized images can block the main thread and exhaust browser memory. A phased refactor will make drawing, history, filtering, image I/O, and the surrounding UI responsive while preserving a dependency-light, client-only application.

## What Changes

- Introduce a responsive pointer-based drawing and crop interaction path with frame-coalesced previews, consistent coordinate mapping, and support for mouse, touch, and stylus.
- Separate transient shape and crop previews from the committed image so pointer movement does not encode or restore the full canvas.
- Bound and streamline undo/redo snapshots, expose safe empty-history behavior, and release discarded snapshot resources.
- Replace base64 image-loading, resize, and download paths with asynchronous browser primitives where supported, with compatible fallbacks.
- Accelerate built-in filters with native canvas operations where supported and optimize the remaining pixel-loop fallback.
- Correct crop direction, pointer-release, resize-listener, invalid-markup, and responsive-canvas issues encountered along the refactor path.
- Remove Bootstrap in favor of modern native controls, then update Vite and CI only after the runtime behavior is stable.
- Deliver the work in independently verifiable phases so each phase preserves working editing behavior and can be measured with representative large images.

Expected performance impact: pointer-driven previews should avoid synchronous PNG encoding and full base-canvas restoration, expensive work should occur no more than once per animation frame, image export should no longer synchronously create a base64 URL, and history memory should have a defined upper bound. Current Chrome, Firefox, and Safari remain supported; native fast paths will be feature-detected where compatibility differs. Bounded history trades unlimited undo depth for predictable memory use, while temporary preview and bitmap resources add small controlled allocations to eliminate repeated large transient copies.

## Capabilities

### New Capabilities

- `canvas-editing`: Responsive drawing, crop, pointer input, coordinate mapping, and bounded undo/redo behavior.
- `image-processing`: Loading, resizing, filtering, and exporting images without avoidable synchronous encoding or allocation.

### Modified Capabilities

None.

## Impact

- Primary code: `canvas.js`, `index.js`, `index.html`, and `styles.css`.
- Build and delivery: `package.json`, `package-lock.json`, and `.github/workflows/ci.yml`.
- Browser APIs: Pointer Events, `requestAnimationFrame`, Canvas 2D, `createImageBitmap` where available, `Blob`/object URLs, and native dialog/popover controls where compatibility permits.
- Dependencies: Bootstrap is removed; Vite and GitHub Actions are updated. No runtime framework or server component is introduced.
- Compatibility: current Chrome, Firefox, and Safari are targeted, using feature detection and focused fallbacks rather than legacy-browser polyfills.
