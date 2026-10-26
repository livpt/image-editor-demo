# Autosave

Edits are written to IndexedDB a few seconds after the last command, and immediately when the tab is hidden. Reopening the page offers to restore that project. Restore brings the pixels back. Discard deletes the saved record.

## Sub-features

- `autosave-flush` writes a recovery record when the page becomes hidden.
- `autosave-prompt` shows `Restore work from HH:MM, <width> × <height>` after a reload.
- `autosave-restore` loads that project and the sampled pixels match the edit.
- `autosave-discard` closes the dialog and leaves the canvas empty.

## How to get to it (user POV)

- Edit, leave the tab or reload, and choose `Restore` or `Discard`.
- A second tab shows `Autosave is on in another tab.` and does not write.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/control.sh doctor` exits 0.
- If `#restoreDialog` is already open from an earlier run, `browser_click` `Discard` before loading the fixture.
- Load the 800x600 fixture, apply `Sepia`, and record `read-state.js` samples `[[10, 10], [400, 300]]`.

- **Flush.** In `Runtime.evaluate` with `awaitPromise: true`, set `document.visibilityState` to `hidden` with a configurable getter, dispatch `visibilitychange`, then poll IndexedDB database `image-editor`, store `recovery`, key `current` until a record exists. Put `visibilityState` back to `visible` afterwards.
- **Reload.** `browser_navigate` to the same harness URL. The restore dialog is open. Its message matches `Restore work from HH:MM, 800 × 600`.
- **Restore.** `browser_click` `Restore`. Status reads `Restored the autosaved project.` Samples equal the sepia pixels. `canUndo` is false.
- **Discard.** Flush again, reload, and `browser_click` `Discard`. Status reads `Discarded the autosaved project.` The canvas stack is hidden and the toolbar stays disabled.
- **Proof.** Save the sepia samples and the restored samples to `autosave.json`. They must be equal.

## Gotchas

- The restore dialog blocks Escape. Choose Restore or Discard.
- Autosave does not write while that dialog is open, so a flush before choosing cannot replace the record with an empty document.
- Quota failure is a status line, `Autosave paused: storage is full.` Do not try to fill the quota from this recipe; that check is in `test/manual/README.md`.
- The record survives in this browser profile. Discard it at the start of the next run.
