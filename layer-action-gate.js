// A layer-button click blurs the rename field first. Starting the rename there
// makes the canvas busy before the click, and the button command is rejected.
// Hold the commit across that blur so the click can rename, then run.

export function createLayerActionGate() {
  let commit = null;
  let inflight = null;
  let hold = false;

  function begin() {
    if (inflight) return inflight;
    if (!commit) return Promise.resolve(null);
    const run = commit;
    commit = null;
    hold = false;
    inflight = new Promise((resolve) => resolve(run())).finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return {
    open(commitRename) {
      commit = commitRename;
      inflight = null;
      hold = false;
    },

    holdForButton() {
      if (commit || inflight) hold = true;
    },

    blur() {
      if (hold) return null;
      return begin();
    },

    flush() {
      hold = false;
      return begin();
    },

    activate(action) {
      hold = false;
      return begin().then((result) => action(result));
    },
  };
}
