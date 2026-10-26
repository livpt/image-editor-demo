# Colour and bit depth

The colour panel shows the foreground as a swatch, a hex field and an RGB field, and shows the colour under the cursor. Pen uses the foreground. Brightness shifts the active layer in the float buffer, so −50 then +50 returns the original pixels. Document info names an embedded profile, or says the file has none.

## Sub-features

- `foreground-fields` keeps the swatch, hex field and RGB field on the same colour.
- `cursor-readout` shows `#RRGGBB` and `R, G, B` for the pixel under the pointer, or `none` after the pointer leaves.
- `foreground-pen` paints the pen stroke in the foreground colour.
- `brightness-roundtrip` applies Brightness −50 and then +50 and restores the sampled pixels exactly.
- `document-profile` shows `Profile: none (assumed sRGB)` for a PNG with no profile, and the embedded name for a PNG that has one.

## How to get to it (user POV)

- The colour panel sits under the layers controls.
- Edit `Hex` or `RGB`, or use the foreground colour swatch.
- Move the pointer over the image.
- Open `Draw`, choose `Pen`, and drag on the image.
- Open `Filter`, set the brightness amount, and choose `Apply brightness`.
- Load a local PNG. The profile line is under the cursor readout.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/control.sh doctor` exits 0 and the 800x600 fixture is loaded.
- `read-state.js` with samples `[[10, 10], [400, 300]]` records the baseline pixels.
- `#documentInfo` reads `800 × 600 · Profile: none (assumed sRGB)`.

- **Hex.** `browser_fill` the hex field with `#ff0000`. The RGB field reads `255, 0, 0` and the swatch matches.
- **RGB.** `browser_fill` the RGB field with `0, 128, 255`. The hex field reads `#0080ff`.
- **Cursor.** Dispatch a `pointermove` on `#imageOverlay` at an intrinsic point, using the same client mapping as `scripts/drag-pointer.js`. `#cursorHex` and `#cursorRgb` match that pixel. A `pointerleave` sets the hex readout to `none`.
- **Pen.** Set the hex field to `#ff0000`, click `Draw`, then `Pen`, then run `scripts/drag-pointer.js` from `{ x: 100, y: 120 }` to `{ x: 300, y: 120 }`. A sample on that row is red (`255, 0, 0`).
- **Brightness.** Set `#brightnessAmount` to `-50`, click `Filter`, then `Apply brightness`. Samples change and Undo enables. Set the amount to `50` and apply again. Samples equal the pre-brightness pixels exactly.
- **Profile name.** Build a PNG that contains an iCCP chunk, hand it to `#fileInput` the same way `scripts/load-fixture.js` does, and wait for the ready status. `#documentInfo` includes the profile name. A non-sRGB name also includes `(shown as sRGB)`.
- **Proof.** Save the readouts and `read-state.js` outputs to `colour.json`. Save the file-byte check for a profile PNG to `test/manual/README.md`. The Cursor browser cannot read the downloaded file.

## Gotchas

- The brightness amount is a number field inside the Filter menu. Set it before clicking `Apply brightness`.
- A 1 pixel pen stroke is easy to miss. Sample the row you dragged.
- A generated fixture from `load-fixture.js` has no embedded profile, so the line says none.
- Save still cannot be inspected here. Re-embedding is covered by `node --test` and the manual export note.
