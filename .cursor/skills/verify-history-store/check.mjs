#!/usr/bin/env node
/**
 * Exhaustive invariant check for HistoryStore (history-store.js).
 *
 * Runs the real module through every action sequence up to a bound and
 * asserts resource and stack invariants after each step. Exit 0 = pass.
 * On failure prints a shortest counterexample in the store's own words.
 *
 * Usage:
 *   node .cursor/skills/verify-history-store/check.mjs
 *   node .cursor/skills/verify-history-store/check.mjs --depth 6 --limit 2
 *   node .cursor/skills/verify-history-store/check.mjs --break no-evict-close
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../..");
const MODULE_PATH = path.join(REPO_ROOT, "history-store.js");

const BREAKS = {
  "no-evict-close": {
    harm: "Evicted past snapshots are never closed, so ImageBitmaps leak when the cap fires.",
    patch(HistoryStore) {
      const original = HistoryStore.prototype.add;
      HistoryStore.prototype.add = function add(entry) {
        if (this.present) this.past.push(this.present);
        this.present = entry;
        for (const item of this.future) item?.snapshot?.close?.();
        this.future = [];
        while (this.past.length > this.limit) {
          this.past.shift();
        }
      };
      return () => {
        HistoryStore.prototype.add = original;
      };
    },
  },
  "no-branch-clear": {
    harm: "A new edit after undo keeps the redo branch, so Redo can restore a discarded future.",
    patch(HistoryStore) {
      const original = HistoryStore.prototype.add;
      HistoryStore.prototype.add = function add(entry) {
        if (this.present) this.past.push(this.present);
        this.present = entry;
        while (this.past.length > this.limit) {
          const oldest = this.past.shift();
          oldest?.snapshot?.close?.();
        }
      };
      return () => {
        HistoryStore.prototype.add = original;
      };
    },
  },
};

function parseArgs(argv) {
  const opts = { depth: 5, limit: 2, break: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--depth") opts.depth = Number(argv[++i]);
    else if (arg === "--limit") opts.limit = Number(argv[++i]);
    else if (arg === "--break") opts.break = argv[++i];
    else if (arg === "--help") {
      console.log(`Usage: node check.mjs [--depth N] [--limit N] [--break ${Object.keys(BREAKS).join("|")}]`);
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(opts.depth) || opts.depth < 1) throw new Error("--depth must be a positive integer");
  if (!Number.isInteger(opts.limit) || opts.limit < 1) throw new Error("--limit must be a positive integer");
  if (opts.break && !BREAKS[opts.break]) throw new Error(`Unknown --break; choose ${Object.keys(BREAKS).join(", ")}`);
  return opts;
}

function makeEntry(id) {
  const snapshot = {
    id,
    width: 2,
    height: 2,
    closed: false,
    closeCount: 0,
    close() {
      this.closed = true;
      this.closeCount += 1;
    },
  };
  return {
    name: "edit.step",
    label: String(id),
    params: { id },
    snapshot,
  };
}

function snapshotBytes(snapshot) {
  return (snapshot.width || 0) * (snapshot.height || 0) * 4;
}

function living(history) {
  return [...history.past, history.present, ...history.future]
    .filter(Boolean)
    .map((entry) => entry.snapshot);
}

function checkInvariants(history, allSnapshots, stepLabel) {
  const errors = [];
  const size = history.size;

  if (history.past.length > history.limit) {
    errors.push(`past.length ${history.past.length} exceeds limit ${history.limit}`);
  }
  if (size.past !== history.past.length) errors.push(`size.past mismatch`);
  if (size.future !== history.future.length) errors.push(`size.future mismatch`);
  if (size.present !== (history.present ? 1 : 0)) errors.push(`size.present mismatch`);
  if (history.canUndo !== history.past.length > 0) errors.push(`canUndo mismatch`);
  if (history.canRedo !== history.future.length > 0) errors.push(`canRedo mismatch`);

  let expectedBytes = 0;
  for (const entry of history.past) expectedBytes += snapshotBytes(entry.snapshot);
  for (const entry of history.future) expectedBytes += snapshotBytes(entry.snapshot);
  if (history.bytes !== expectedBytes) {
    errors.push(`bytes ${history.bytes} != past+future ${expectedBytes}`);
  }
  const pastBytes = history.past.reduce(
    (sum, entry) => sum + snapshotBytes(entry.snapshot),
    0
  );
  if (pastBytes > history.maxBytes) {
    errors.push(`past bytes ${pastBytes} exceed maxBytes ${history.maxBytes}`);
  }

  const live = living(history);
  const liveIds = new Set(live.map((s) => s.id));
  if (liveIds.size !== live.length) errors.push(`duplicate snapshot in past/present/future`);

  for (const snap of live) {
    if (snap.closed) errors.push(`live snapshot ${snap.id} is closed`);
  }

  for (const snap of allSnapshots) {
    if (!liveIds.has(snap.id) && !snap.closed) {
      errors.push(`released snapshot ${snap.id} was never closed`);
    }
    if (snap.closeCount > 1) {
      errors.push(`snapshot ${snap.id} closed ${snap.closeCount} times`);
    }
  }

  if (errors.length) {
    const err = new Error(`${stepLabel}: ${errors.join("; ")}`);
    err.details = { size, live: [...liveIds], closed: allSnapshots.filter((s) => s.closed).map((s) => s.id) };
    throw err;
  }
}

function actionsFor(history, nextId) {
  const actions = [];
  actions.push({
    name: `add(${nextId})`,
    run(ctx) {
      const entry = makeEntry(nextId);
      ctx.all.push(entry.snapshot);
      history.add(entry);
      // Postcondition of add: the redo branch is discarded.
      if (history.future.length !== 0) {
        const err = new Error(`add(${nextId}): future still has ${history.future.length} entries after add`);
        err.details = { size: history.size };
        throw err;
      }
    },
  });
  actions.push({
    name: `reset(${nextId})`,
    run(ctx) {
      const entry = makeEntry(nextId);
      ctx.all.push(entry.snapshot);
      history.reset(entry);
      if (history.past.length || history.future.length) {
        const err = new Error(`reset(${nextId}): past/future not empty after reset`);
        err.details = { size: history.size };
        throw err;
      }
    },
  });
  if (history.canUndo) {
    actions.push({
      name: "undo",
      run() {
        const before = history.present;
        const result = history.undo();
        if (!result || result.present !== history.present || result.undone !== before) {
          throw new Error("undo: result does not report the new present and the undone entry");
        }
        if (history.future[0] !== before) {
          throw new Error("undo: previous present was not pushed to future");
        }
      },
    });
  }
  if (history.canRedo) {
    actions.push({
      name: "redo",
      run() {
        const before = history.present;
        const next = history.future[0];
        const result = history.redo();
        if (!result || result.present !== history.present || result.redone !== next) {
          throw new Error("redo: result does not report the new present and the redone entry");
        }
        if (history.past[history.past.length - 1] !== before) {
          throw new Error("redo: previous present was not pushed to past");
        }
      },
    });
  }
  actions.push({
    name: "dispose",
    run() {
      history.dispose();
      if (history.present !== null || history.past.length || history.future.length) {
        throw new Error("dispose: store not empty");
      }
    },
  });
  return actions;
}

function explore(HistoryStore, { depth, limit }) {
  let checked = 0;
  let nextId = 0;

  function dfs(history, remaining, path, all) {
    checkInvariants(history, all, path.join(" → ") || "(start)");
    checked += 1;
    if (remaining === 0) return;

    const id = nextId++;
    for (const action of actionsFor(history, id)) {
      // Clone by replaying is expensive; instead mutate and backtrack via deep copy of arrays + snapshot refs.
      const past = history.past.slice();
      const future = history.future.slice();
      const present = history.present;
      const allLen = all.length;
      const closedMarks = all.map((s) => ({ closed: s.closed, closeCount: s.closeCount }));

      try {
        path.push(action.name);
        try {
          action.run({ all });
          dfs(history, remaining - 1, path, all);
        } catch (error) {
          const prefix = path.join(" → ");
          if (!String(error.message).startsWith(prefix)) {
            error.message = `${prefix}: ${error.message}`;
          }
          throw error;
        }
      } finally {
        path.pop();
        history.past = past;
        history.future = future;
        history.present = present;
        all.length = allLen;
        for (let i = 0; i < closedMarks.length; i++) {
          all[i].closed = closedMarks[i].closed;
          all[i].closeCount = closedMarks[i].closeCount;
        }
      }
    }
    nextId--;
  }

  const history = new HistoryStore(limit);
  const all = [];
  dfs(history, depth, [], all);

  const seeded = new HistoryStore(limit);
  const seed = makeEntry("seed");
  const seededAll = [seed.snapshot];
  seeded.reset(seed);
  dfs(seeded, depth, ["reset(seed)"], seededAll);

  return checked;
}

function checkByteCap(HistoryStore) {
  function sized(id, width, height) {
    return {
      name: "edit.step",
      label: String(id),
      params: {},
      snapshot: {
        id,
        width,
        height,
        closed: false,
        close() {
          this.closed = true;
        },
      },
    };
  }

  const store = new HistoryStore({ limit: 20, maxBytes: 16 });
  const frames = [sized("a", 2, 2), sized("b", 2, 2), sized("c", 2, 2)];
  store.reset(frames[0]);
  store.add(frames[1]);
  store.add(frames[2]);
  if (!frames[0].snapshot.closed) {
    throw new Error("byte cap did not close the oldest past snapshot");
  }
  if (frames[2].snapshot.closed) {
    throw new Error("byte cap closed the present snapshot");
  }
  if (store.past.length !== 1 || store.bytes !== 16) {
    throw new Error(`byte cap left past ${store.past.length} and bytes ${store.bytes}`);
  }

  const hugeStore = new HistoryStore({ limit: 20, maxBytes: 8 });
  const huge = sized("huge", 4, 4);
  hugeStore.reset(huge);
  if (huge.snapshot.closed || hugeStore.bytes !== 0) {
    throw new Error("byte cap evicted the present snapshot");
  }
}

async function loadHistoryStore() {
  const mod = await import(pathToFileURL(MODULE_PATH).href + `?t=${Date.now()}`);
  return mod.HistoryStore;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const HistoryStore = await loadHistoryStore();
  let restore = null;
  if (opts.break) {
    restore = BREAKS[opts.break].patch(HistoryStore);
    console.error(`Injected break: ${opts.break}`);
    console.error(`Harm: ${BREAKS[opts.break].harm}`);
  }

  try {
    const checked = explore(HistoryStore, opts);
    if (!opts.break) checkByteCap(HistoryStore);
    if (opts.break) {
      console.error(`FAIL expected: break ${opts.break} was not caught within depth ${opts.depth}`);
      process.exit(2);
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          module: "history-store.js",
          class: "HistoryStore",
          depth: opts.depth,
          limit: opts.limit,
          statesChecked: checked,
          syncCommit: "c084ee969f53eb2bdb64e6df88dfca12a4ecf00c",
        },
        null,
        2
      )
    );
  } catch (error) {
    const pathMatch = String(error.message);
    console.error("INVARIANT VIOLATION");
    console.error(pathMatch);
    if (error.details) console.error(JSON.stringify(error.details, null, 2));
    if (opts.break) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            caughtBreak: opts.break,
            harm: BREAKS[opts.break].harm,
            counterexample: pathMatch,
          },
          null,
          2
        )
      );
      process.exit(0); // intentional catch of injected break
    }
    process.exit(1);
  } finally {
    restore?.();
  }
}

main();
