import assert from "node:assert/strict";
import test from "node:test";

import { createLayerActionGate } from "../layer-action-gate.js";

function busyRunner() {
  let busy = false;
  const calls = [];
  async function run(name) {
    if (busy) {
      calls.push(`reject ${name}`);
      throw new Error(`Cannot run ${name} while the canvas is busy.`);
    }
    busy = true;
    calls.push(`start ${name}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
    calls.push(`end ${name}`);
    busy = false;
    return name;
  }
  return { run, calls };
}

test("leaving a rename on a layer button commits the rename, then runs that button", async () => {
  const { run, calls } = busyRunner();
  const gate = createLayerActionGate();
  gate.open(() => run("layer.rename"));

  gate.holdForButton();
  assert.equal(gate.blur(), null);
  assert.deepEqual(calls, []);

  await gate.activate(() => run("layer.add"));
  assert.deepEqual(calls, [
    "start layer.rename",
    "end layer.rename",
    "start layer.add",
    "end layer.add",
  ]);
});

test("a click during an in-flight rename waits instead of being rejected as busy", async () => {
  const { run, calls } = busyRunner();
  const gate = createLayerActionGate();
  gate.open(() => run("layer.rename"));

  const committed = gate.blur();
  const clicked = gate.activate(() => run("layer.duplicate"));
  await Promise.all([committed, clicked]);

  assert.deepEqual(calls, [
    "start layer.rename",
    "end layer.rename",
    "start layer.duplicate",
    "end layer.duplicate",
  ]);
});

test("a button press that never clicks still commits the rename once", async () => {
  const { run, calls } = busyRunner();
  const gate = createLayerActionGate();
  gate.open(() => run("layer.rename"));

  gate.holdForButton();
  assert.equal(gate.blur(), null);
  await gate.flush();
  await gate.flush();

  assert.deepEqual(calls, ["start layer.rename", "end layer.rename"]);
});

test("flush after the button click does not run the command twice", async () => {
  const { run, calls } = busyRunner();
  const gate = createLayerActionGate();
  gate.open(() => run("layer.rename"));

  gate.holdForButton();
  assert.equal(gate.blur(), null);
  await Promise.all([gate.activate(() => run("layer.delete")), gate.flush()]);

  assert.deepEqual(calls, [
    "start layer.rename",
    "end layer.rename",
    "start layer.delete",
    "end layer.delete",
  ]);
});

test("a layer button with no open rename runs its command", async () => {
  const gate = createLayerActionGate();
  const calls = [];
  await gate.activate(() => {
    calls.push("layer.group");
  });
  assert.deepEqual(calls, ["layer.group"]);
});
