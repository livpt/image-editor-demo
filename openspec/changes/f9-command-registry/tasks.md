# Tasks

## 1. History entries

- [x] 1.1 Change `HistoryStore` entries to `{ name, label, params, snapshot }`, close `.snapshot`, accept a numeric limit or `{ limit, maxBytes }`, and expose `bytes` and `entries()`. Verify `npm test` covers eviction, the byte cap, redo invalidation, and the undo/redo result shape.
- [ ] 1.2 Update `.cursor/skills/verify-history-store/check.mjs` for entry objects and record the sync commit in that skill. Verify `node .cursor/skills/verify-history-store/check.mjs` exits 0.
- [x] 1.3 Wrap existing bitmaps in `canvas.js` so the current page still commits. Verify `npm run build` succeeds.

## 2. Command registry

- [ ] 2.1 Add `commands.js` with `define`, `get`, `list`, and `dispatch`, and hand-written parameter checks. Verify `test/commands.test.js` covers JSON listing, a successful dispatch, invalid parameters, and a duplicate name.

## 3. Session adapter

- [ ] 3.1 Register load, crop, resize, filter, and draw commands in `canvas.js`. Route commits through `run` and `commit`, and read `historyMode` from the spec. Verify a second `run` started in the same turn is rejected as busy.
- [ ] 3.2 Commit pointer tools from one `drawTools` table on pointer-up, and clip crop rectangles to the image. Verify a zero-area gesture adds no history entry.
- [ ] 3.3 Delete the old canvas mutators and point `index.js` at `run`, `load`, `armTool`, and `doc`. Verify `npm test` and `npm run build` succeed.

## 4. Page facade

- [ ] 4.1 Bind Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl/Cmd+Y to undo and redo, and publish frozen `window.app`. Verify the shortcut table ignores an open dialog and a focused text field.
- [ ] 4.2 Add the console panel in `index.html` and `styles.css`. Verify a submitted expression logs JSON or the error message.
- [ ] 4.3 Add an import-boundary test and a catalog-versus-DOM test. Verify only `canvas.js` imports the history store, `index.js` imports neither the registry nor the history store, and filter and tool button ids match registered names.

## 5. Large-image check

- [ ] 5.1 Run `npm test`, `npm run build`, and `node .cursor/skills/verify-history-store/check.mjs`.
- [ ] 5.2 With the 4000 by 3000 fixture, run a filter and undo, and confirm one history entry per action. Confirm invalid parameters leave the canvas unchanged. Confirm 25 edits on a small image leave 20 undo steps, and confirm the byte cap evicts prior 4000 by 3000 frames before the count reaches 20.

## Workflow follow-up

- Open the pull request for Linear MSHO-13 after the checks above pass.
- Archive this change after review.
