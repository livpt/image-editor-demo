import assert from "node:assert/strict";
import test from "node:test";

import { HistoryStore } from "../history-store.js";

function entry(id, width = 1, height = 1) {
  return {
    name: "test.edit",
    label: String(id),
    params: { id },
    snapshot: {
      id,
      width,
      height,
      bytes: width * height * 4,
      closed: false,
      close() {
        this.closed = true;
      },
    },
  };
}

test("snapshots without bytes or close are rejected instead of leaking", () => {
  const noBytes = new HistoryStore();
  noBytes.reset(entry("a"));
  noBytes.add({ name: "x", label: "x", params: {}, snapshot: { close() {} } });
  assert.throws(() => noBytes.add(entry("c")), TypeError);
  assert.throws(() => noBytes.bytes, TypeError);

  const noClose = new HistoryStore();
  noClose.reset(entry("a"));
  noClose.add({ name: "x", label: "x", params: {}, snapshot: { bytes: 4 } });
  assert.throws(() => noClose.reset(entry("b")), TypeError);
});

test("caps past snapshots and closes the oldest resource", () => {
  const history = new HistoryStore(2);
  const states = [entry(0), entry(1), entry(2), entry(3)];

  history.reset(states[0]);
  history.add(states[1]);
  history.add(states[2]);
  history.add(states[3]);

  assert.deepEqual(history.size, { past: 2, present: 1, future: 0 });
  assert.equal(states[0].snapshot.closed, true);
  assert.equal(history.present.snapshot.id, 3);
  assert.equal(history.entries().present.label, "3");
});

test("undo, redo, and a branched edit manage resources", () => {
  const history = new HistoryStore();
  const first = entry("first");
  const second = entry("second");
  const third = entry("third");
  const branch = entry("branch");

  history.reset(first);
  history.add(second);
  history.add(third);

  const undoneThird = history.undo();
  assert.equal(undoneThird.present, history.present);
  assert.equal(undoneThird.present.snapshot.id, "second");
  assert.equal(undoneThird.undone.snapshot.id, "third");

  const undoneSecond = history.undo();
  assert.equal(undoneSecond.present.snapshot.id, "first");
  assert.equal(undoneSecond.undone, second);

  const redone = history.redo();
  assert.equal(redone.present, history.present);
  assert.equal(redone.redone.snapshot.id, "second");

  history.add(branch);
  assert.equal(third.snapshot.closed, true);
  assert.equal(history.canRedo, false);
  assert.equal(history.present, branch);
});

test("reset and dispose close all replaced snapshots", () => {
  const history = new HistoryStore();
  const first = entry("first");
  const second = entry("second");
  const replacement = entry("replacement");

  history.reset(first);
  history.add(second);
  history.undo();
  history.reset(replacement);

  assert.equal(first.snapshot.closed, true);
  assert.equal(second.snapshot.closed, true);
  assert.deepEqual(history.size, { past: 0, present: 1, future: 0 });

  history.dispose();
  assert.equal(replacement.snapshot.closed, true);
  assert.deepEqual(history.size, { past: 0, present: 0, future: 0 });
});

test("unavailable undo and redo are safe no-ops", () => {
  const history = new HistoryStore();
  history.reset(entry("only"));
  assert.equal(history.undo(), null);
  assert.equal(history.redo(), null);
});

test("byte cap evicts past snapshots and keeps the present", () => {
  const history = new HistoryStore({ limit: 20, maxBytes: 16 });
  const states = [entry("a", 2, 2), entry("b", 2, 2), entry("c", 2, 2)];

  history.reset(states[0]);
  history.add(states[1]);
  history.add(states[2]);

  assert.equal(states[0].snapshot.closed, true);
  assert.equal(states[1].snapshot.closed, false);
  assert.equal(states[2].snapshot.closed, false);
  assert.equal(history.present, states[2]);
  assert.equal(history.bytes, 16);
  assert.deepEqual(
    history.entries().past.map((item) => item.label),
    ["b"]
  );
});

test("an oversized present stays until a later edit pushes it into the past", () => {
  const history = new HistoryStore({ limit: 20, maxBytes: 8 });
  const huge = entry("huge", 4, 4);
  const next = entry("next", 1, 1);

  history.reset(huge);
  assert.equal(huge.snapshot.closed, false);
  assert.equal(history.bytes, 0);

  history.add(next);
  assert.equal(huge.snapshot.closed, true);
  assert.equal(history.past.length, 0);
  assert.equal(history.present, next);
  assert.equal(history.bytes, 0);
});

test("entries omit snapshots and are frozen", () => {
  const history = new HistoryStore();
  const only = entry("only", 3, 3);
  history.reset(only);
  history.add(entry("next", 3, 3));

  const view = history.entries();
  assert.equal(view.present.name, "test.edit");
  assert.equal(Object.hasOwn(view.present, "snapshot"), false);
  assert.equal(view.past[0].params.id, "only");
  assert.equal(history.bytes, 3 * 3 * 4);
  assert.throws(() => {
    view.past.push({});
  });
  assert.throws(() => {
    view.present.label = "changed";
  });
});
