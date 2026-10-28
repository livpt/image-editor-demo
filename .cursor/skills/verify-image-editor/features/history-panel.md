# History panel

The history panel lists the commands that are still retained. The current step is marked. Future steps are dimmed. Clicking a step, or pressing Enter on it, moves the document to that state in one update.

## Sub-features

- `history-list` shows past steps, the current step, and dimmed future steps.
- `history-click` restores the pixels of the clicked step.
- `history-enter` does the same when Enter activates the step button.
- `history-cap` lists only the steps the document still retains.

## How to get to it (user POV)

- The History section sits under Colour in the side panel.
- Click a step, or focus it and press Enter.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/control.sh doctor` exits 0 and the 800x600 fixture is loaded.
- `read-state.js` samples `[[10, 10], [400, 300]]` are the load pixels. Apply `Grayscale`, record those samples, then apply `Sepia` and record those too.

- **List.** `read-state.js` `history` labels are the load label, `Grayscale`, and `Sepia`. Sepia has `current: true`. The earlier steps have `future: false`.
- **Click.** `browser_click` the `Grayscale` history step. Samples equal the grayscale pixels. Sepia is in `history` with `future: true`. `canRedo` is true.
- **Enter.** Focus the load step and `browser_press_key` `Enter`. Samples equal the original pixels. Grayscale and Sepia are future steps.
- **Proof.** Save each `read-state.js` output to `history-panel.json` and a screenshot `history-panel.png` showing the current step.

## Gotchas

- The list shows retained steps only. After more than 20 edits, the oldest labels disappear. That cap is the same one the undo button uses.
- Clicking the step that is already current leaves the pixels unchanged.
- A click while the canvas is busy reports the busy error in the status line.
