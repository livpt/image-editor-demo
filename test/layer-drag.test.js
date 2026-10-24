import assert from "node:assert/strict";
import test from "node:test";

import { attachLayerDrag } from "../layer-drag.js";

function createNode(parent = null, { tag = "div", className = "", id = "" } = {}) {
  const node = {
    parent,
    children: [],
    listeners: [],
    tag,
    className,
    dataset: { id },
    pointerCapture: null,
    classList: {
      classes: new Set(),
      add(name) {
        this.classes.add(name);
      },
      remove(name) {
        this.classes.delete(name);
      },
      contains(name) {
        return this.classes.has(name);
      },
    },
  };
  if (parent) parent.children.push(node);

  node.matches = (selector) => {
    if (selector.startsWith(".")) return node.className.split(/\s+/).includes(selector.slice(1));
    return node.tag === selector;
  };
  node.closest = (selector) => {
    const parts = selector.split(",").map((part) => part.trim());
    let current = node;
    while (current) {
      if (parts.some((part) => current.matches(part))) return current;
      current = current.parent;
    }
    return null;
  };
  node.contains = (other) => {
    let current = other;
    while (current) {
      if (current === node) return true;
      current = current.parent;
    }
    return false;
  };
  node.querySelectorAll = (selector) => {
    const found = [];
    const walk = (current) => {
      for (const child of current.children) {
        if (selector === "[data-drop]" && Object.hasOwn(child.dataset, "drop")) found.push(child);
        walk(child);
      }
    };
    walk(node);
    return found;
  };
  node.addEventListener = (type, fn, options) => {
    const capture = options === true || options?.capture === true;
    node.listeners.push({ type, fn, capture });
  };
  node.setPointerCapture = (pointerId) => {
    node.pointerCapture = pointerId;
  };
  node.releasePointerCapture = (pointerId) => {
    if (node.pointerCapture !== pointerId) throw new Error("no capture");
    node.pointerCapture = null;
    dispatch(node, { type: "lostpointercapture", pointerId, bubbles: true });
  };
  return node;
}

function dispatch(target, event) {
  event.target = target;
  const ancestors = [];
  let parent = target.parent;
  while (parent) {
    ancestors.push(parent);
    parent = parent.parent;
  }
  const invoke = (node, capture) => {
    for (const listener of [...node.listeners]) {
      if (listener.type === event.type && listener.capture === capture) listener.fn(event);
    }
  };
  for (const node of [...ancestors].reverse()) invoke(node, true);
  invoke(target, true);
  invoke(target, false);
  if (event.bubbles !== false) {
    for (const node of ancestors) invoke(node, false);
  }
}

function pointer(target, type, x, y, extra = {}) {
  const event = {
    type,
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    clientX: x,
    clientY: y,
    bubbles: true,
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
    ...extra,
  };
  dispatch(target, event);
  return event;
}

function setup({ busy = false } = {}) {
  const owner = createNode();
  const list = createNode(owner, { className: "layers-list" });
  const outside = createNode(owner);
  const row = createNode(list, { className: "layer-row", id: "2" });
  const other = createNode(list, { className: "layer-row", id: "1" });
  const calls = [];
  attachLayerDrag(list, {
    isBusy: () => busy,
    dropTargetAt: () => ({ row: other, id: 1, zone: "below" }),
    onActivate: (id) => calls.push({ type: "activate", id }),
    onDrop: (id, target) => calls.push({ type: "drop", id, zone: target.zone }),
    owner,
  });
  return { owner, list, outside, row, other, calls };
}

test("a press and release on a row selects that layer", () => {
  const { row, calls } = setup();
  pointer(row, "pointerdown", 0, 0);
  pointer(row, "pointerup", 1, 1);
  assert.deepEqual(calls, [{ type: "activate", id: 2 }]);
});

test("movement past the threshold reorders on release", () => {
  const { list, row, calls } = setup();
  pointer(row, "pointerdown", 0, 0);
  pointer(row, "pointermove", 3, 0);
  assert.equal(list.pointerCapture, null);
  assert.equal(list.classList.contains("dragging"), false);
  pointer(row, "pointermove", 8, 0);
  assert.equal(list.pointerCapture, 1);
  assert.equal(list.classList.contains("dragging"), true);
  pointer(row, "pointerup", 8, 0);
  assert.deepEqual(calls, [{ type: "drop", id: 2, zone: "below" }]);
  assert.equal(list.classList.contains("dragging"), false);
});

test("a release outside the list before the threshold does not reorder on a later move", () => {
  const { list, outside, row, calls } = setup();
  pointer(row, "pointerdown", 0, 0);
  pointer(outside, "pointerup", 1, 1);
  pointer(row, "pointermove", 40, 0);
  assert.equal(list.classList.contains("dragging"), false);
  pointer(row, "pointerup", 40, 0);
  assert.deepEqual(calls, []);
});

test("a cancel outside the list before the threshold does not reorder on a later move", () => {
  const { list, outside, row, calls } = setup();
  pointer(row, "pointerdown", 0, 0);
  pointer(outside, "pointercancel", 1, 0);
  pointer(row, "pointermove", 40, 0);
  assert.equal(list.classList.contains("dragging"), false);
  pointer(row, "pointerup", 40, 0);
  assert.deepEqual(calls, []);
});

test("a later press can still reorder after an outside release", () => {
  const { outside, row, calls } = setup();
  pointer(row, "pointerdown", 0, 0);
  pointer(outside, "pointerup", 0, 0);
  pointer(row, "pointerdown", 5, 5);
  pointer(row, "pointermove", 20, 5);
  pointer(row, "pointerup", 20, 5);
  assert.deepEqual(calls, [{ type: "drop", id: 2, zone: "below" }]);
});

test("a press on a row control does not select or reorder", () => {
  const { row, calls } = setup();
  const eye = createNode(row, { tag: "button" });
  pointer(eye, "pointerdown", 0, 0);
  pointer(eye, "pointerup", 0, 0);
  assert.deepEqual(calls, []);
});

test("a non-primary mouse button does not start a drag", () => {
  const { row, calls } = setup();
  pointer(row, "pointerdown", 0, 0, { button: 2 });
  pointer(row, "pointermove", 30, 0, { button: 2 });
  pointer(row, "pointerup", 30, 0, { button: 2 });
  assert.deepEqual(calls, []);
});

test("a press while the document is busy does not select or reorder", () => {
  const { row, calls } = setup({ busy: true });
  pointer(row, "pointerdown", 0, 0);
  pointer(row, "pointermove", 30, 0);
  pointer(row, "pointerup", 30, 0);
  assert.deepEqual(calls, []);
});

test("cancelling a press on the list does not select the row", () => {
  const { row, calls } = setup();
  pointer(row, "pointerdown", 0, 0);
  pointer(row, "pointercancel", 0, 0);
  assert.deepEqual(calls, []);
});
