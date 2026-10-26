import assert from "node:assert/strict";
import test from "node:test";

import { createAutosave, createMemoryAdapter } from "../autosave.js";

function clock() {
  let now = 0;
  const timers = [];
  return {
    setTimer(fn, ms) {
      const entry = { fn, at: now + ms };
      timers.push(entry);
      return entry;
    },
    clearTimer(entry) {
      entry.fn = null;
    },
    async advance(ms) {
      now += ms;
      const due = timers.filter((entry) => entry.fn && entry.at <= now);
      for (const entry of due) {
        const fn = entry.fn;
        entry.fn = null;
        await fn();
      }
    },
  };
}

function autosaveWith(adapter, time, extra = {}) {
  return createAutosave({
    adapter,
    locks: null,
    storage: extra.storage,
    setTimer: time.setTimer,
    clearTimer: time.clearTimer,
    onQuotaExceeded: extra.onQuotaExceeded,
  });
}

test("a memory adapter stores one recovery record", async () => {
  const map = new Map();
  const recovery = createAutosave({ adapter: createMemoryAdapter(map), locks: null, storage: null });
  assert.equal(await recovery.read(), null);
  await recovery.write(new Blob(["project"]), { savedAt: 10, width: 8, height: 6, label: "Pen" });
  const record = await recovery.read();
  assert.equal(record.width, 8);
  assert.equal(record.label, "Pen");
  assert.equal(await record.blob.text(), "project");
  await recovery.clear();
  assert.equal(await recovery.read(), null);
  assert.equal(map.size, 0);
});

test("saves follow a trailing debounce unless the max wait arrives first", async () => {
  const time = clock();
  const writes = [];
  const adapter = {
    async read() {
      return null;
    },
    async write(record) {
      writes.push(record.label);
    },
    async clear() {},
  };
  const recovery = autosaveWith(adapter, time);
  assert.equal(await recovery.acquireWriter(), true);

  recovery.schedule(async () => {
    await recovery.write(new Blob(["a"]), { label: "first" });
  });
  await time.advance(4999);
  assert.deepEqual(writes, []);
  await time.advance(1);
  assert.deepEqual(writes, ["first"]);

  recovery.schedule(async () => {
    await recovery.write(new Blob(["b"]), { label: "latest" });
  });
  for (let elapsed = 4000; elapsed < 30000; elapsed += 4000) {
    await time.advance(4000);
    assert.equal(writes.length, 1);
    recovery.schedule(async () => {
      await recovery.write(new Blob(["b"]), { label: "latest" });
    });
  }
  await time.advance(2000);
  assert.deepEqual(writes, ["first", "latest"]);
});

test("a refused writer lock does not schedule a save", async () => {
  const recovery = createAutosave({
    adapter: createMemoryAdapter(),
    locks: {
      request(name, options, callback) {
        assert.equal(name, "image-editor-recovery");
        assert.equal(options.ifAvailable, true);
        callback(null);
      },
    },
  });
  assert.equal(await recovery.acquireWriter(), false);
  assert.equal(
    recovery.schedule(() => {
      throw new Error("must not save");
    }),
    false
  );
});

test("a full store pauses autosave", async () => {
  const time = clock();
  const notes = [];
  const adapter = {
    async read() {
      return null;
    },
    async write() {
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    },
    async clear() {},
  };
  const recovery = autosaveWith(adapter, time, {
    onQuotaExceeded() {
      notes.push("paused");
    },
  });
  await recovery.acquireWriter();
  recovery.schedule(() => recovery.write(new Blob(["big"]), { label: "Pen" }));
  await time.advance(5000);
  assert.equal(recovery.paused, true);
  assert.deepEqual(notes, ["paused"]);
  assert.equal(recovery.schedule(() => {}), false);
});

test("requestPersistence asks the browser to keep the store", async () => {
  let asked = 0;
  const recovery = createAutosave({
    adapter: createMemoryAdapter(),
    locks: null,
    storage: {
      async persist() {
        asked += 1;
        return true;
      },
    },
  });
  assert.equal(await recovery.requestPersistence(), true);
  assert.equal(asked, 1);
  const silent = createAutosave({ adapter: createMemoryAdapter(), locks: null, storage: null });
  assert.equal(await silent.requestPersistence(), false);
});
