# Design

## Context

This change follows `modernize-canvas-performance` and uses its committed base canvas and serialized history boundary. The remaining paths use `FileReader`/data URLs for load, resize, and export; filter the visible canvas through synchronous pixel loops; and register resize listeners whenever the Bootstrap modal opens.

## Goals / Non-Goals

**Goals:**

- Remove base64 conversion from local load and PNG export.
- Make raster transforms atomic and isolate pixel readback.
- Use accelerated filter paths where available with compatible fallbacks.
- Remove Bootstrap and modernize delivery only after runtime behavior is stable.

**Non-Goals:**

- Changing pointer interaction, preview, crop, or history contracts.
- Adding new filters, server processing, or a frontend framework.

## Decisions

### 1. Use scratch canvases for raster transforms

Resize and filters render complete results into temporary canvases before replacing the committed base. Readback-only contexts request `willReadFrequently`; visible contexts do not. Grayscale, sepia, and invert feature-detect Canvas 2D filters, while threshold and fallback paths index channels directly and preserve alpha.

### 2. Decode and export without base64

Local files use `createImageBitmap(file)` with an object-URL-backed `Image.decode()` fallback. Export uses `toBlob()` and a temporary object URL that is revoked after use. External URLs remain supported only when origin policy permits an editable canvas.

### 3. Keep each operation atomic

Decode, resize, filter, and export failures leave the committed image unchanged. Successful resize and filter operations call the canvas history commit boundary exactly once.

### 4. Modernize the shell and tooling last

Bootstrap dropdowns become semantic `<details>` controls and the resize modal becomes `<dialog>`, with listeners registered once. Vite and GitHub Actions are upgraded only after runtime checks pass. Pure processing helpers use the existing Node test setup.

## Risks / Trade-offs

- [Scratch canvases temporarily add a full-frame allocation] → Release references immediately and avoid simultaneous scratch surfaces.
- [Canvas filter output varies slightly by engine] → Verify effect semantics and alpha preservation, not byte-identical rounding.
- [Object URLs can leak] → Centralize creation and revocation across success and failure.
- [Native controls style differently] → Preserve semantic behavior and verify the browser matrix.

## Migration Plan

1. Modernize load, external URL handling, resize, and export.
2. Add accelerated filters and optimized fallbacks.
3. Replace Bootstrap and one-time listener bugs.
4. Upgrade Vite and CI.
5. Run tests, production build, and the complete large-image browser matrix.
