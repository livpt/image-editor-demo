import assert from "node:assert/strict";
import test from "node:test";

import { HistoryStore } from "../history-store.js";

function snapshot(id) {
  return {
    id,
    closed: false,
    close() {
      this.closed = true;
    },
  };
}

test("caps past snapshots and closes the oldest resource", () => {
  const history = new HistoryStore(2);
  const states = [snapshot(0), snapshot(1), snapshot(2), snapshot(3)];

  history.reset(states[0]);
  history.add(states[1]);
  history.add(states[2]);
  history.add(states[3]);

  assert.deepEqual(history.size, { past: 2, present: 1, future: 0 });
  assert.equal(states[0].closed, true);
  assert.equal(history.present.id, 3);
});

test("undo, redo, and a branched edit manage resources", () => {
  const history = new HistoryStore();
  const first = snapshot("first");
  const second = snapshot("second");
  const third = snapshot("third");
  const branch = snapshot("branch");

  history.reset(first);
  history.add(second);
  history.add(third);
  assert.equal(history.undo().id, "second");
  assert.equal(history.undo().id, "first");
  assert.equal(history.redo().id, "second");

  history.add(branch);
  assert.equal(third.closed, true);
  assert.equal(history.canRedo, false);
  assert.equal(history.present, branch);
});

test("reset and dispose close all replaced snapshots", () => {
  const history = new HistoryStore();
  const first = snapshot("first");
  const second = snapshot("second");
  const replacement = snapshot("replacement");

  history.reset(first);
  history.add(second);
  history.undo();
  history.reset(replacement);

  assert.equal(first.closed, true);
  assert.equal(second.closed, true);
  assert.deepEqual(history.size, { past: 0, present: 1, future: 0 });

  history.dispose();
  assert.equal(replacement.closed, true);
  assert.deepEqual(history.size, { past: 0, present: 0, future: 0 });
});

test("unavailable undo and redo are safe no-ops", () => {
  const history = new HistoryStore();
  history.reset(snapshot("only"));
  assert.equal(history.undo(), null);
  assert.equal(history.redo(), null);
});
