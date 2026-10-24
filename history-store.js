function bytesOf(snapshot) {
  if (typeof snapshot?.bytes !== "number") {
    throw new TypeError("A history snapshot must report its bytes.");
  }
  return snapshot.bytes;
}

function closeEntry(entry) {
  if (!entry) return;
  if (typeof entry.snapshot?.close !== "function") {
    throw new TypeError("A history snapshot must be closable.");
  }
  entry.snapshot.close();
}

function closeEntries(entries) {
  for (const entry of entries) closeEntry(entry);
}

function publicEntry(entry) {
  if (!entry) return null;
  return Object.freeze({
    name: entry.name,
    label: entry.label,
    params: entry.params,
  });
}

export class HistoryStore {
  constructor(limitOrOptions = 20) {
    if (typeof limitOrOptions === "number") {
      this.limit = limitOrOptions;
      this.maxBytes = Infinity;
    } else {
      const options = limitOrOptions ?? {};
      this.limit = options.limit ?? 20;
      this.maxBytes = options.maxBytes ?? Infinity;
    }
    this.past = [];
    this.present = null;
    this.future = [];
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  get size() {
    return {
      past: this.past.length,
      present: this.present ? 1 : 0,
      future: this.future.length,
    };
  }

  get bytes() {
    let total = 0;
    for (const entry of this.past) total += bytesOf(entry.snapshot);
    return total;
  }

  entries() {
    return Object.freeze({
      past: Object.freeze(this.past.map(publicEntry)),
      present: publicEntry(this.present),
      future: Object.freeze(this.future.map(publicEntry)),
    });
  }

  add(entry) {
    if (this.present) this.past.push(this.present);
    this.present = entry;
    closeEntries(this.future);
    this.future = [];

    while (
      this.past.length > this.limit ||
      (this.past.length > 0 && this.bytes > this.maxBytes)
    ) {
      closeEntry(this.past.shift());
    }
  }

  reset(entry) {
    this.dispose();
    this.present = entry;
  }

  undo() {
    if (!this.canUndo) return null;
    const undone = this.present;
    this.future.unshift(undone);
    this.present = this.past.pop();
    return { present: this.present, undone };
  }

  redo() {
    if (!this.canRedo) return null;
    const redone = this.future.shift();
    this.past.push(this.present);
    this.present = redone;
    return { present: this.present, redone };
  }

  dispose() {
    closeEntries(this.past);
    closeEntry(this.present);
    closeEntries(this.future);
    this.past = [];
    this.present = null;
    this.future = [];
  }
}
