---
name: verify-history-store
description: Formally check HistoryStore undo/redo/cap and ImageBitmap lifetime invariants with an exhaustive action explorer on the real module. Use when changing history-store.js or the canvas.js commit/undo/redo path that feeds it, before claiming history is safe, or when a bug report involves leaked bitmaps, wrong undo depth, or redo after a branched edit.
---

# Verify HistoryStore

## Property (plain words)

**After every edit, undo, redo, reset, or dispose, every snapshot that left the store is closed exactly once, live snapshots stay open, past never exceeds the cap, and a new edit after undo discards the redo branch.**

**Harm if broken:** large `ImageBitmap`s stay alive after eviction or branch (memory grows with each edit), or Redo restores pixels the user already replaced.

## Why this tool

No TLA+/Java/SMT toolchain is available in this environment, and `HistoryStore` is plain JavaScript with no existing formal verifier for the language. The check therefore runs **the real** [`history-store.js`](../../../history-store.js) class under an exhaustive enumerator of action sequences (bounded depth and limit). That is stronger than the hand-written cases in `test/history-store.test.js` and stays cheap enough to re-run on every history change.

This is not a TLA+ model. Do not use `/statechart` for its results.

## Coverage

| Item | Value |
| --- | --- |
| Module | `history-store.js` |
| Class / methods | `HistoryStore` — `add`, `reset`, `undo`, `redo`, `dispose`, getters `canUndo` / `canRedo` / `size` |
| Callers in scope (read-only for this check) | `canvas.js` uses the store; the check does not drive the canvas |
| Sync commit | `9fa61ca8818f05ce26623537521d3030678580b9` |
| Bounds | default `--depth 5 --limit 2` (~1k states); raise depth when changing the stack logic |

Move the sync commit forward only after you confirm the check still describes the code at the new commit (re-run pass + one `--break` proof).

## When a change touches this

If the diff edits `history-store.js`, or changes how `canvas.js` calls `history.add` / `undo` / `redo` / `reset` / `dispose` or closes snapshots, run this skill before claiming the change is done.

## How to run

From the repo root:

```sh
node .cursor/skills/verify-history-store/check.mjs
```

Exit `0` and `"ok": true` means every explored sequence held the invariants.

Optional:

```sh
node .cursor/skills/verify-history-store/check.mjs --depth 6 --limit 2
node .cursor/skills/verify-history-store/check.mjs --break no-evict-close
node .cursor/skills/verify-history-store/check.mjs --break no-branch-clear
```

`--break` patches the real prototype for the duration of the run so you can prove the check still fails on a known bug class. Exit `0` with `"caughtBreak"` means the check caught it (good). Exit `2` means the break was not caught (the skill is stale).

## Invariants checked

After every step:

1. `past.length <= limit`
2. `size` matches the three arrays; `canUndo` / `canRedo` match lengths
3. No duplicate snapshot appears in past, present, and future together
4. Every snapshot still in the store is not closed
5. Every snapshot that left the store is closed exactly once

Postconditions:

- `add` leaves `future` empty (branch discard)
- `reset` leaves past and future empty
- `undo` / `redo` return the new present and move the old present onto the opposite stack
- `dispose` leaves the store empty

## Reading a failure

The printer shows a path of store operations, e.g.:

`reset(seed) → add(0) → add(1) → undo → add(3): future still has 1 entries after add`

That sequence is the counterexample in the code's words. Fix the product code (or, if the change is intentional, update this skill and move the sync commit). Do not weaken the invariant to make a real bug pass.

## What it does not cover

- Pixel contents or `ImageBitmap` behaviour in the browser (only `close()` lifetime)
- The async commit queue and overlay path in `canvas.js`
- Byte-size caps (not implemented yet; add when F9 lands)
- Concurrent callers (the store is single-threaded on the main thread)

Unit tests (`npm test`) and [verify-image-editor](../verify-image-editor/SKILL.md) still cover cases this bound does not.

## Maintenance

After an intentional history-behaviour change, update the invariants or bounds here, re-run the pass and a `--break` proof, then set **Sync commit** to the new HEAD. Use `/maintain-formal-verification-skill` when the check drifts from the code.
