# Tasks

## 1. Modernize image loading, resize, and export

- [x] 1.1 Replace local-file base64 loading with asynchronous bitmap decode plus an object-URL image fallback, preserving the current image on failure; verify valid, invalid, replacement, and fallback loads with the 4000 by 3000 fixture.
- [x] 1.2 Handle dropped external URLs only when they can produce an editable origin-clean canvas and show a local-file recovery message otherwise; verify one allowed and one CORS-blocked source.
- [x] 1.3 Replace resize-through-PNG with validated high-quality scratch-canvas rendering and one-time listeners; verify ratio-preserving, freeform, repeated-dialog, and invalid-dimension cases create zero or one history entry as specified.
- [x] 1.4 Replace download data URLs with asynchronous PNG Blob export and centralized object-URL cleanup; verify empty and repeated saves, latest pixels, URL revocation, and absence of `toDataURL()`.
- [x] 1.5 Run load, resize, undo/redo, and export end to end with the large fixture in current Chrome, Firefox, and Safari.

## 2. Accelerate image filters

- [x] 2.1 Add feature-detected scratch-canvas filter paths for grayscale, sepia, and invert with deterministic pixel fallbacks; verify path selection, representative channels, and alpha preservation.
- [x] 2.2 Optimize threshold processing to direct channel indexing on a readback-oriented scratch context; verify threshold output and alpha preservation.
- [x] 2.3 Route every filter through atomic replacement and exactly one history commit, leaving the base unchanged on failure; verify apply, undo, redo, and injected failure behavior.
- [x] 2.4 Apply every filter to the large fixture in the browser matrix and record comparative timings against the baseline.

## 3. Remove Bootstrap and repair the application shell

- [x] 3.1 Replace Bootstrap dropdowns with semantic native controls and the resize modal with `<dialog>`, convert triggers to valid buttons, and verify keyboard, pointer, focus, escape, and close behavior.
- [x] 3.2 Remove Bootstrap CDN assets and global usage, add focused native-control styling, and verify the build has no Bootstrap references or requests.
- [x] 3.3 Register listeners once and surface processing errors accessibly; verify repeated controls trigger one operation and failures preserve the committed image.
- [x] 3.4 Re-run the large-image checklist and verify all operations remain keyboard and pointer accessible.

## 4. Upgrade delivery tooling and verify integration

- [x] 4.1 Upgrade Vite and regenerate the lockfile with a supported Node version, correct repository metadata, and verify clean install, tests, and production build.
- [x] 4.2 Update GitHub Actions to maintained versions with pull-request test/build validation and verify the same commands locally.
- [x] 4.3 Run the complete image-processing scenario matrix with the large fixture in current Chrome, Firefox, and Safari and resolve regressions.
- [x] 4.4 Compare final load, filter, resize, and export results with baseline measurements and verify removal of synchronous base64 paths.

## Workflow follow-up

- Archive after implementation and review are complete.
