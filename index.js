import { canvas } from "./canvas.js";
import {
  decodeExternalImage,
  decodeLocalImage,
  downloadBlob,
} from "./image-io.js";
import {
  scaleDimension,
  validateDimensions,
} from "./image-utils.js";

const controls = document.getElementById("controls");
const layersControls = document.getElementById("layersControls");
const dragAndDropZone = document.getElementById("dragAndDropZone");
const dragHelper = document.querySelector(".drag-helper");
const fileInput = document.getElementById("fileInput");
const status = document.getElementById("appStatus");

function setStatus(message = "", error = false) {
  status.textContent = message;
  status.dataset.error = String(error);
}

function closeContainingMenu(element) {
  element.closest("details")?.removeAttribute("open");
}

async function installDecodedImage(decoded, label) {
  try {
    await canvas.load(decoded.source, { label: `Load ${label}` });
    dragHelper.classList.add("invisible");
    controls.disabled = false;
    layersControls.disabled = false;
    setStatus(`${label} is ready to edit.`);
  } finally {
    decoded.dispose();
  }
}

async function loadLocalFile(file) {
  if (!file) return;
  setStatus(`Loading ${file.name || "image"}…`);
  try {
    const decoded = await decodeLocalImage(file);
    await installDecodedImage(decoded, file.name || "Image");
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function loadExternalUrl(url) {
  if (!url) return;
  setStatus("Loading image URL…");
  try {
    const decoded = await decodeExternalImage(url);
    await installDecodedImage(decoded, "Image");
  } catch (error) {
    setStatus(error.message, true);
  }
}

dragAndDropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

dragAndDropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file) {
    loadLocalFile(file);
    return;
  }

  const uriList = event.dataTransfer.getData("text/uri-list");
  const url =
    uriList
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#")) ||
    event.dataTransfer.getData("url");
  loadExternalUrl(url);
});

fileInput.addEventListener("change", () => {
  loadLocalFile(fileInput.files[0]);
  fileInput.value = "";
});

const toolButtons = {
  penDraw: "draw.pen",
  lineDraw: "draw.line",
  rectangleDraw: "draw.rect",
  ellipseDraw: "draw.ellipse",
  cropButton: "image.crop",
};

for (const [id, name] of Object.entries(toolButtons)) {
  document.getElementById(id).addEventListener("click", (event) => {
    closeContainingMenu(event.currentTarget);
    setStatus(`${canvas.commands.get(name).label} tool selected.`);
    canvas.armTool(name);
  });
}

const resolutionDialog = document.getElementById("resolutionDialog");
const resolutionForm = document.getElementById("resolutionForm");
const widthInput = document.getElementById("width-size");
const heightInput = document.getElementById("height-size");
const ratioCheckbox = document.getElementById("checkbox-img-ratio");
const resizeError = document.getElementById("resizeError");
const saveResolution = document.getElementById("saveResolution");
let resizeRatio = 1;
let syncingDimensions = false;

function openResizeDialog() {
  const size = canvas.doc;
  widthInput.value = size.width;
  heightInput.value = size.height;
  resizeRatio = size.width / size.height;
  resizeError.textContent = "";
  resolutionDialog.showModal();
  widthInput.focus();
}

const resizeButton = document.getElementById("resizeButton");
resizeButton.addEventListener("click", openResizeDialog);
resizeButton.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  openResizeDialog();
});

widthInput.addEventListener("input", () => {
  if (!ratioCheckbox.checked || syncingDimensions) return;
  const height = scaleDimension(widthInput.value, resizeRatio, "width");
  if (height === null) return;
  syncingDimensions = true;
  heightInput.value = height;
  syncingDimensions = false;
});

heightInput.addEventListener("input", () => {
  if (!ratioCheckbox.checked || syncingDimensions) return;
  const width = scaleDimension(heightInput.value, resizeRatio, "height");
  if (width === null) return;
  syncingDimensions = true;
  widthInput.value = width;
  syncingDimensions = false;
});

for (const id of ["closeResolution", "cancelResolution"]) {
  document.getElementById(id).addEventListener("click", () => {
    resolutionDialog.close();
  });
}

resolutionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const dimensions = validateDimensions(widthInput.value, heightInput.value);
  if (!dimensions) {
    resizeError.textContent = "Enter positive width and height values.";
    return;
  }

  saveResolution.disabled = true;
  resizeError.textContent = "";
  try {
    await canvas.run("image.resize", dimensions);
    resolutionDialog.close();
    setStatus(`Resized to ${dimensions.width} × ${dimensions.height}.`);
  } catch (error) {
    resizeError.textContent = error.message;
  } finally {
    saveResolution.disabled = false;
  }
});

for (const descriptor of canvas.commands.list()) {
  if (!descriptor.name.startsWith("filter.")) continue;
  const id = descriptor.name.slice("filter.".length);
  document.getElementById(id).addEventListener("click", async (event) => {
    closeContainingMenu(event.currentTarget);
    setStatus(`Applying ${descriptor.label.toLowerCase()}…`);
    const started = performance.now();
    try {
      const result = await canvas.run(descriptor.name);
      const duration = Math.round((performance.now() - started) * 10) / 10;
      setStatus(
        `${result.label} applied in ${duration} ms${result.info.accelerated ? " using the canvas filter path" : ""}.`
      );
    } catch (error) {
      setStatus(error.message, true);
    }
  });
}

function announce(action, verb) {
  return async () => {
    const entry = await action();
    if (entry) setStatus(`${verb} ${entry.label.toLowerCase()}.`);
  };
}

const undoEdit = announce(canvas.undo, "Undid");
const redoEdit = announce(canvas.redo, "Redid");

document.getElementById("undoButton").addEventListener("click", undoEdit);
document.getElementById("redoButton").addEventListener("click", redoEdit);

const shortcuts = [
  { key: "z", shift: false, action: undoEdit },
  { key: "z", shift: true, action: redoEdit },
  { key: "y", shift: false, action: redoEdit },
];

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

window.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
  if (resolutionDialog.open || isEditableTarget(event.target)) return;
  const match = shortcuts.find(
    (shortcut) => shortcut.key === event.key.toLowerCase() && shortcut.shift === event.shiftKey
  );
  if (!match) return;
  event.preventDefault();
  match.action();
});

const layersList = document.getElementById("layersList");
const opacityInput = document.getElementById("layerOpacity");
const opacityValue = document.getElementById("layerOpacityValue");
const blendSelect = document.getElementById("layerBlend");

const LAYER_STATUS = {
  "layer.add": "Added a layer.",
  "layer.group": "Grouped the layer.",
  "layer.duplicate": "Duplicated the layer.",
  "layer.delete": "Deleted the layer.",
  "layer.rename": "Renamed the layer.",
  "layer.reorder": "Moved the layer.",
  "layer.visibility": "Toggled the layer.",
  "layer.opacity": "Changed the layer opacity.",
  "layer.blend": "Changed the layer blend mode.",
};

const EYE_ICON =
  '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">' +
  '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="2"/>' +
  '<circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';

async function runLayerCommand(name, params) {
  try {
    const result = await canvas.run(name, params);
    setStatus(LAYER_STATUS[result.name]);
    return result;
  } catch (error) {
    setStatus(error.message, true);
    return null;
  }
}

function locate(nodes, id, parentId = 0) {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === id) return { node, parentId, index };
    if (node.kind === "group") {
      const found = locate(node.children, id, node.id);
      if (found) return found;
    }
  }
  return null;
}

function containsId(node, id) {
  return node.id === id || (node.kind === "group" && node.children.some((c) => containsId(c, id)));
}

function activeNode() {
  const doc = canvas.doc;
  return doc.activeId === null ? null : locate(doc.layers, doc.activeId)?.node ?? null;
}

function renderRows(nodes, activeId, depth) {
  const fragment = document.createDocumentFragment();
  for (const node of [...nodes].reverse()) {
    const item = document.createElement("li");
    item.className = "layer-item";
    item.setAttribute("role", "treeitem");
    item.setAttribute("aria-selected", String(node.id === activeId));
    item.dataset.id = node.id;

    const row = document.createElement("div");
    row.className = "layer-row";
    row.dataset.id = node.id;
    row.dataset.kind = node.kind;
    row.style.setProperty("--depth", depth);
    row.tabIndex = 0;
    row.setAttribute("aria-label", node.kind === "group" ? `${node.name} (group)` : node.name);

    const eye = document.createElement("button");
    eye.type = "button";
    eye.className = "layer-eye";
    eye.setAttribute("aria-pressed", String(node.visible));
    eye.setAttribute("aria-label", `${node.visible ? "Hide" : "Show"} ${node.name}`);
    eye.innerHTML = EYE_ICON;

    const name = document.createElement("span");
    name.className = "layer-name";
    name.textContent = node.name;

    row.append(eye, name);
    if (node.kind === "group") {
      const kind = document.createElement("span");
      kind.className = "layer-kind";
      kind.textContent = "Group";
      row.append(kind);
    }
    item.append(row);

    if (node.kind === "group") {
      const children = document.createElement("ul");
      children.setAttribute("role", "group");
      children.className = "layers-children";
      children.append(renderRows(node.children, activeId, depth + 1));
      item.append(children);
    }
    fragment.append(item);
  }
  return fragment;
}

function renderPanel() {
  const doc = canvas.doc;
  layersList.replaceChildren(renderRows(doc.layers, doc.activeId, 0));
  const active = activeNode();
  for (const id of ["layerAdd", "layerGroup", "layerDuplicate", "layerDelete"]) {
    document.getElementById(id).disabled = doc.busy || !doc.hasContent;
  }
  opacityInput.disabled = blendSelect.disabled = doc.busy || !active;
  if (doc.busy || !active) return;
  opacityInput.value = String(active.opacity);
  opacityValue.value = String(active.opacity);
  blendSelect.value = active.blend;
}

window.addEventListener("canvasstatechange", renderPanel);

function activateRow(id) {
  try {
    canvas.activate(id);
  } catch (error) {
    setStatus(error.message, true);
  }
}

const layerButtons = {
  layerAdd: () => runLayerCommand("layer.add"),
  layerGroup: () => runLayerCommand("layer.group", { id: canvas.doc.activeId }),
  layerDuplicate: () => runLayerCommand("layer.duplicate", { id: canvas.doc.activeId }),
  layerDelete: () => runLayerCommand("layer.delete", { id: canvas.doc.activeId }),
};
for (const [id, action] of Object.entries(layerButtons)) {
  document.getElementById(id).addEventListener("click", action);
}

function startRename(row) {
  const node = locate(canvas.doc.layers, Number(row.dataset.id))?.node;
  const nameEl = row.querySelector(".layer-name");
  if (!node || !nameEl) return;
  const input = document.createElement("input");
  input.type = "text";
  input.className = "layer-rename";
  input.value = node.name;
  input.maxLength = 80;
  input.setAttribute("aria-label", `Rename ${node.name}`);
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const next = input.value.trim();
    if (!commit || next === node.name) {
      renderPanel();
      return;
    }
    runLayerCommand("layer.rename", { id: node.id, name: next }).then((result) => {
      if (!result) renderPanel();
    });
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
  nameEl.replaceWith(input);
  input.focus();
  input.select();
}

layersList.addEventListener("click", (event) => {
  const eye = event.target.closest(".layer-eye");
  if (!eye) return;
  const id = Number(eye.closest(".layer-row").dataset.id);
  const node = locate(canvas.doc.layers, id)?.node;
  if (node) runLayerCommand("layer.visibility", { id, visible: !node.visible });
});

layersList.addEventListener("dblclick", (event) => {
  const row = event.target.closest(".layer-row");
  if (!row || event.target.closest("button, input")) return;
  startRename(row);
});

layersList.addEventListener("keydown", (event) => {
  const row = event.target.closest(".layer-row");
  if (!row || event.target !== row) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    activateRow(Number(row.dataset.id));
  } else if (event.key === "F2") {
    event.preventDefault();
    startRename(row);
  }
});

const DRAG_THRESHOLD = 4;
let drag = null;

function dropZone(row, clientY) {
  const rect = row.getBoundingClientRect();
  const ratio = (clientY - rect.top) / rect.height;
  if (row.dataset.kind === "group") {
    if (ratio < 0.25) return "above";
    if (ratio > 0.75) return "below";
    return "into";
  }
  return ratio < 0.5 ? "above" : "below";
}

function clearDropMarks() {
  for (const marked of layersList.querySelectorAll("[data-drop]")) delete marked.dataset.drop;
}

function dropTargetAt(clientX, clientY, draggedId) {
  const row = document.elementFromPoint(clientX, clientY)?.closest(".layer-row");
  if (!row || !layersList.contains(row)) return null;
  const targetId = Number(row.dataset.id);
  const dragged = locate(canvas.doc.layers, draggedId);
  if (!dragged || containsId(dragged.node, targetId)) return null;
  return { row, id: targetId, zone: dropZone(row, clientY) };
}

function dropOn(draggedId, target) {
  const { layers } = canvas.doc;
  const dragged = locate(layers, draggedId);
  const destination = locate(layers, target.id);
  if (!dragged || !destination) return;
  let parentId;
  let index;
  if (target.zone === "into") {
    parentId = target.id;
    index = destination.node.children.length;
  } else {
    parentId = destination.parentId;
    index = target.zone === "above" ? destination.index + 1 : destination.index;
  }
  if (parentId === dragged.parentId) {
    if (index > dragged.index) index -= 1;
    if (index === dragged.index) return;
  }
  runLayerCommand("layer.reorder", { id: draggedId, parentId, index });
}

function endDrag() {
  if (!drag) return;
  if (drag.captured) {
    try {
      layersList.releasePointerCapture(drag.pointerId);
    } catch {
      // Capture may already be released.
    }
  }
  layersList.classList.remove("dragging");
  clearDropMarks();
  drag = null;
}

layersList.addEventListener("pointerdown", (event) => {
  const row = event.target.closest(".layer-row");
  if (!row || event.target.closest("button, input, select")) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (canvas.doc.busy) return;
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

layersList.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.moved) {
    if (
      Math.abs(event.clientX - drag.startX) < DRAG_THRESHOLD &&
      Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD
    ) {
      return;
    }
    drag.moved = true;
    layersList.classList.add("dragging");
    layersList.setPointerCapture(event.pointerId);
    drag.captured = true;
  }
  event.preventDefault();
  clearDropMarks();
  drag.target = dropTargetAt(event.clientX, event.clientY, drag.id);
  if (drag.target) drag.target.row.dataset.drop = drag.target.zone;
});

layersList.addEventListener("pointerup", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const { id, moved, target } = drag;
  endDrag();
  if (!moved) activateRow(id);
  else if (target) dropOn(id, target);
});

layersList.addEventListener("pointercancel", endDrag);
layersList.addEventListener("lostpointercapture", () => {
  if (drag?.captured) endDrag();
});

opacityInput.addEventListener("input", () => {
  opacityValue.value = opacityInput.value;
  const id = canvas.doc.activeId;
  if (id === null) return;
  try {
    canvas.previewOpacity(id, Number(opacityInput.value));
  } catch (error) {
    setStatus(error.message, true);
  }
});

opacityInput.addEventListener("change", () => {
  const node = activeNode();
  const opacity = Number(opacityInput.value);
  if (!node || node.opacity === opacity) return;
  runLayerCommand("layer.opacity", { id: node.id, opacity });
});

blendSelect.addEventListener("change", () => {
  const node = activeNode();
  if (!node || node.blend === blendSelect.value) return;
  runLayerCommand("layer.blend", { id: node.id, blend: blendSelect.value });
});

window.app = Object.freeze({
  run: canvas.run,
  undo: canvas.undo,
  redo: canvas.redo,
  activate: canvas.activate,
  commands: canvas.commands,
  get doc() {
    return canvas.doc;
  },
});

const consoleForm = document.getElementById("consoleForm");
const consoleInput = document.getElementById("consoleInput");
const consoleLog = document.getElementById("consoleLog");

consoleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = consoleInput.value;
  if (!code.trim()) return;
  try {
    const value = await new Function("app", `return (${code});`)(window.app);
    const printed = value === undefined ? "undefined" : JSON.stringify(value, null, 2);
    consoleLog.dataset.error = "false";
    consoleLog.textContent += `${consoleLog.textContent ? "\n" : ""}> ${code}\n${printed}`;
  } catch (error) {
    consoleLog.dataset.error = "true";
    consoleLog.textContent += `${consoleLog.textContent ? "\n" : ""}> ${code}\n${error.message}`;
  }
});

document.getElementById("downloadButton").addEventListener("click", async () => {
  if (!canvas.doc.hasContent) return;
  setStatus("Preparing PNG…");
  try {
    const blob = await canvas.toBlob();
    if (!blob) return;
    downloadBlob(blob, "processedImage.png");
    setStatus("PNG download started.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

window.addEventListener("canvaserror", (event) => {
  setStatus(event.detail.message, true);
});
