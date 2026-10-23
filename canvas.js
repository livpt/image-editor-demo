import {
  createFrameScheduler,
  mapPointToCanvas,
  normalizeRect,
} from "./image-utils.js";
import { HistoryStore } from "./history-store.js";

const HISTORY_LIMIT = 20;

function makeCanvas() {
  const canvasEl = document.getElementById("imageProcessed");
  const overlayEl = document.getElementById("imageOverlay");
  const canvasStack = document.getElementById("canvasStack");
  const context = canvasEl.getContext("2d");
  const overlayContext = overlayEl.getContext("2d");
  const history = new HistoryStore(HISTORY_LIMIT);

  let hasContent = false;
  let pendingOperations = 0;
  let operationQueue = Promise.resolve();
  let removePointerTool = () => {};

  function emitState() {
    const detail = {
      busy: pendingOperations > 0,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      history: history.size,
    };

    for (const [id, enabled] of [
      ["undoButton", detail.canUndo && !detail.busy],
      ["redoButton", detail.canRedo && !detail.busy],
    ]) {
      const control = document.getElementById(id);
      control?.classList.toggle("no-events", !enabled);
      control?.setAttribute("aria-disabled", String(!enabled));
    }

    window.dispatchEvent(new CustomEvent("canvasstatechange", { detail }));
  }

  function reportError(error) {
    console.error(error);
    window.dispatchEvent(
      new CustomEvent("canvaserror", {
        detail: { message: error?.message || "Canvas operation failed.", error },
      })
    );
  }

  function enqueue(operation) {
    pendingOperations += 1;
    emitState();

    const result = operationQueue.then(operation);
    operationQueue = result
      .catch((error) => {
        reportError(error);
      })
      .finally(() => {
        pendingOperations -= 1;
        emitState();
      });

    return result;
  }

  function setSize({ width, height }) {
    canvasEl.width = width;
    canvasEl.height = height;
    overlayEl.width = width;
    overlayEl.height = height;
    canvasStack.style.width = `${width}px`;
  }

  function clearOverlay() {
    overlayContext.clearRect(0, 0, overlayEl.width, overlayEl.height);
  }

  function restoreSnapshot(snapshot) {
    setSize({ width: snapshot.width, height: snapshot.height });
    context.clearRect(0, 0, canvasEl.width, canvasEl.height);
    context.drawImage(snapshot, 0, 0);
    clearOverlay();
  }

  function captureSnapshot(reset = false) {
    if (!hasContent) return Promise.resolve(false);

    let snapshot;
    try {
      snapshot = createImageBitmap(canvasEl);
    } catch (error) {
      reportError(error);
      return Promise.reject(error);
    }

    return enqueue(async () => {
      const bitmap = await snapshot;
      if (reset) history.reset(bitmap);
      else history.add(bitmap);
      emitState();
      return true;
    });
  }

  async function finishPointerSession(callbacks, session, cancelled) {
    if (cancelled) {
      callbacks.oncancel?.({ start: session.start, point: session.latest });
      clearOverlay();
      return;
    }

    const shouldCommit = await callbacks.onmouseup?.({
      start: session.start,
      point: session.latest,
      context: overlayContext,
    });

    if (callbacks.commitOverlay !== false && shouldCommit !== false) {
      context.drawImage(overlayEl, 0, 0);
      clearOverlay();
      await captureSnapshot();
    } else {
      clearOverlay();
    }
  }

  return {
    isEmpty() {
      return !hasContent;
    },

    isBusy() {
      return pendingOperations > 0;
    },

    getHistoryState() {
      return {
        ...history.size,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
        busy: pendingOperations > 0,
      };
    },

    getPosition() {
      const box = canvasEl.getBoundingClientRect();
      return {
        top: box.top + window.scrollY,
        left: box.left + window.scrollX,
      };
    },

    getSize() {
      return {
        width: canvasEl.width,
        height: canvasEl.height,
      };
    },

    resize(size) {
      setSize(size);
    },

    draw(drawOperation) {
      drawOperation(context);
      hasContent = true;
      return captureSnapshot();
    },

    drawWithoutCommit(drawOperation) {
      drawOperation(context);
    },

    commitDraw() {
      hasContent = true;
      return captureSnapshot();
    },

    loadImage(image) {
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      setSize({ width, height });
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      hasContent = true;
      canvasStack.hidden = false;
      return captureSnapshot(true);
    },

    drawImage(image, size = {}) {
      const width = size.width || image.width || image.naturalWidth;
      const height = size.height || image.height || image.naturalHeight;
      setSize({ width, height });
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      hasContent = true;
      canvasStack.hidden = false;
      return captureSnapshot(history.present === null);
    },

    crop(start, end) {
      const bounds = normalizeRect(start, end);
      const width = Math.round(bounds.width);
      const height = Math.round(bounds.height);
      if (!width || !height) return Promise.resolve(false);

      const scratch = document.createElement("canvas");
      scratch.width = width;
      scratch.height = height;
      scratch.getContext("2d").drawImage(
        canvasEl,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        0,
        0,
        width,
        height
      );

      setSize({ width, height });
      context.drawImage(scratch, 0, 0);
      return captureSnapshot();
    },

    performWhilePointerDown(action) {
      removePointerTool();
      clearOverlay();

      const callbacks = action();
      const scheduler = createFrameScheduler(
        window.requestAnimationFrame.bind(window),
        window.cancelAnimationFrame.bind(window)
      );
      let session = null;
      let finishing = false;

      const pointFromEvent = (event) =>
        mapPointToCanvas(
          event.clientX,
          event.clientY,
          overlayEl.getBoundingClientRect(),
          overlayEl.width,
          overlayEl.height
        );

      const renderFrame = () => {
        if (!session || session.points.length === 0) return;
        const points = session.points.splice(0);
        session.latest = points[points.length - 1];
        if (callbacks.clearEachFrame !== false) clearOverlay();
        callbacks.onmousemove?.({
          start: session.start,
          point: session.latest,
          points,
          context: overlayContext,
        });
      };

      const cancelSession = async () => {
        if (!session || finishing) return;
        finishing = true;
        scheduler.cancel();
        const current = session;
        session = null;
        await finishPointerSession(callbacks, current, true);
        finishing = false;
      };

      overlayEl.onpointerdown = (event) => {
        if (
          session ||
          finishing ||
          pendingOperations > 0 ||
          !hasContent ||
          event.isPrimary === false ||
          (event.pointerType === "mouse" && event.button !== 0)
        ) {
          return;
        }

        event.preventDefault();
        clearOverlay();
        const point = pointFromEvent(event);
        session = {
          pointerId: event.pointerId,
          start: point,
          latest: point,
          points: [],
        };
        overlayEl.setPointerCapture?.(event.pointerId);
        callbacks.onmousedown?.({ point, context: overlayContext });
      };

      overlayEl.onpointermove = (event) => {
        if (!session || event.pointerId !== session.pointerId) return;
        event.preventDefault();
        const events = event.getCoalescedEvents?.() || [event];
        const points = events.length ? events.map(pointFromEvent) : [pointFromEvent(event)];
        session.points.push(...points);
        scheduler.schedule(renderFrame);
      };

      overlayEl.onpointerup = async (event) => {
        if (!session || event.pointerId !== session.pointerId || finishing) return;
        event.preventDefault();
        finishing = true;
        session.points.push(pointFromEvent(event));
        scheduler.flush();
        const current = session;
        session = null;
        overlayEl.releasePointerCapture?.(event.pointerId);
        try {
          await finishPointerSession(callbacks, current, false);
        } finally {
          finishing = false;
        }
      };

      overlayEl.onpointercancel = cancelSession;
      overlayEl.onlostpointercapture = cancelSession;

      removePointerTool = () => {
        scheduler.cancel();
        clearOverlay();
        session = null;
        overlayEl.onpointerdown = null;
        overlayEl.onpointermove = null;
        overlayEl.onpointerup = null;
        overlayEl.onpointercancel = null;
        overlayEl.onlostpointercapture = null;
      };
    },

    applyPixelTransformation(pixelTransformation) {
      return this.draw((drawingContext) => {
        const { width, height } = this.getSize();
        const imgData = drawingContext.getImageData(0, 0, width, height);
        pixelTransformation(imgData.data);
        drawingContext.putImageData(imgData, 0, 0);
      });
    },

    undo() {
      if (pendingOperations > 0 || !history.canUndo) return Promise.resolve(false);
      return enqueue(() => {
        const snapshot = history.undo();
        if (!snapshot) return false;
        restoreSnapshot(snapshot);
        emitState();
        return true;
      });
    },

    redo() {
      if (pendingOperations > 0 || !history.canRedo) return Promise.resolve(false);
      return enqueue(() => {
        const snapshot = history.redo();
        if (!snapshot) return false;
        restoreSnapshot(snapshot);
        emitState();
        return true;
      });
    },

    getOctetStream() {
      return canvasEl
        .toDataURL("image/png")
        .replace("image/png", "image/octet-stream");
    },
  };
}

export const canvas = makeCanvas();
