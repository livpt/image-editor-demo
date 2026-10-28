import assert from "node:assert/strict";
import test from "node:test";

import { keymap, matchShortcut } from "../keymap.js";

function event(partial) {
  return { altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, key: "", ...partial };
}

test("keymap lists the editing shortcuts and the reserved tool keys", () => {
  assert.equal(Object.isFrozen(keymap), true);
  const commands = keymap.map((binding) => binding.command);
  assert.deepEqual(commands, [
    "history.undo",
    "history.redo",
    "history.redo",
    "file.export",
    "file.open",
    "draw.pen",
    "draw.shape",
    "image.crop",
    "tool.move",
    "paint.brush",
    "select.rect",
    "select.lasso",
    "layer.transform",
  ]);
  assert.equal(keymap.find((binding) => binding.key === "m").note, "Marquee (M) arrives with F3.");
  for (const key of ["v", "b", "m", "l", "t"]) {
    assert.equal(typeof keymap.find((binding) => binding.key === key).note, "string");
  }
});

test("matchShortcut treats Ctrl and Command alike and keeps shift distinct", () => {
  assert.equal(matchShortcut(event({ key: "z", ctrlKey: true })).command, "history.undo");
  assert.equal(matchShortcut(event({ key: "Z", metaKey: true })).command, "history.undo");
  assert.equal(matchShortcut(event({ key: "z", ctrlKey: true, shiftKey: true })).command, "history.redo");
  assert.equal(matchShortcut(event({ key: "y", metaKey: true })).command, "history.redo");
  assert.equal(matchShortcut(event({ key: "s", ctrlKey: true })).command, "file.export");
  assert.equal(matchShortcut(event({ key: "o", metaKey: true })).command, "file.open");
  assert.equal(matchShortcut(event({ key: "p" })).command, "draw.pen");
  assert.equal(matchShortcut(event({ key: "u" })).command, "draw.shape");
  assert.equal(matchShortcut(event({ key: "c" })).command, "image.crop");
  assert.equal(matchShortcut(event({ key: "p", ctrlKey: true })), null);
  assert.equal(matchShortcut(event({ key: "z", ctrlKey: true, altKey: true })), null);
  assert.equal(matchShortcut(event({ key: "t" })).note, "Transform (T) arrives with F7.");
});
