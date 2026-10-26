// Read-only snapshot of the editor's observable state, for before/after proof.
//
// Paste as the `expression` of browser_cdp Runtime.evaluate with
// { returnByValue: true }. Edit the sample points on the last line to probe the
// pixels you care about (intrinsic canvas coordinates). The pixel read goes
// through getImageData on the committed canvas, so it reflects what Save would
// export, not the in-progress overlay.
//
// `layers` lists the panel rows top to bottom (front of the stack first) as the
// user sees them: name, kind, nesting depth, eye state, and which row is
// selected. It is read from the DOM, not from window.app.
((samples) => {
  const canvas = document.getElementById("imageProcessed");
  const status = document.getElementById("appStatus");
  const undo = document.getElementById("undoButton");
  const redo = document.getElementById("redoButton");
  const context = canvas.getContext("2d");
  const pixels = {};
  for (const [x, y] of samples) {
    const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;
    pixels[`${x},${y}`] = { r, g, b, a };
  }
  const layers = [...document.querySelectorAll("#layersList .layer-row")].map((row) => {
    const renameInput = row.querySelector(".layer-rename");
    return {
      id: Number(row.dataset.id),
      kind: row.dataset.kind,
      name: renameInput ? renameInput.value : row.querySelector(".layer-name")?.textContent ?? "",
      depth: Number(row.style.getPropertyValue("--depth")) || 0,
      visible: row.querySelector(".layer-eye")?.getAttribute("aria-pressed") === "true",
      active: row.closest(".layer-item")?.getAttribute("aria-selected") === "true",
      renaming: renameInput !== null,
    };
  });
  return {
    status: status.textContent,
    statusError: status.dataset.error,
    controlsEnabled: !document.getElementById("controls").disabled,
    canvasVisible: !document.getElementById("canvasStack").hidden,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    canUndo: !undo.disabled,
    canRedo: !redo.disabled,
    resizeDialogOpen: document.getElementById("resolutionDialog").open,
    layersEnabled: !document.getElementById("layersControls").disabled,
    layers,
    activeLayer: layers.find((layer) => layer.active)?.name ?? null,
    layerOpacity: Number(document.getElementById("layerOpacity").value),
    layerBlend: document.getElementById("layerBlend").value,
    exportDialogOpen: document.getElementById("exportDialog").open,
    restoreDialogOpen: document.getElementById("restoreDialog").open,
    history: [...document.querySelectorAll("#historyList .history-step")].map((button) => ({
      index: Number(button.dataset.index),
      label: button.textContent,
      current: button.getAttribute("aria-current") === "step",
      future: button.dataset.future === "true",
    })),
    pixels,
  };
})([[10, 10], [400, 300]]);
