function closeSnapshot(snapshot) {
  snapshot?.close?.();
}

function closeSnapshots(snapshots) {
  for (const snapshot of snapshots) closeSnapshot(snapshot);
}

export class HistoryStore {
  constructor(limit = 20) {
    this.limit = limit;
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

  add(snapshot) {
    if (this.present) this.past.push(this.present);
    this.present = snapshot;
    closeSnapshots(this.future);
    this.future = [];

    while (this.past.length > this.limit) {
      closeSnapshot(this.past.shift());
    }
  }

  reset(snapshot) {
    this.dispose();
    this.present = snapshot;
  }

  undo() {
    if (!this.canUndo) return null;
    this.future.unshift(this.present);
    this.present = this.past.pop();
    return this.present;
  }

  redo() {
    if (!this.canRedo) return null;
    this.past.push(this.present);
    this.present = this.future.shift();
    return this.present;
  }

  dispose() {
    closeSnapshots(this.past);
    closeSnapshot(this.present);
    closeSnapshots(this.future);
    this.past = [];
    this.present = null;
    this.future = [];
  }
}
