import { CommandError, createRegistry } from "./commands.js";
import { canvasToBlob } from "./image-io.js";
import {
  createFrameScheduler,
  mapPointToCanvas,
  normalizeRect,
} from "./image-utils.js";
import { HistoryStore } from "./history-store.js";
import {
  BLEND_MODES,
  MAX_NAME_LENGTH,
  addLayer,
  createDraft,
  deleteNode,
  drawDocument,
  duplicateNode,
  findNode,
  freezeDocument,
  groupLayer,
  layerSource,
  paintLayer,
  renameNode,
  reorderNode,
  resampleLayers,
  resolveActive,
  setBlend,
  setOpacity,
  setVisibility,
  sizeProblem,
} from "./layers.js";
import { enableCanvasFilter, filters } from "./processing-utils.js";

const HISTORY_LIMIT = 20;
const HISTORY_BYTES = 256 * 1024 * 1024;
const NUMBER_PARAM = { type: "number" };
const POSITIVE_PARAM = { type: "number", exclusiveMin: 0 };
const ID_PARAM = { type: "integer", min: 1 };
const NAME_PARAM = { type: "string", trim: true, minLength: 1, maxLength: MAX_NAME_LENGTH };
const OPTIONAL_NAME_PARAM = { type: "string", trim: true, maxLength: MAX_NAME_LENGTH, default: "" };
const EMPTY_LAYERS = Object.freeze([]);

const FILTER_LABELS = {
  grayscale: "Grayscale",
  threshold: "Threshold",
  sepia: "Sepia",
  invert: "Invert colors",
};

function makeCanvas() {
  const canvasEl = document.getElementById("imageProcessed");
  const overlayEl = document.getElementById("imageOverlay");
  const canvasStack = document.getElementById("canvasStack");
  const context = canvasEl.getContext("2d");
  const overlayContext = overlayEl.getContext("2d");
  const history = new HistoryStore({ limit: HISTORY_LIMIT, maxBytes: HISTORY_BYTES });
  const registry = createRegistry();

  let pendingOperations = 0;
  let operationQueue = Promise.resolve();
  let disarmTool = () => {};
  let cancelOpenGesture = () => {};
  let activeId = null;
  let previewing = false;

  const env = {
    createCanvas(width, height) {
      const { scratch, scratchContext } = createScratchCanvas(width, height);
      return { canvas: scratch, context: scratchContext };
    },
    createImageBitmap: (source) => createImageBitmap(source),
  };

  function present() {
    return history.present?.snapshot ?? null;
  }

  function readDoc() {
    const view = history.entries();
    const doc = present();
    return Object.freeze({
      width: canvasEl.width,
      height: canvasEl.height,
      hasContent: doc !== null,
      busy: pendingOperations > 0,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      bytes: history.bytes,
      history: view,
      layers: doc?.layers ?? EMPTY_LAYERS,
      activeId: doc ? activeId : null,
    });
  }

  function commandContext() {
    return Object.freeze({
      width: canvasEl.width,
      height: canvasEl.height,
      present: present(),
      activeId,
    });
  }

  function emitState() {
    const detail = {
      busy: pendingOperations > 0,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      bytes: history.bytes,
      history: history.size,
    };

    for (const [id, enabled] of [
      ["undoButton", detail.canUndo && !detail.busy],
      ["redoButton", detail.canRedo && !detail.busy],
    ]) {
      const control = document.getElementById(id);
      control?.classList.toggle("no-events", !enabled);
      control?.setAttribute("aria-disabled", String(!enabled));
      if (control instanceof HTMLButtonElement) control.disabled = !enabled;
    }

    window.dispatchEvent(new CustomEvent("canvasstatechange", { detail }));
  }

  const reportedErrors = new WeakSet();

  function reportError(error) {
    if (error && typeof error === "object") {
      if (reportedErrors.has(error)) return;
      reportedErrors.add(error);
    }
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
    const settled = result.then(
      (value) => value,
      (error) => {
        reportError(error);
        throw error;
      }
    );
    operationQueue = settled.then(
      () => {
        pendingOperations -= 1;
        emitState();
      },
      () => {
        pendingOperations -= 1;
        emitState();
      }
    );
    return settled;
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

  function createScratchCanvas(width, height, readFrequently = false) {
    const scratch = document.createElement("canvas");
    scratch.width = width;
    scratch.height = height;
    const scratchContext = scratch.getContext(
      "2d",
      readFrequently ? { willReadFrequently: true } : undefined
    );
    if (!scratchContext) throw new Error("Canvas processing is unavailable.");
    return { scratch, scratchContext };
  }

  function blit(snapshot) {
    setSize(snapshot);
    context.clearRect(0, 0, canvasEl.width, canvasEl.height);
    context.drawImage(snapshot, 0, 0);
    clearOverlay();
    canvasStack.hidden = false;
  }

  function paintOver(doc, id, draw) {
    const source = layerSource(doc, id);
    const { scratch, scratchContext } = createScratchCanvas(doc.width, doc.height);
    scratchContext.drawImage(source, 0, 0);
    draw(scratchContext);
    return { doc: paintLayer(doc, { id, pixels: scratch }) };
  }

  function previewOpacity(id, opacity) {
    const doc = present();
    if (!doc || pendingOperations > 0) return;
    const draft = setOpacity(doc, { id, opacity });
    drawDocument(draft, context, env.createCanvas);
    previewing = true;
  }

  function cancelPreview() {
    if (!previewing) return;
    previewing = false;
    const doc = present();
    if (doc) blit(doc.composite);
  }

  async function commit(plan, invocation) {
    const snapshot = await freezeDocument(plan.doc, env);
    try {
      blit(snapshot.composite);
    } catch (error) {
      snapshot.close();
      const doc = present();
      if (doc) blit(doc.composite);
      throw error;
    }

    const entry = {
      name: invocation.name,
      label: invocation.label,
      params: invocation.params,
      snapshot,
    };
    if (invocation.historyMode === "reset") history.reset(entry);
    else history.add(entry);
    activeId = resolveActive(snapshot, plan.activate ?? activeId);
    emitState();
    return Object.freeze({
      name: invocation.name,
      label: invocation.label,
      params: invocation.params,
      info: Object.freeze(plan.info ?? {}),
    });
  }

  function publicView(entry) {
    if (!entry) return null;
    return Object.freeze({
      name: entry.name,
      label: entry.label,
      params: entry.params,
    });
  }

  function run(name, rawParams = {}) {
    cancelOpenGesture();
    cancelPreview();
    let descriptor;
    try {
      descriptor = registry.catalog.get(name);
    } catch (error) {
      return Promise.reject(error);
    }
    if (pendingOperations > 0) {
      return Promise.reject(
        new CommandError("busy", `Cannot run ${name} while the canvas is busy.`)
      );
    }
    if (descriptor.historyMode === "reset") {
      return Promise.reject(
        new CommandError("invalid", `${name} is not available through run.`)
      );
    }
    if (history.present === null) {
      return Promise.reject(new CommandError("empty", "Load an image first."));
    }

    let invocation;
    try {
      invocation = registry.dispatch(name, rawParams, commandContext());
    } catch (error) {
      return Promise.reject(error);
    }
    return enqueue(async () => commit(await invocation.plan, invocation));
  }

  function load(source, { label } = {}) {
    cancelOpenGesture();
    cancelPreview();
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    if (!width || !height) throw new Error("The image has invalid dimensions.");
    const problem = sizeProblem(width, height);
    if (problem) throw new CommandError("invalid", `Cannot load this image: ${problem}.`);
    if (pendingOperations > 0) {
      throw new CommandError("busy", "Cannot load an image while the canvas is busy.");
    }

    const descriptor = registry.catalog.get("image.load");
    const { scratch, scratchContext } = createScratchCanvas(width, height, true);
    scratchContext.drawImage(source, 0, 0, width, height);
    try {
      scratchContext.getImageData(0, 0, 1, 1);
    } catch {
      throw new Error(
        "This image cannot be edited because its source blocks canvas access."
      );
    }

    const draft = createDraft({ width, height, pixels: scratch });
    return enqueue(() =>
      commit(
        { doc: draft, activate: draft.tree[0].id },
        {
          name: descriptor.name,
          label: label || descriptor.label,
          params: { width, height },
          historyMode: descriptor.historyMode,
        }
      )
    );
  }

  function restore(available, move, pick) {
    cancelOpenGesture();
    cancelPreview();
    if (pendingOperations > 0 || !available) return Promise.resolve(null);
    return enqueue(() => {
      const moved = move();
      if (!moved) return null;
      blit(moved.present.snapshot.composite);
      activeId = resolveActive(moved.present.snapshot, activeId);
      emitState();
      return publicView(pick(moved));
    });
  }

  function undo() {
    return restore(history.canUndo, () => history.undo(), (moved) => moved.undone);
  }

  function redo() {
    return restore(history.canRedo, () => history.redo(), (moved) => moved.redone);
  }

  function activate(id) {
    const doc = present();
    if (!doc) throw new CommandError("empty", "Load an image first.");
    if (!findNode(doc.tree, id)) throw new CommandError("invalid", `no layer ${id}`);
    activeId = id;
    emitState();
    return id;
  }

  registry.define({
    name: "image.load",
    label: "Load",
    historyMode: "reset",
    params: {
      width: { type: "integer", min: 1 },
      height: { type: "integer", min: 1 },
    },
    execute() {
      throw new CommandError(
        "invalid",
        "image.load requires a decoded image. Use the load control."
      );
    },
  });

  for (const [key, filter] of Object.entries(filters)) {
    registry.define({
      name: `filter.${key}`,
      label: FILTER_LABELS[key],
      historyMode: "add",
      params: {},
      execute(_, { present: doc, activeId: id }) {
        const source = layerSource(doc, id);
        const { width, height } = doc;
        let scratch;
        let accelerated = false;

        if (filter.canvasFilter) {
          const acceleratedSurface = createScratchCanvas(width, height);
          if (enableCanvasFilter(acceleratedSurface.scratchContext, filter.canvasFilter)) {
            acceleratedSurface.scratchContext.drawImage(source, 0, 0);
            acceleratedSurface.scratchContext.filter = "none";
            scratch = acceleratedSurface.scratch;
            accelerated = true;
          }
        }

        if (!scratch) {
          const fallbackSurface = createScratchCanvas(width, height, true);
          fallbackSurface.scratchContext.drawImage(source, 0, 0);
          const imageData = fallbackSurface.scratchContext.getImageData(0, 0, width, height);
          filter.transform(imageData.data);
          fallbackSurface.scratchContext.putImageData(imageData, 0, 0);
          scratch = fallbackSurface.scratch;
        }

        return { doc: paintLayer(doc, { id, pixels: scratch }), info: { accelerated } };
      },
    });
  }

  registry.define({
    name: "image.resize",
    label: "Resize",
    historyMode: "add",
    params: {
      width: { type: "integer", min: 1 },
      height: { type: "integer", min: 1 },
    },
    validate: ({ width, height }) => sizeProblem(width, height),
    execute({ width, height }, { present: doc }) {
      return {
        doc: resampleLayers(doc, {
          width,
          height,
          resample(pixels) {
            const { scratch, scratchContext } = createScratchCanvas(width, height);
            scratchContext.imageSmoothingEnabled = true;
            scratchContext.imageSmoothingQuality = "high";
            scratchContext.drawImage(pixels, 0, 0, width, height);
            return scratch;
          },
        }),
      };
    },
  });

  function clipRect(rect, bounds) {
    const x = Math.max(0, rect.x);
    const y = Math.max(0, rect.y);
    const right = Math.min(bounds.width, rect.x + rect.width);
    const bottom = Math.min(bounds.height, rect.y + rect.height);
    return { x, y, width: right - x, height: bottom - y };
  }

  function roundRect(rect) {
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const right = Math.round(rect.x + rect.width);
    const bottom = Math.round(rect.y + rect.height);
    return { x, y, width: right - x, height: bottom - y };
  }

  registry.define({
    name: "image.crop",
    label: "Crop",
    historyMode: "add",
    params: {
      x: { type: "integer" },
      y: { type: "integer" },
      width: { type: "integer", min: 1 },
      height: { type: "integer", min: 1 },
    },
    validate(params, context) {
      const clipped = clipRect(params, context);
      if (clipped.width < 1 || clipped.height < 1) return "crop area is empty";
    },
    execute(params, context) {
      const { x, y, width, height } = clipRect(params, context);
      return {
        doc: resampleLayers(context.present, {
          width,
          height,
          resample(pixels) {
            const { scratch, scratchContext } = createScratchCanvas(width, height);
            scratchContext.drawImage(pixels, x, y, width, height, 0, 0, width, height);
            return scratch;
          },
        }),
      };
    },
  });

  registry.define({
    name: "layer.add",
    label: "Add layer",
    historyMode: "add",
    params: { name: OPTIONAL_NAME_PARAM },
    execute({ name }, { present: doc, activeId: id }) {
      const { scratch } = createScratchCanvas(doc.width, doc.height);
      return {
        doc: addLayer(doc, { afterId: id, name: name || undefined, pixels: scratch }),
        activate: doc.nextId,
      };
    },
  });

  registry.define({
    name: "layer.group",
    label: "Add group",
    historyMode: "add",
    params: { id: ID_PARAM, name: OPTIONAL_NAME_PARAM },
    validate: ({ id, name }, { present: doc }) =>
      groupLayer.problem(doc, { id, name: name || undefined }),
    execute({ id, name }, { present: doc }) {
      return { doc: groupLayer(doc, { id, name: name || undefined }), activate: doc.nextId };
    },
  });

  registry.define({
    name: "layer.delete",
    label: "Delete layer",
    historyMode: "add",
    params: { id: ID_PARAM },
    validate: (params, { present: doc }) => deleteNode.problem(doc, params),
    execute(params, { present: doc, activeId: current }) {
      const { node, parent, siblings, index } = findNode(doc.tree, params.id);
      const neighbor = siblings[index - 1] ?? siblings[index + 1] ?? parent;
      const activeRemoved = findNode([node], current) !== null;
      return {
        doc: deleteNode(doc, params),
        activate: activeRemoved ? (neighbor?.id ?? null) : current,
      };
    },
  });

  registry.define({
    name: "layer.duplicate",
    label: "Duplicate layer",
    historyMode: "add",
    params: { id: ID_PARAM },
    validate: (params, { present: doc }) => duplicateNode.problem(doc, params),
    execute(params, { present: doc }) {
      return { doc: duplicateNode(doc, params), activate: doc.nextId };
    },
  });

  const layerEdits = {
    "layer.rename": { label: "Rename layer", params: { name: NAME_PARAM }, op: renameNode },
    "layer.reorder": {
      label: "Reorder layer",
      params: { parentId: { type: "integer", min: 0 }, index: { type: "integer", min: 0 } },
      op: reorderNode,
    },
    "layer.visibility": {
      label: "Toggle layer",
      params: { visible: { type: "boolean" } },
      op: setVisibility,
    },
    "layer.opacity": {
      label: "Layer opacity",
      params: { opacity: { type: "integer", min: 0, max: 100 } },
      op: setOpacity,
    },
    "layer.blend": {
      label: "Layer blend",
      params: { blend: { type: "string", enum: [...BLEND_MODES] } },
      op: setBlend,
    },
  };

  for (const [name, edit] of Object.entries(layerEdits)) {
    registry.define({
      name,
      label: edit.label,
      historyMode: "add",
      params: { id: ID_PARAM, ...edit.params },
      validate: (params, { present: doc }) => edit.op.problem(doc, params),
      execute: (params, { present: doc }) => ({ doc: edit.op(doc, params) }),
    });
  }

  function strokeSegment(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  const drawTools = {
    "draw.line": {
      label: "Line",
      params: { x1: NUMBER_PARAM, y1: NUMBER_PARAM, x2: NUMBER_PARAM, y2: NUMBER_PARAM },
      validate: (params) =>
        params.x1 === params.x2 && params.y1 === params.y2 ? "line has zero length" : undefined,
      render(ctx, { x1, y1, x2, y2 }) {
        strokeSegment(ctx, x1, y1, x2, y2);
      },
      paramsFrom: ({ start, latest }) => ({
        x1: start.x,
        y1: start.y,
        x2: latest.x,
        y2: latest.y,
      }),
    },
    "draw.rect": {
      label: "Rectangle",
      params: { x: NUMBER_PARAM, y: NUMBER_PARAM, width: POSITIVE_PARAM, height: POSITIVE_PARAM },
      render(ctx, { x, y, width, height }) {
        ctx.strokeRect(x, y, width, height);
      },
      paramsFrom: ({ start, latest }) => normalizeRect(start, latest),
    },
    "draw.ellipse": {
      label: "Ellipse",
      params: { cx: NUMBER_PARAM, cy: NUMBER_PARAM, rx: POSITIVE_PARAM, ry: POSITIVE_PARAM },
      render(ctx, { cx, cy, rx, ry }) {
        if (!(rx > 0) || !(ry > 0)) return;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      },
      paramsFrom: ({ start, latest }) => ({
        cx: (start.x + latest.x) / 2,
        cy: (start.y + latest.y) / 2,
        rx: Math.abs(latest.x - start.x) / 2,
        ry: Math.abs(latest.y - start.y) / 2,
      }),
    },
    "draw.pen": {
      label: "Pen",
      params: { points: { type: "points", minLength: 2 } },
      validate(params) {
        const { points } = params;
        for (let index = 1; index < points.length; index += 1) {
          const previous = points[index - 1];
          const point = points[index];
          if (previous.x !== point.x || previous.y !== point.y) return;
        }
        return "pen stroke is empty";
      },
      render(ctx, { points }) {
        for (let index = 1; index < points.length; index += 1) {
          const previous = points[index - 1];
          const point = points[index];
          if (previous.x === point.x && previous.y === point.y) continue;
          strokeSegment(ctx, previous.x, previous.y, point.x, point.y);
        }
      },
      paramsFrom: ({ allPoints }) => ({ points: allPoints }),
      previewAppends: true,
    },
  };

  for (const [name, tool] of Object.entries(drawTools)) {
    registry.define({
      name,
      label: tool.label,
      historyMode: "add",
      params: tool.params,
      validate: tool.validate,
      execute: (params, { present: doc, activeId: id }) =>
        paintOver(doc, id, (ctx) => tool.render(ctx, params)),
    });
  }

  const pointerTools = {};
  for (const [name, tool] of Object.entries(drawTools)) {
    pointerTools[name] = {
      paramsFrom: tool.paramsFrom,
      preview: tool.render,
      previewAppends: tool.previewAppends,
      paintsLayer: true,
    };
  }
  pointerTools["image.crop"] = {
    paramsFrom: ({ start, latest }) => roundRect(normalizeRect(start, latest)),
    preview(ctx, { x, y, width, height }) {
      ctx.strokeRect(x, y, width, height);
    },
    paintsLayer: false,
  };

  function renderGestureFrame(tool, session) {
    if (session.framePoints.length === 0) return;
    const framePoints = session.framePoints.splice(0);
    const previous = session.latest;
    session.latest = framePoints[framePoints.length - 1];
    session.allPoints.push(...framePoints);
    if (!tool.previewAppends) clearOverlay();
    const previewParams = tool.previewAppends
      ? { points: [previous, ...framePoints] }
      : tool.paramsFrom(session);
    tool.preview(overlayContext, previewParams);
  }

  function armTool(name) {
    const tool = pointerTools[name];
    if (!tool) throw new CommandError("unknown", `No pointer tool "${name}".`);
    disarmTool();
    clearOverlay();

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

    const endOpenGesture = (pointerId) => {
      scheduler.cancel();
      if (pointerId != null) {
        try {
          overlayEl.releasePointerCapture?.(pointerId);
        } catch {
          // Capture may already be released.
        }
      }
      session = null;
      finishing = false;
      clearOverlay();
    };

    const cancelSession = () => {
      if (!session || finishing) return;
      const pointerId = session.pointerId;
      finishing = true;
      endOpenGesture(pointerId);
    };

    cancelOpenGesture = () => {
      if (!session || finishing) return;
      const pointerId = session.pointerId;
      finishing = true;
      endOpenGesture(pointerId);
    };

    overlayEl.onpointerdown = (event) => {
      if (
        session ||
        finishing ||
        pendingOperations > 0 ||
        history.present === null ||
        event.isPrimary === false ||
        (event.pointerType === "mouse" && event.button !== 0)
      ) {
        return;
      }
      if (tool.paintsLayer) {
        try {
          layerSource(present(), activeId);
        } catch (error) {
          reportError(error);
          return;
        }
      }

      event.preventDefault();
      clearOverlay();
      const point = pointFromEvent(event);
      session = {
        pointerId: event.pointerId,
        start: point,
        latest: point,
        framePoints: [],
        allPoints: [point],
      };
      overlayEl.setPointerCapture?.(event.pointerId);
    };

    overlayEl.onpointermove = (event) => {
      if (!session || event.pointerId !== session.pointerId) return;
      event.preventDefault();
      const events = event.getCoalescedEvents?.() || [event];
      const points = events.length ? events.map(pointFromEvent) : [pointFromEvent(event)];
      session.framePoints.push(...points);
      scheduler.schedule(() => {
        if (session) renderGestureFrame(tool, session);
      });
    };

    overlayEl.onpointerup = async (event) => {
      if (!session || event.pointerId !== session.pointerId || finishing) return;
      event.preventDefault();
      finishing = true;
      session.framePoints.push(pointFromEvent(event));
      scheduler.flush();
      if (session.framePoints.length) renderGestureFrame(tool, session);
      const current = session;
      session = null;
      overlayEl.releasePointerCapture?.(event.pointerId);
      try {
        await run(name, tool.paramsFrom(current));
      } catch (error) {
        clearOverlay();
        if (error?.code !== "invalid") reportError(error);
      } finally {
        finishing = false;
      }
    };

    overlayEl.onpointercancel = cancelSession;
    overlayEl.onlostpointercapture = cancelSession;

    disarmTool = () => {
      cancelOpenGesture();
      cancelOpenGesture = () => {};
      scheduler.cancel();
      clearOverlay();
      session = null;
      finishing = false;
      overlayEl.onpointerdown = null;
      overlayEl.onpointermove = null;
      overlayEl.onpointerup = null;
      overlayEl.onpointercancel = null;
      overlayEl.onlostpointercapture = null;
    };
  }

  return Object.freeze({
    run,
    undo,
    redo,
    load,
    armTool,
    activate,
    previewOpacity,
    commands: registry.catalog,
    get doc() {
      return readDoc();
    },
    toBlob() {
      if (!history.present) return Promise.resolve(null);
      return canvasToBlob(canvasEl);
    },
  });
}

export const canvas = makeCanvas();
