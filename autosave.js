// Day 1 stores one full project blob. Per-layer incremental autosave is a follow-up:
// every commit copies bitmaps, so there is no cheap change detection yet.

const DB_NAME = "image-editor";
const DB_STORE = "recovery";
const RECORD_KEY = "current";
const LOCK_NAME = "image-editor-recovery";
const DEFAULT_DEBOUNCE_MS = 5000;
const DEFAULT_MAX_WAIT_MS = 30000;

export function createMemoryAdapter(map = new Map()) {
  return {
    async read() {
      return map.has(RECORD_KEY) ? map.get(RECORD_KEY) : null;
    },
    async write(record) {
      map.set(RECORD_KEY, record);
    },
    async clear() {
      map.delete(RECORD_KEY);
    },
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createIndexedDbAdapter() {
  let database = null;
  async function db() {
    if (!database) database = await openDatabase();
    return database;
  }
  function store(mode) {
    return db().then((opened) => opened.transaction(DB_STORE, mode).objectStore(DB_STORE));
  }
  return {
    async read() {
      const value = await requestToPromise((await store("readonly")).get(RECORD_KEY));
      return value ?? null;
    },
    async write(record) {
      await requestToPromise((await store("readwrite")).put(record, RECORD_KEY));
    },
    async clear() {
      await requestToPromise((await store("readwrite")).delete(RECORD_KEY));
    },
  };
}

export function createAutosave(options = {}) {
  const adapter = options.adapter ?? createIndexedDbAdapter();
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const locks = options.locks === undefined ? globalThis.navigator?.locks : options.locks;
  const storage = options.storage === undefined ? globalThis.navigator?.storage : options.storage;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((id) => clearTimeout(id));

  let held = false;
  let releaseLock = () => {};
  let paused = false;
  let pending = null;
  let debounceTimer = null;
  let maxTimer = null;

  function clearTimers() {
    if (debounceTimer !== null) {
      clearTimer(debounceTimer);
      debounceTimer = null;
    }
    if (maxTimer !== null) {
      clearTimer(maxTimer);
      maxTimer = null;
    }
  }

  function requestLock() {
    if (held) return Promise.resolve(true);
    if (!locks?.request) {
      held = true;
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      Promise.resolve(
        locks.request(LOCK_NAME, { ifAvailable: true }, (lock) => {
          if (!lock) {
            finish(false);
            return undefined;
          }
          held = true;
          finish(true);
          return new Promise((release) => {
            releaseLock = () => {
              held = false;
              release();
            };
          });
        })
      ).catch(() => finish(false));
    });
  }

  async function acquireWriter() {
    if (await requestLock()) return true;
    // A reloading document can still hold the lock for a moment. One retry
    // distinguishes that from another live tab.
    await new Promise((resolve) => setTimeout(resolve, 50));
    return requestLock();
  }

  async function requestPersistence() {
    if (typeof storage?.persist !== "function") return false;
    try {
      return Boolean(await storage.persist());
    } catch {
      return false;
    }
  }

  function schedule(task) {
    if (!held || paused || typeof task !== "function") return false;
    pending = task;
    if (debounceTimer !== null) clearTimer(debounceTimer);
    debounceTimer = setTimer(() => {
      debounceTimer = null;
      return flush();
    }, debounceMs);
    if (maxTimer === null) {
      maxTimer = setTimer(() => {
        maxTimer = null;
        return flush();
      }, maxWaitMs);
    }
    return true;
  }

  function flush() {
    clearTimers();
    const task = pending;
    pending = null;
    if (!task || !held || paused) return Promise.resolve(false);
    return Promise.resolve()
      .then(task)
      .then(
        () => true,
        (error) => {
          if (error?.name === "QuotaExceededError") {
            paused = true;
            options.onQuotaExceeded?.(error);
            return false;
          }
          options.onError?.(error);
          return false;
        }
      );
  }

  return Object.freeze({
    read() {
      return adapter.read();
    },
    write(blob, meta = {}) {
      return adapter.write({ blob, ...meta });
    },
    clear() {
      return adapter.clear();
    },
    acquireWriter,
    requestPersistence,
    schedule,
    flush,
    release() {
      releaseLock();
    },
    get paused() {
      return paused;
    },
  });
}
