# Design

## Context

See `proposal.md` for why this change exists. The editor already commits through one bitmap path in `canvas.js` and stores raw bitmaps in `HistoryStore`. The toolbar in `index.js` calls a different method per tool. This design wraps that path. It does not add layers.

## Goals / Non-Goals

**Goals:**

- One registry of command specs, validated before `execute`.
- One history entry shape, with a count cap and a byte cap.
- One session method, `run`, that writes history for command commits.
- One draw-tool table so a pointer release commits one command.
- A frozen page facade, shortcuts, and a console panel on that same `run`.

**Non-Goals:**

- Layers, new tools, or a schema library.
- Partial-frame undo.
- Making undo or redo into history entries.
- Loading an image through `run` with a decoded bitmap.

## Decisions

### 1. A registry of command specs

`commands.js` exports `createRegistry()` and `CommandError`. A spec is `{ name, label, historyMode, params, validate, execute }`. `historyMode` is `"add"` or `"reset"`. `define` rejects a duplicate name and a spec that is not well formed. `dispatch` parses JSON parameters, runs `validate`, then calls `execute`. `list` and `get` return `{ name, label, historyMode, params }` and omit `execute`.

`execute` returns `{ source, info }`. It does not paint the visible canvas and it does not touch history. The session adapter does that.

Hand-written checks cover `number`, `integer`, `point`, and `points`. A field is required unless it has a `default`. Unknown fields fail. Strings are not coerced to numbers. A schema library was rejected because the project stays dependency-light and the field set is small.

### 2. History entries and two caps

An entry is `{ name, label, params, snapshot }`. `HistoryStore` closes `entry.snapshot`. The constructor takes a number, the past-count limit, or `{ limit, maxBytes }`. The count default is 20. The byte default is unlimited so existing callers can pass `2` in tests.

`bytes` sums `width * height * 4` over past and future snapshots. The present snapshot is exempt. After a new entry is added and the redo branch is closed, the store drops the oldest past entry while the past count is over the limit or `bytes` is over `maxBytes`. A present snapshot that is larger than `maxBytes` stays until a later edit pushes it into the past.

`undo` returns `{ present, undone }` or `null`. `redo` returns `{ present, redone }` or `null`. The page facade returns the public entry that moved, or `null`, with no snapshot attached. `entries()` returns the same public view for `doc`.

The byte budget is 256 MiB in the editor. At 4000 by 3000, one snapshot is 48,000,000 bytes, so the cap keeps five prior frames. A small image still hits the count of 20 first.

### 3. The session adapter is the only history writer for commands

`canvas.run(name, params)` checks busy, then checks that an image is loaded, then `dispatch`es in the same turn. `dispatch` calls `execute` before the first await. `enqueue` then raises the busy count before `createImageBitmap`. A second `run` in that window gets `CommandError` `busy`.

`commit` builds the bitmap, paints it, and calls `history.add` or `history.reset` from the spec's `historyMode`. The caller does not pass a reset flag. If paint throws after the bitmap exists, `commit` closes that bitmap, blits the previous present, and rethrows.

`canvas.load(source, { label })` remains the non-JSON entry for a decoded image. It probes for a tainted source, then commits with the `image.load` spec, whose `historyMode` is `"reset"`. `run("image.load", …)` does not accept the bitmap. The command stays in the catalog so history can name the baseline.

Filters, resize, and crop are `execute` bodies that return a scratch canvas. The old public mutators are deleted in the same change, and `index.js` calls `run`, `load`, `armTool`, and `doc`.

### 4. One draw-tool table

`drawTools` holds the schema, the cross-field check, the stroke function, and `paramsFrom` for line, rectangle, ellipse, and pen. Preview and commit both call that stroke function with the default context (black, 1px). Pen strokes each segment separately so corners match the preview. Pointer-up calls `run` once. A failed validation, such as a zero-area shape, clears the overlay and writes no history entry. Crop uses the same pointer session, clips the rectangle to the image, and does not reject an in-progress drag that crosses the edge.

### 5. The page binds the facade and nothing behind it

`index.js` imports `canvas.js` only. It does not import the registry or the history store. Filter buttons are wired from the catalog. Tool buttons call `armTool`. Shortcuts are a key table to `undo` and `redo`, not commands. `window.app` is `Object.freeze` of `run`, `undo`, `redo`, `commands`, and a `doc` getter. The console panel evaluates one expression with `new Function("app", …)` against that object.

## Risks / Trade-offs

- [Full-frame snapshots still dominate memory] → Cap prior frames at 256 MiB and close every evicted bitmap. Confirm with the 4000 by 3000 fixture that the byte cap fires before 20 steps, and with a small image that 25 edits leave 20 undo steps.
- [A paint failure could show pixels that are not in history] → Close the new bitmap and restore the previous present before rethrowing.
- [Rapid toolbar clicks used to overlap the bitmap await] → Set busy in the same turn as `dispatch`, before the await.
- [Pen parameter lists can be long] → They are JSON on the entry and are not added to the byte budget. The budget counts snapshot pixels only.
- [The console evaluates text typed into the page] → It is a local panel over the frozen facade, with no network call.

## Migration Plan

1. Land the history entry shape and teach the canvas to wrap existing bitmaps so the app still opens.
2. Land the registry and its tests with no DOM.
3. Register commands, route commits through `run`, and delete the old mutators together with their page callers.
4. Add shortcuts, the frozen facade, and the console panel.
5. Run `npm test`, `npm run build`, and the history checker. On the 4000 by 3000 fixture, confirm one entry per edit, invalid parameters leave the canvas unchanged, and the byte cap evicts before 20 steps.

No stored user data moves. Rollback is reverting the branch.
