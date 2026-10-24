const DRAG_THRESHOLD = 4;

export function attachLayerDrag(
  list,
  { isBusy, dropTargetAt, onActivate, onDrop, threshold = DRAG_THRESHOLD, owner = globalThis }
) {
  let drag = null;

  function clearDropMarks() {
    for (const marked of list.querySelectorAll("[data-drop]")) delete marked.dataset.drop;
  }

  function endDrag() {
    if (!drag) return;
    if (drag.captured) {
      try {
        list.releasePointerCapture(drag.pointerId);
      } catch {
        // Capture may already be released.
      }
    }
    list.classList.remove("dragging");
    clearDropMarks();
    drag = null;
  }

  list.addEventListener("pointerdown", (event) => {
    const row = event.target.closest(".layer-row");
    if (!row || event.target.closest("button, input, select")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (isBusy()) return;
    drag = {
      id: Number(row.dataset.id),
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      captured: false,
      target: null,
    };
  });

  list.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.moved) {
      if (
        Math.abs(event.clientX - drag.startX) < threshold &&
        Math.abs(event.clientY - drag.startY) < threshold
      ) {
        return;
      }
      drag.moved = true;
      list.classList.add("dragging");
      list.setPointerCapture(event.pointerId);
      drag.captured = true;
    }
    event.preventDefault();
    clearDropMarks();
    drag.target = dropTargetAt(event.clientX, event.clientY, drag.id);
    if (drag.target) drag.target.row.dataset.drop = drag.target.zone;
  });

  list.addEventListener("pointerup", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { id, moved, target } = drag;
    endDrag();
    if (!moved) onActivate(id);
    else if (target) onDrop(id, target);
  });

  list.addEventListener("pointercancel", endDrag);
  list.addEventListener("lostpointercapture", () => {
    if (drag?.captured) endDrag();
  });

  // Pointer capture starts only after the threshold, so a release outside the
  // list is not delivered to the listeners above. The mouse pointer id stays
  // stable; clear the pending gesture or the next move over the list drops it.
  // A release whose target is inside the list is left to those listeners.
  const releaseUncaptured = (event) => {
    if (!drag || drag.captured || event.pointerId !== drag.pointerId) return;
    if (list.contains(event.target)) return;
    endDrag();
  };
  owner.addEventListener("pointerup", releaseUncaptured);
  owner.addEventListener("pointercancel", releaseUncaptured);
}
