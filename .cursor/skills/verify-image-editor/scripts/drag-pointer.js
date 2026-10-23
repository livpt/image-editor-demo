// Perform one pointer drag on the editing canvas (#imageOverlay), the gesture
// behind Pen, Line, Rectangle, Ellipse and Crop.
//
// Paste as the `expression` of browser_cdp Runtime.evaluate with
// { awaitPromise: true, returnByValue: true }. Edit the last line: `from` and
// `to` are intrinsic canvas pixels (not viewport), `steps` is how many
// pointermove events to spread over the drag (one per animation frame).
//
// Why this path: the overlay <canvas> has no accessibility ref, so browser_drag
// cannot target it, and CDP Input.* is denied. Dispatching PointerEvents on the
// overlay still goes through the app's own pointerdown/move/up handlers, pointer
// capture, frame scheduler and commit path. Select the tool first by clicking
// its button in the Draw menu or the Crop button.
(async (from, to, steps) => {
  const overlay = document.getElementById("imageOverlay");
  const base = document.getElementById("imageProcessed");
  const undoButton = document.getElementById("undoButton");
  const rect = overlay.getBoundingClientRect();
  const toClient = (p) => ({
    clientX: rect.left + (p.x * rect.width) / overlay.width,
    clientY: rect.top + (p.y * rect.height) / overlay.height,
  });
  const fire = (type, p) =>
    overlay.dispatchEvent(
      new PointerEvent(type, {
        ...toClient(p),
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: type === "pointermove" ? -1 : 0,
        buttons: type === "pointerup" ? 0 : 1,
        bubbles: true,
        cancelable: true,
      })
    );
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

  const sizeBefore = [base.width, base.height];
  const undoBefore = !undoButton.disabled;
  fire("pointerdown", from);
  for (let i = 1; i <= steps; i++) {
    fire("pointermove", {
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    });
    await frame();
  }
  fire("pointerup", to);

  // A commit flips Undo on (or, when already on, finishes within a few frames).
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline && !undoButton.disabled === undoBefore && !undoBefore) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await new Promise((resolve) => setTimeout(resolve, 150));

  return {
    status: document.getElementById("appStatus").textContent,
    canUndo: !undoButton.disabled,
    sizeBefore,
    sizeAfter: [base.width, base.height],
  };
})({ x: 100, y: 100 }, { x: 300, y: 250 }, 8);
