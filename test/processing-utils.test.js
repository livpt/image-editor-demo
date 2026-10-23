import assert from "node:assert/strict";
import test from "node:test";

import { enableCanvasFilter, filters } from "../processing-utils.js";

test("selects supported canvas filter paths", () => {
  const context = { filter: "none" };
  assert.equal(enableCanvasFilter(context, "grayscale(1)"), true);
  assert.equal(context.filter, "grayscale(1)");
});

test("falls back when the context has no filter property", () => {
  assert.equal(enableCanvasFilter({}, "sepia(1)"), false);
  assert.equal(enableCanvasFilter({ filter: "none" }, null), false);
});

test("defines accelerated and pixel-only filter paths", () => {
  assert.equal(filters.grayscale.canvasFilter, "grayscale(1)");
  assert.equal(filters.sepia.canvasFilter, "sepia(1)");
  assert.equal(filters.invert.canvasFilter, "invert(1)");
  assert.equal(filters.threshold.canvasFilter, null);
  for (const filter of Object.values(filters)) {
    assert.equal(typeof filter.transform, "function");
  }
});
