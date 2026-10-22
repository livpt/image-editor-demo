# Tasks

## 1. Establish verification seams and baseline

- [ ] 1.1 Add an ES-module-compatible `npm test` command using Node's built-in test runner, preserve the existing Vite build, and verify both `npm test` and `npm run build` succeed.
- [ ] 1.2 Extract pure helpers for coordinate scaling, crop normalization, resize-dimension validation, and pixel transformations with unit tests covering scaled coordinates, all crop directions, invalid dimensions, channel output, and alpha preservation; verify the full test suite passes.
- [ ] 1.3 Add a repeatable browser-based procedure that generates a 4000 by 3000 PNG fixture and a manual verification checklist for Chrome, Firefox, and Safari; verify the generated file reports the expected intrinsic dimensions.
- [ ] 1.4 Record baseline results for load, pen, line, rectangle, ellipse, crop, resize, each filter, undo/redo, and save with the large fixture, including the known failures or stalls, and verify the record identifies which later phase owns each issue.

## 2. Refactor canvas interaction and previews

- [ ] 2.1 Introduce a positioned base-and-overlay canvas stack with synchronized intrinsic dimensions and responsive CSS sizing, and verify the large fixture fits the viewport while retaining 4000 by 3000 intrinsic pixels.
- [ ] 2.2 Replace mouse-specific hooks with one captured Pointer Events session, intrinsic coordinate mapping, pointer-cancel cleanup, and a single `requestAnimationFrame` scheduler; verify unit tests and an instrumented rapid-move check show at most one preview render per frame.
- [ ] 2.3 Migrate pen, line, rectangle, and ellipse tools to draw transient content on the overlay and commit once on release; verify each tool works with mouse, touch, and stylus emulation and adds exactly one undo step.
- [ ] 2.4 Migrate crop selection to the overlay and normalized scratch-canvas bounds, ignoring zero-area selections; verify all four drag directions produce the same selected region and empty crops leave history unchanged.
- [ ] 2.5 Verify interaction cancellation and release outside the canvas clear or commit as specified without later ghost drawing, then run all drawing and crop checks with the large fixture in Chrome, Firefox, and Safari.

## 3. Bound and harden history

- [ ] 3.1 Replace uncapped `ImageData` history with serialized `ImageBitmap` snapshots capped at the current state plus 20 prior states, closing every evicted or discarded bitmap; verify unit tests use closeable fakes to cover eviction, redo invalidation, replacement reset, and disposal.
- [ ] 3.2 Integrate asynchronous commit, undo, and redo with canvas resizing and pending-state control disabling; verify rapid commits cannot reorder snapshots and unavailable undo/redo produces no error or image change.
- [ ] 3.3 Load a replacement image after editing and verify old history is inaccessible and released, then perform at least 25 large-image edits and verify only 20 undo steps remain and browser memory stabilizes after eviction.

## 4. Modernize image loading, resize, and export

- [ ] 4.1 Replace local-file base64 loading with asynchronous bitmap decode plus an object-URL image fallback, preserving the current image on failure; verify valid, invalid, replacement, and fallback loads with the large fixture.
- [ ] 4.2 Handle dropped external URLs only when they can produce an editable origin-clean canvas and show a local-file recovery message otherwise; verify one allowed and one CORS-blocked source leave the editor in the expected state.
- [ ] 4.3 Replace resize-through-PNG with validated high-quality scratch-canvas rendering and one-time resize listeners; verify ratio-preserving, freeform, repeated-dialog, and invalid-dimension cases each create zero or one history entry as specified.
- [ ] 4.4 Replace the download data URL with asynchronous PNG Blob export and centralized object-URL cleanup; verify empty save does nothing, repeated saves contain the latest pixels, temporary URLs are revoked, and the large fixture export does not call `toDataURL()`.
- [ ] 4.5 Run load, crop, resize, undo/redo, and export end to end with the large fixture in Chrome, Firefox, and Safari and verify no base64 image path remains in application code.

## 5. Accelerate image filters

- [ ] 5.1 Add a feature-detected scratch-canvas filter path for grayscale, sepia, and invert, with deterministic pixel fallbacks, and verify tests cover accelerated selection, fallback selection, representative channel values, and alpha preservation.
- [ ] 5.2 Optimize threshold processing to direct channel indexing on a readback-oriented scratch context without per-pixel allocations, and verify threshold output and alpha preservation tests pass.
- [ ] 5.3 Route every filter through atomic replacement and exactly one history commit, leaving the base unchanged on failure; verify apply, undo, redo, and injected-failure behavior for all four filters.
- [ ] 5.4 Apply every filter to the large fixture in Chrome, Firefox, and Safari, verify the UI remains recoverable during processing, and record comparative timings to confirm the native paths improve grayscale, sepia, and invert over the baseline.

## 6. Remove Bootstrap and repair the application shell

- [ ] 6.1 Replace Bootstrap dropdowns with semantic native controls and the resize modal with `<dialog>`, convert toolbar triggers to valid buttons, and fix self-closing interactive HTML; verify keyboard, pointer, focus, escape, and close behavior in Chrome, Firefox, and Safari.
- [ ] 6.2 Remove Bootstrap CDN assets and global usage, add focused native-control and disabled-state styling, and verify the production build has no Bootstrap references or network requests.
- [ ] 6.3 Register all application listeners once at startup and surface concise load, processing, and export errors accessibly; verify repeated menu/dialog use triggers one action per activation and errors do not destroy the committed image.
- [ ] 6.4 Re-run the full large-image editing checklist after the shell migration and verify every operation remains reachable by keyboard and pointer.

## 7. Upgrade delivery tooling and complete integration

- [ ] 7.1 Upgrade Vite and regenerate the lockfile using a supported Node version, correct repository metadata, and verify clean `npm ci`, `npm test`, and production build runs.
- [ ] 7.2 Update GitHub Actions to maintained action versions, add pull-request test/build validation before deployment, and verify the workflow files are accepted and the same commands pass locally.
- [ ] 7.3 Run the complete capability scenario matrix with the 4000 by 3000 fixture in current Chrome, Firefox, and Safari, recording pass/fail results and fixing any cross-phase regressions before marking the change complete.
- [ ] 7.4 Compare the final interaction, filter, export, load, and retained-history memory results with the baseline, and verify the report confirms frame-coalesced previews, asynchronous PNG export, no interaction-time PNG encoding, and a 20-step history bound.

## Workflow follow-up

- Archive the change after implementation and review are complete.
- Verify the archived capability specs and remove any temporary measurement artifacts not intended for the repository.
