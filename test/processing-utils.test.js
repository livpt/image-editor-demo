import assert from "node:assert/strict";
import test from "node:test";

import { filters } from "../processing-utils.js";

test("every filter exposes a float transform, and brightness takes an amount", () => {
  for (const filter of Object.values(filters)) {
    assert.equal(typeof filter.transform, "function");
    assert.equal(filter.canvasFilter, undefined);
  }
  assert.deepEqual(filters.brightness.params.amount, { type: "integer", min: -100, max: 100 });
});
