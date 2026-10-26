import assert from "node:assert/strict";
import test from "node:test";

import {
  addLayer,
  createDraft,
  deleteNode,
  drawDocument,
  duplicateNode,
  findNode,
  freezeDocument,
  groupLayer,
  layerSource,
  paintLayer,
  pixelLayers,
  publicLayers,
  renameNode,
  reorderNode,
  resampleLayers,
  resolveActive,
  setBlend,
  setOpacity,
  setVisibility,
  sizeProblem,
} from "../layers.js";

const px = (tag) => ({ tag });

function invalid(reason) {
  return (error) =>
    error.name === "CommandError" && error.code === "invalid" && error.message.includes(reason);
}

function ids(tree) {
  return tree.map((node) => (node.kind === "group" ? [node.id, ids(node.children)] : node.id));
}

function threeLayers() {
  let doc = createDraft({ width: 4, height: 3, pixels: px("bg") });
  doc = addLayer(doc, { afterId: 1, pixels: px("mid") });
  doc = addLayer(doc, { afterId: 2, pixels: px("top") });
  return doc;
}

test("createDraft births one background layer and refuses oversized documents", () => {
  const doc = createDraft({ width: 4, height: 3, pixels: px("bg") });
  assert.deepEqual(ids(doc.tree), [1]);
  assert.equal(doc.nextId, 2);
  assert.equal(doc.tree[0].name, "Background");
  assert.equal(Object.isFrozen(doc), true);
  assert.equal(Object.isFrozen(doc.tree), true);
  assert.equal(Object.isFrozen(doc.tree[0]), true);

  assert.equal(sizeProblem(10_000, 5_000), null);
  assert.match(sizeProblem(10_001, 5_000), /50 megapixel/);
  assert.throws(
    () => createDraft({ width: 10_001, height: 5_000, pixels: px("x") }),
    invalid("megapixel")
  );
  assert.throws(() => createDraft({ width: 0, height: 5, pixels: px("x") }), invalid("positive"));
});

test("addLayer inserts in front of the active row and never mutates the input", () => {
  const first = createDraft({ width: 4, height: 3, pixels: px("bg") });
  const second = addLayer(first, { afterId: 1, pixels: px("a") });
  assert.deepEqual(ids(first.tree), [1]);
  assert.deepEqual(ids(second.tree), [1, 2]);
  assert.equal(second.tree[1].name, "Layer 2");
  assert.deepEqual(
    { ...second.tree[1], pixels: undefined },
    { kind: "pixel", id: 2, name: "Layer 2", visible: true, opacity: 100, blend: "normal", pixels: undefined, buffer: null }
  );

  const between = addLayer(second, { afterId: 1, name: "  Sky ", pixels: px("b") });
  assert.deepEqual(ids(between.tree), [1, 3, 2]);
  assert.equal(between.tree[1].name, "Sky");

  assert.throws(() => addLayer(second, { afterId: 9, pixels: px("c") }), invalid("no layer 9"));
  assert.throws(() => addLayer(second, { afterId: 1, name: "   ", pixels: px("c") }), invalid("required"));
  assert.throws(
    () => addLayer(second, { afterId: 1, name: "x".repeat(81), pixels: px("c") }),
    invalid("80 characters")
  );
  assert.throws(() => addLayer(second, { afterId: 1 }), invalid("pixels"));
  assert.equal(addLayer.problem(second, { afterId: 1, pixels: px("c") }), null);
});

test("groupLayer wraps one node in place and the group has no pixels", () => {
  const doc = groupLayer(threeLayers(), { id: 2 });
  assert.deepEqual(ids(doc.tree), [1, [4, [2]], 3]);
  const group = doc.tree[1];
  assert.equal(group.kind, "group");
  assert.equal(group.name, "Group 4");
  assert.equal(Object.hasOwn(group, "pixels"), false);
  assert.equal(doc.nextId, 5);

  const nested = groupLayer(doc, { id: 4, name: "Outer" });
  assert.deepEqual(ids(nested.tree), [1, [5, [[4, [2]]]], 3]);
  assert.throws(() => groupLayer(doc, { id: 42 }), invalid("no layer 42"));
});

test("deleteNode removes a subtree and refuses the last pixel layer", () => {
  const doc = groupLayer(threeLayers(), { id: 2 });
  const withoutGroup = deleteNode(doc, { id: 4 });
  assert.deepEqual(ids(withoutGroup.tree), [1, 3]);

  const one = deleteNode(withoutGroup, { id: 1 });
  assert.deepEqual(ids(one.tree), [3]);
  assert.throws(() => deleteNode(one, { id: 3 }), invalid("last layer"));

  const grouped = groupLayer(one, { id: 3 });
  assert.throws(() => deleteNode(grouped, { id: 5 }), invalid("last layer"));
  assert.equal(deleteNode.problem(grouped, { id: 5 }), "cannot delete the last layer");
  assert.throws(() => deleteNode(doc, { id: 77 }), invalid("no layer 77"));
});

test("renameNode trims and bounds names", () => {
  const doc = threeLayers();
  const renamed = renameNode(doc, { id: 2, name: "  Clouds  " });
  assert.equal(findNode(renamed.tree, 2).node.name, "Clouds");
  assert.equal(findNode(doc.tree, 2).node.name, "Layer 2");
  assert.throws(() => renameNode(doc, { id: 2, name: "" }), invalid("required"));
  assert.throws(() => renameNode(doc, { id: 2, name: 3 }), invalid("required"));
  assert.throws(() => renameNode(doc, { id: 2, name: "y".repeat(81) }), invalid("80 characters"));
  assert.equal(renameNode(doc, { id: 2, name: "y".repeat(80) }).tree[1].name.length, 80);
});

test("duplicateNode copies a subtree with fresh ids in front of the original", () => {
  const doc = setOpacity(groupLayer(threeLayers(), { id: 2 }), { id: 2, opacity: 40 });
  const copied = duplicateNode(doc, { id: 4 });
  assert.deepEqual(ids(copied.tree), [1, [4, [2]], [5, [6]], 3]);
  assert.equal(copied.nextId, 7);
  const copy = copied.tree[2];
  assert.equal(copy.name, "Group 4 copy");
  assert.equal(copy.children[0].name, "Layer 2");
  assert.equal(copy.children[0].opacity, 40);
  assert.equal(copy.children[0].pixels, findNode(doc.tree, 2).node.pixels);

  const longName = renameNode(doc, { id: 3, name: "z".repeat(80) });
  const copyOfLong = duplicateNode(longName, { id: 3 });
  assert.equal(copyOfLong.tree[3].name.length, 80);
  assert.throws(() => duplicateNode(doc, { id: 99 }), invalid("no layer 99"));
});

test("reorderNode moves between parents and refuses a node's own subtree", () => {
  const doc = groupLayer(threeLayers(), { id: 2 });
  assert.deepEqual(ids(doc.tree), [1, [4, [2]], 3]);

  const toFront = reorderNode(doc, { id: 1, parentId: 0, index: 2 });
  assert.deepEqual(ids(toFront.tree), [[4, [2]], 3, 1]);

  const intoGroup = reorderNode(doc, { id: 3, parentId: 4, index: 0 });
  assert.deepEqual(ids(intoGroup.tree), [1, [4, [3, 2]]]);

  const outOfGroup = reorderNode(intoGroup, { id: 2, parentId: 0, index: 0 });
  assert.deepEqual(ids(outOfGroup.tree), [2, 1, [4, [3]]]);

  assert.throws(() => reorderNode(doc, { id: 4, parentId: 4, index: 0 }), invalid("into itself"));
  const deep = groupLayer(doc, { id: 4 });
  assert.throws(() => reorderNode(deep, { id: 5, parentId: 4, index: 0 }), invalid("into itself"));
  assert.throws(() => reorderNode(doc, { id: 1, parentId: 3, index: 0 }), invalid("no layer 3 to move into"));
  assert.throws(() => reorderNode(doc, { id: 1, parentId: 0, index: 3 }), invalid("between 0 and 2"));
  assert.throws(() => reorderNode(doc, { id: 1, parentId: 4, index: 2 }), invalid("between 0 and 1"));
  assert.throws(() => reorderNode(doc, { id: 1, parentId: 0, index: -1 }), invalid("between"));
  assert.throws(() => reorderNode(doc, { id: 1, parentId: 0, index: 1.5 }), invalid("between"));
  assert.throws(() => reorderNode(doc, { id: 8, parentId: 0, index: 0 }), invalid("no layer 8"));
});

test("visibility, opacity and blend update one node and validate their values", () => {
  const doc = threeLayers();
  const hidden = setVisibility(doc, { id: 2, visible: false });
  assert.equal(hidden.tree[1].visible, false);
  assert.equal(doc.tree[1].visible, true);
  assert.throws(() => setVisibility(doc, { id: 2, visible: "no" }), invalid("true or false"));

  const faded = setOpacity(doc, { id: 2, opacity: 0 });
  assert.equal(faded.tree[1].opacity, 0);
  assert.throws(() => setOpacity(doc, { id: 2, opacity: 101 }), invalid("between 0 and 100"));
  assert.throws(() => setOpacity(doc, { id: 2, opacity: 50.5 }), invalid("between 0 and 100"));

  const blended = setBlend(doc, { id: 2, blend: "overlay" });
  assert.equal(blended.tree[1].blend, "overlay");
  assert.throws(() => setBlend(doc, { id: 2, blend: "darken" }), invalid('"normal", "multiply", "screen", "overlay"'));
  assert.throws(() => setBlend(doc, { id: 55, blend: "screen" }), invalid("no layer 55"));
});

test("layerSource and paintLayer address pixel layers only", () => {
  const doc = groupLayer(threeLayers(), { id: 2 });
  assert.deepEqual(layerSource(doc, 2), px("mid"));
  assert.throws(() => layerSource(doc, 4), invalid("is a group"));
  assert.throws(() => layerSource(doc, 12), invalid("no layer 12"));

  const painted = paintLayer(doc, { id: 2, pixels: px("fresh") });
  assert.deepEqual(layerSource(painted, 2), px("fresh"));
  assert.deepEqual(layerSource(doc, 2), px("mid"));
  assert.throws(() => paintLayer(doc, { id: 4, pixels: px("x") }), invalid("is a group"));
  assert.throws(() => paintLayer(doc, { id: 2 }), invalid("pixels"));
});

test("resampleLayers resizes the document and visits every pixel layer once", () => {
  const doc = groupLayer(threeLayers(), { id: 2 });
  const visited = [];
  const resized = resampleLayers(doc, {
    width: 8,
    height: 6,
    resample: (layer) => {
      visited.push(layer.pixels.tag);
      return { pixels: px(`${layer.pixels.tag}@8x6`), buffer: null };
    },
  });
  assert.deepEqual(visited, ["bg", "mid", "top"]);
  assert.equal(resized.width, 8);
  assert.equal(resized.height, 6);
  assert.deepEqual(ids(resized.tree), ids(doc.tree));
  assert.deepEqual(pixelLayers(resized.tree).map((layer) => layer.pixels.tag), ["bg@8x6", "mid@8x6", "top@8x6"]);
  assert.equal(doc.width, 4);
  assert.throws(
    () => resampleLayers(doc, { width: 10_001, height: 5_000, resample: (p) => p }),
    invalid("megapixel")
  );
  assert.throws(() => resampleLayers(doc, { width: 2, height: 2 }), invalid("resample"));
});

test("publicLayers hides pixels and resolveActive repairs a stale id", () => {
  const doc = groupLayer(threeLayers(), { id: 2 });
  const view = publicLayers(doc.tree);
  assert.equal(JSON.stringify(view).includes("pixels"), false);
  assert.equal(JSON.stringify(view).includes("buffer"), false);
  assert.deepEqual(view[1], {
    kind: "group",
    id: 4,
    name: "Group 4",
    visible: true,
    opacity: 100,
    blend: "normal",
    children: [{ kind: "pixel", id: 2, name: "Layer 2", visible: true, opacity: 100, blend: "normal" }],
  });
  assert.equal(Object.isFrozen(view), true);
  assert.equal(Object.isFrozen(view[1].children[0]), true);

  assert.equal(resolveActive(doc, 4), 4);
  assert.equal(resolveActive(doc, 2), 2);
  assert.equal(resolveActive(doc, 99), 3);
  assert.equal(resolveActive(doc, null), 3);
  assert.equal(resolveActive(createDraft({ width: 1, height: 1, pixels: px("o") }), null), 1);
});

function fakeEnv({ width = 4, height = 3, failOn = null } = {}) {
  const created = [];
  function createCanvas(w, h) {
    const canvas = { kind: "canvas", width: w, height: h, draws: [] };
    const context = {
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      clearRect() {
        canvas.draws.length = 0;
      },
      drawImage(source) {
        canvas.draws.push({
          source,
          alpha: this.globalAlpha,
          op: this.globalCompositeOperation,
        });
      },
    };
    return { canvas, context };
  }
  async function createImageBitmap(source) {
    if (failOn !== null && source.tag === failOn) throw new Error("decode failed");
    const bitmap = {
      kind: "bitmap",
      source,
      width: source.width ?? width,
      height: source.height ?? height,
      closed: 0,
      close() {
        this.closed += 1;
      },
    };
    created.push(bitmap);
    return bitmap;
  }
  return { createCanvas, createImageBitmap, created };
}

test("drawDocument paints visible layers back to front with alpha, blend and isolated groups", () => {
  let doc = threeLayers();
  doc = groupLayer(doc, { id: 2 });
  doc = setOpacity(doc, { id: 4, opacity: 50 });
  doc = setBlend(doc, { id: 4, blend: "multiply" });
  doc = setBlend(doc, { id: 2, blend: "screen" });
  doc = addLayer(doc, { afterId: 3, name: "Hidden", pixels: px("hidden") });
  doc = setVisibility(doc, { id: 5, visible: false });
  doc = addLayer(doc, { afterId: 5, name: "Clear", pixels: px("clear") });
  doc = setOpacity(doc, { id: 6, opacity: 0 });

  const env = fakeEnv();
  const root = env.createCanvas(4, 3);
  drawDocument(doc, root.context, env.createCanvas);

  assert.deepEqual(
    root.canvas.draws.map((draw) => [draw.source.kind ?? draw.source.tag, draw.alpha, draw.op]),
    [
      ["bg", 1, "source-over"],
      ["canvas", 0.5, "multiply"],
      ["top", 1, "source-over"],
    ]
  );
  const groupScratch = root.canvas.draws[1].source;
  assert.deepEqual(groupScratch.draws, [{ source: px("mid"), alpha: 1, op: "screen" }]);
  assert.equal(root.context.globalAlpha, 1);
  assert.equal(root.context.globalCompositeOperation, "source-over");
});

test("freezeDocument copies every layer and the composite into one closable document", async () => {
  const doc = groupLayer(threeLayers(), { id: 2 });
  const env = fakeEnv();
  const frozen = await freezeDocument(doc, env);

  assert.equal(Object.isFrozen(frozen), true);
  assert.deepEqual(ids(frozen.tree), ids(doc.tree));
  assert.equal(frozen.width, 4);
  assert.equal(frozen.nextId, doc.nextId);
  assert.equal(frozen.composite.kind, "bitmap");
  assert.equal(frozen.composite.source.kind, "canvas");
  assert.deepEqual(
    pixelLayers(frozen.tree).map((layer) => layer.pixels.source),
    [px("bg"), px("mid"), px("top")]
  );
  assert.equal(frozen.bytes, 4 * 4 * 3 * 4);
  assert.equal(JSON.stringify(frozen.layers).includes("pixels"), false);
  assert.deepEqual(frozen.layers.map((node) => node.id), [1, 4, 3]);
  assert.equal(env.created.length, 4);

  frozen.close();
  frozen.close();
  assert.deepEqual(env.created.map((bitmap) => bitmap.closed), [1, 1, 1, 1]);

  const again = await freezeDocument(frozen, env);
  assert.equal(again.bytes, frozen.bytes);
  assert.notEqual(again.composite, frozen.composite);
  assert.equal(pixelLayers(again.tree)[0].pixels.source, pixelLayers(frozen.tree)[0].pixels);
});

test("paintLayer keeps an omitted float buffer and can clear it", () => {
  const buffer = new Float32Array([0.25, 0.5, 0.75, 1]);
  const doc = paintLayer(threeLayers(), { id: 1, pixels: px("edited"), buffer });
  const painted = paintLayer(doc, { id: 1, pixels: px("again") });
  assert.equal(pixelLayers(painted.tree)[0].buffer, buffer);
  const cleared = paintLayer(doc, { id: 1, pixels: px("cleared"), buffer: null });
  assert.equal(pixelLayers(cleared.tree)[0].buffer, null);
});

test("freezeDocument counts a new float buffer once", async () => {
  const buffer = new Float32Array(8);
  const doc = paintLayer(threeLayers(), { id: 1, pixels: px("bg"), buffer });
  const env = fakeEnv();
  const frozen = await freezeDocument(doc, env);
  assert.equal(frozen.bytes, 4 * 4 * 3 * 4 + buffer.byteLength);
  assert.equal(frozen.profile, null);
  assert.equal(frozen.profileKnown, true);

  const again = await freezeDocument(frozen, env, frozen);
  assert.equal(again.bytes, 4 * 4 * 3 * 4);
  assert.equal(pixelLayers(again.tree)[0].buffer, buffer);
});

test("freezeDocument closes what it created when a copy fails or has the wrong size", async () => {
  const doc = threeLayers();
  const failing = fakeEnv({ failOn: "mid" });
  await assert.rejects(freezeDocument(doc, failing), /decode failed/);
  assert.equal(failing.created.length, 3);
  assert.deepEqual(failing.created.map((bitmap) => bitmap.closed), [1, 1, 1]);

  const wrongSize = fakeEnv();
  const skewed = paintLayer(doc, { id: 2, pixels: { tag: "odd", width: 9, height: 9 } });
  await assert.rejects(freezeDocument(skewed, wrongSize), /9 × 9, expected 4 × 3/);
  assert.deepEqual(wrongSize.created.map((bitmap) => bitmap.closed), [1, 1, 1, 1]);

  const huge = { ...doc, width: 10_001, height: 5_000 };
  const untouched = fakeEnv();
  await assert.rejects(freezeDocument(huge, untouched), invalid("megapixel"));
  assert.equal(untouched.created.length, 0);
});
