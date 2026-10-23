// Read-only snapshot of the editor's observable state, for before/after proof.
//
// Paste as the `expression` of browser_cdp Runtime.evaluate with
// { returnByValue: true }. Edit the sample points on the last line to probe the
// pixels you care about (intrinsic canvas coordinates). The pixel read goes
// through getImageData on the committed canvas, so it reflects what Save would
// export, not the in-progress overlay.
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
    pixels,
  };
})([[10, 10], [400, 300]]);
