# Tasks

## 1. Establish canvas verification

- [x] 1.1 Add an ES-module-compatible `npm test` command using Node's built-in test runner, preserve the existing Vite build, and verify both `npm test` and `npm run build` succeed.
- [x] 1.2 Extract pure helpers for coordinate scaling and crop normalization, retaining already-created dimension and pixel helpers for the image-processing follow-up; verify helper unit tests pass.
- [x] 1.3 Add a repeatable browser-based procedure that generates a 4000 by 3000 PNG fixture and a manual verification checklist; verify the generated file reports the expected intrinsic dimensions.
- [x] 1.4 Record baseline results for large-image pen, line, rectangle, ellipse, crop, pointer release, responsive display, and undo/redo, and verify every finding maps to canvas phase 2 or 3.

## 2. Refactor canvas interaction and previews

- [x] 2.1 Introduce a positioned base-and-overlay canvas stack with synchronized intrinsic dimensions and responsive CSS sizing, and verify the large fixture fits the viewport while retaining 4000 by 3000 intrinsic pixels.
- [x] 2.2 Replace mouse-specific hooks with one captured Pointer Events session, intrinsic coordinate mapping, pointer-cancel cleanup, and one `requestAnimationFrame` scheduler; verify unit tests and an instrumented rapid-move check show at most one preview render per frame.
- [x] 2.3 Migrate pen, line, rectangle, and ellipse tools to draw transient content on the overlay and commit once on release; verify each tool works through the shared pointer lifecycle and adds exactly one undo step.
- [x] 2.4 Migrate crop selection to the overlay and normalized scratch-canvas bounds, ignoring zero-area selections; verify all four drag directions produce the same region and empty crops leave history unchanged.
- [x] 2.5 Verify pointer cancellation and release outside the canvas do not cause ghost drawing, then run drawing and crop checks with the large fixture against the current-browser compatibility matrix.

## 3. Bound and harden history

- [x] 3.1 Implement a reusable history store capped at the current state plus 20 prior closeable snapshots; verify tests cover eviction, redo invalidation, replacement reset, and disposal.
- [x] 3.2 Integrate serialized bitmap commit, undo, and redo with canvas resizing and pending-state guards; verify rapid commits retain order and unavailable actions cause no error or image change.
- [x] 3.3 Load a replacement image after editing and verify old history is inaccessible and released, then perform at least 25 edits and verify only 20 undo steps remain.

## 4. Canvas integration verification

- [x] 4.1 Run unit tests and the production build, and verify drawing/crop application code no longer calls `toDataURL()` or restores the full base image during pointer movement.
- [x] 4.2 Run the complete canvas-editing scenario checklist with the 4000 by 3000 fixture, record browser results and retained-history observations, and resolve canvas regressions before marking the change complete.

## Workflow follow-up

- Continue image loading, resize, filters, export, shell cleanup, and tooling work under `modernize-image-processing`.
- Archive this canvas change only after review and verification are complete.
