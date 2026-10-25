# Design system review

These tokens come from DESIGN.md, measured from cursor.com by Dembrandt, with Geist standing in for CursorGothic.

## Tokens

- `--color-primary`: `#F54E00`
- `--color-secondary`: `#E6E5E0`
- `--color-tertiary`: `#65AFE0`
- `--color-surface`: `#F2F1ED`
- `--color-on-surface`: `#000000`
- `--color-button-bg`: `#26251E`
- `--color-button-fg`: `#F7F7F4`
- `--font-sans`: `"Geist", system-ui, "Helvetica Neue", Helvetica, Arial, sans-serif`
- `--font-mono`: `"Geist Mono", ui-monospace, Menlo, monospace`

## Rules

- Flag any colour literal (hex, rgb, rgba, hsl, hsla) in `styles.css` that sits outside the `:root` rule.
- Flag a new `font-family` that is not Geist, Geist Mono, or a `var(--font-sans)` / `var(--font-mono)` reference.
- Flag a pull request that changes `styles.css`, `index.html`, `index.js`, `layers.js`, or `layer-drag.js` when the PR description does not mention running the `verify-design` skill.
