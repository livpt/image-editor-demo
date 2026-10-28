# Shortcuts

The keymap binds undo, redo, export, open, and the tools that exist today. V, B, M, L, and T are reserved: each one writes a status line instead of doing nothing. Ctrl+T stays with the browser.

## Sub-features

- `shortcut-undo` maps Ctrl+Z and Command+Z to undo.
- `shortcut-redo` maps Ctrl+Shift+Z and Ctrl+Y to redo.
- `shortcut-tools` maps P to Pen, U through Line, Rectangle, and Ellipse, and C to Crop.
- `shortcut-export` maps Ctrl+S to the export dialog and Ctrl+O to the file picker.
- `shortcut-reserved` maps M to the status `Marquee (M) arrives with F3.` V, B, L, and T each name their later tool.

## How to get to it (user POV)

- Press the key while focus is outside a text field and no dialog is open.
- The toolbar buttons that have a key expose it with `aria-keyshortcuts`.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/control.sh doctor` exits 0 and the 800x600 fixture is loaded.
- Apply `Sepia` so undo has a step. Record baseline and sepia samples with `read-state.js` at `[[10, 10], [400, 300]]`.
- Click the canvas column so focus is not in an input. `browser_press_key` supplies the key.

- **Pen.** Press `p`. Status reads `Pen tool selected.`
- **Shapes.** Press `u` three times. Status reads `Line tool selected.`, then `Rectangle tool selected.`, then `Ellipse tool selected.`
- **Crop.** Press `c`. Status reads `Crop tool selected.`
- **Reserved.** Press `m`. Status reads `Marquee (M) arrives with F3.` Press `v`, `b`, `l`, and `t` and confirm each status names Move, Brush, Lasso, or Transform.
- **Undo.** Press `Control+z`. Samples return to the pre-sepia pixels and `canRedo` is true.
- **Export.** Press `Control+s`. `exportDialogOpen` is true. Close the dialog before the next key.
- **Proof.** Save the status and samples to `shortcuts.json`.

## Gotchas

- Keys do nothing while a dialog is open or while a text field, including the console, is focused.
- `Control+t` is not handled. The export dialog says the browser reserves it.
- Holding a key repeats in the browser; the page ignores repeats, so one press is one action.
