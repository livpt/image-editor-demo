import assert from "node:assert/strict";
import test from "node:test";

import { CommandError, createRegistry } from "../commands.js";

function resizeSpec(execute = () => ({ source: "resized" })) {
  return {
    name: "image.resize",
    label: "Resize",
    historyMode: "add",
    params: {
      width: { type: "integer", min: 1 },
      height: { type: "integer", min: 1 },
    },
    execute,
  };
}

test("list returns JSON descriptors and hides execute", () => {
  const registry = createRegistry();
  registry.define(resizeSpec());
  registry.define({
    name: "filter.sepia",
    label: "Sepia",
    historyMode: "add",
    params: {},
    execute: () => ({ source: "sepia" }),
  });

  const listed = registry.catalog.list();
  const parsed = JSON.parse(JSON.stringify(listed));
  assert.deepEqual(
    parsed.map((item) => item.name),
    ["filter.sepia", "image.resize"]
  );
  assert.equal(parsed[1].historyMode, "add");
  assert.deepEqual(parsed[1].params.width, { type: "integer", min: 1 });
  assert.equal(Object.hasOwn(parsed[0], "execute"), false);
  assert.equal(JSON.stringify(listed).includes("execute"), false);
  assert.equal(registry.catalog.get("filter.sepia").label, "Sepia");
});

test("dispatch returns the plan for valid params", () => {
  const registry = createRegistry();
  registry.define(
    resizeSpec((params) => ({
      source: { width: params.width, height: params.height },
      info: { accelerated: false },
    }))
  );

  const invocation = registry.dispatch("image.resize", { width: 800, height: 600 });
  assert.equal(invocation.name, "image.resize");
  assert.equal(invocation.label, "Resize");
  assert.equal(invocation.historyMode, "add");
  assert.deepEqual(invocation.params, { width: 800, height: 600 });
  assert.equal(Object.isFrozen(invocation.params), true);
  assert.deepEqual(invocation.plan, {
    source: { width: 800, height: 600 },
    info: { accelerated: false },
  });
});

test("dispatch fills defaults and rejects unknown fields and numeric strings", () => {
  const registry = createRegistry();
  registry.define({
    name: "draw.line",
    label: "Line",
    historyMode: "add",
    params: {
      x1: { type: "number", default: 0 },
      y1: { type: "number" },
    },
    execute: (params) => ({ source: params }),
  });

  const invocation = registry.dispatch("draw.line", { y1: 4 });
  assert.deepEqual(invocation.params, { x1: 0, y1: 4 });

  assert.throws(
    () => registry.dispatch("draw.line", { y1: 4, extra: 1 }),
    (error) => error instanceof CommandError && error.code === "invalid" && error.message.includes('unknown field "extra"')
  );
  assert.throws(
    () => registry.dispatch("image.resize", { width: "800", height: 1 }),
    (error) => error.code === "unknown"
  );

  registry.define(resizeSpec());
  assert.throws(
    () => registry.dispatch("image.resize", { width: "800", height: 1 }),
    (error) =>
      error.code === "invalid" &&
      error.message === 'image.resize: "width" must be an integer >= 1.'
  );
});

test("invalid params throw one error and do not run the command", () => {
  let ran = false;
  const registry = createRegistry();
  registry.define(resizeSpec(() => {
    ran = true;
    return { source: "nope" };
  }));

  assert.throws(
    () => registry.dispatch("image.resize", { width: -1 }),
    (error) =>
      error.code === "invalid" &&
      error.message ===
        'image.resize: "width" must be an integer >= 1; "height" is required.'
  );
  assert.equal(ran, false);
  assert.throws(
    () => registry.dispatch("image.sharpen"),
    (error) =>
      error.code === "unknown" && error.message === 'Unknown command "image.sharpen".'
  );
});

test("validate can reject before execute", () => {
  let ran = false;
  const registry = createRegistry();
  registry.define({
    name: "image.crop",
    label: "Crop",
    historyMode: "add",
    params: {
      width: { type: "integer", min: 1 },
      height: { type: "integer", min: 1 },
    },
    validate(params, context) {
      assert.equal(params.width, 20);
      assert.equal(context.width, 10);
      return "rect exceeds the image";
    },
    execute() {
      ran = true;
      return { source: "crop" };
    },
  });

  assert.throws(
    () => registry.dispatch("image.crop", { width: 20, height: 4 }, { width: 10 }),
    (error) => error.code === "invalid" && error.message === "image.crop: rect exceeds the image"
  );
  assert.equal(ran, false);
});

test("duplicate names and incomplete specs are rejected", () => {
  const registry = createRegistry();
  registry.define(resizeSpec());
  assert.throws(
    () => registry.define(resizeSpec()),
    (error) => error.code === "duplicate"
  );
  assert.equal(registry.catalog.list().length, 1);

  assert.throws(
    () =>
      registry.define({
        name: "filter.blur",
        label: "Blur",
        historyMode: "add",
        params: {},
      }),
    (error) => error.code === "spec" && error.message.includes("execute")
  );
  assert.throws(
    () => registry.catalog.get("filter.blur"),
    (error) => error.code === "unknown"
  );
});

test("point lists accept finite points and reject a short pen stroke", () => {
  const registry = createRegistry();
  registry.define({
    name: "draw.pen",
    label: "Pen",
    historyMode: "add",
    params: { points: { type: "points", minLength: 2 } },
    execute: (params) => ({ source: params.points.length }),
  });

  const invocation = registry.dispatch("draw.pen", {
    points: [
      { x: 0, y: 0 },
      { x: 3, y: 4 },
    ],
  });
  assert.equal(invocation.plan.source, 2);
  assert.throws(
    () => registry.dispatch("draw.pen", { points: [{ x: 1, y: 1 }] }),
    (error) => error.code === "invalid" && error.message.includes("at least 2 points")
  );
});

test("strings trim, enforce length bounds, and null picks the default", () => {
  const registry = createRegistry();
  registry.define({
    name: "layer.rename",
    label: "Rename",
    historyMode: "add",
    params: {
      name: { type: "string", trim: true, minLength: 1, maxLength: 5, default: " Layer " },
    },
    execute: (params) => ({ source: params.name }),
  });

  assert.equal(registry.dispatch("layer.rename", { name: "  ab " }).params.name, "ab");
  assert.equal(registry.dispatch("layer.rename", { name: null }).params.name, "Layer");
  assert.equal(registry.dispatch("layer.rename", {}).params.name, "Layer");
  for (const bad of ["   ", "abcdef", 7, ["a"]]) {
    assert.throws(
      () => registry.dispatch("layer.rename", { name: bad }),
      (error) =>
        error.code === "invalid" &&
        error.message ===
          'layer.rename: "name" must be a string of at least 1 and at most 5 characters.'
    );
  }
});

test("string enums and booleans accept only their members", () => {
  const registry = createRegistry();
  registry.define({
    name: "layer.blend",
    label: "Blend",
    historyMode: "add",
    params: {
      blend: { type: "string", enum: ["normal", "multiply"] },
      visible: { type: "boolean", default: true },
    },
    execute: (params) => ({ source: params }),
  });

  assert.deepEqual(registry.dispatch("layer.blend", { blend: "multiply" }).params, {
    blend: "multiply",
    visible: true,
  });
  assert.equal(
    registry.dispatch("layer.blend", { blend: "normal", visible: false }).params.visible,
    false
  );
  assert.throws(
    () => registry.dispatch("layer.blend", { blend: "screen", visible: "yes" }),
    (error) =>
      error.code === "invalid" &&
      error.message ===
        'layer.blend: "blend" must be one of "normal", "multiply"; "visible" must be true or false.'
  );
  assert.throws(
    () => registry.dispatch("layer.blend", { blend: " normal" }),
    (error) => error.code === "invalid"
  );
});

test("string and boolean specs reject malformed schemas and defaults", () => {
  const registry = createRegistry();
  const define = (params) =>
    registry.define({ name: "x.y", label: "X", historyMode: "add", params, execute: () => ({}) });

  assert.throws(() => define({ a: { type: "string", minLength: -1 } }), (e) => e.code === "spec");
  assert.throws(() => define({ a: { type: "string", enum: [] } }), (e) => e.code === "spec");
  assert.throws(() => define({ a: { type: "string", enum: [1] } }), (e) => e.code === "spec");
  assert.throws(() => define({ a: { type: "string", trim: "yes" } }), (e) => e.code === "spec");
  assert.throws(() => define({ a: { type: "string", pattern: ".*" } }), (e) => e.code === "spec");
  assert.throws(
    () => define({ a: { type: "string", maxLength: 2, default: "abc" } }),
    (e) => e.code === "spec" && e.message.includes("default outside its schema")
  );
  assert.throws(() => define({ a: { type: "boolean", default: 1 } }), (e) => e.code === "spec");
  assert.throws(() => define({ a: { type: "boolean", min: 0 } }), (e) => e.code === "spec");
  define({ a: { type: "string", trim: true, minLength: 1, default: " ok " } });
});
