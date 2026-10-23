# Proposal

## Why

After the canvas interaction refactor, loading, resizing, filtering, and export still synchronously encode or read full-resolution images and can block modern browsers. This second half modernizes those raster paths and then removes obsolete shell and tooling overhead.

## What Changes

- Decode local images asynchronously without base64 conversion and handle external URL failures safely.
- Resize through validated, high-quality scratch-canvas rendering.
- Accelerate grayscale, sepia, and invert where supported and optimize deterministic pixel fallbacks, including threshold.
- Export asynchronously as a PNG Blob and release temporary object URLs.
- Fix repeated resize listeners and surface recoverable processing errors.
- Replace Bootstrap with native controls after processing behavior stabilizes.
- Upgrade Vite and CI after runtime changes pass verification.

Expected performance impact: loading and export avoid large base64 strings, accelerated filters reduce main-thread pixel loops, and raster operations replace the committed image atomically. Scratch canvases add temporary full-frame allocations but are released after each operation. Current Chrome, Firefox, and Safari remain supported through feature detection and focused fallbacks.

## Capabilities

### New Capabilities

- `image-processing`: Loading, resizing, filtering, and exporting images without avoidable synchronous encoding or allocation.

### Modified Capabilities

None.

## Impact

- Primary code: image-processing portions of `index.js`, `canvas.js`, `index.html`, and `styles.css`.
- Delivery: `package.json`, `package-lock.json`, and `.github/workflows/ci.yml`.
- Dependencies: Bootstrap is removed; no runtime framework is introduced.
- Prerequisite: complete the `modernize-canvas-performance` change first.
