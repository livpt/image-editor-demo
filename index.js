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
import { createLayerActionGate } from "./layer-action-gate.js";
import { attachLayerDrag } from "./layer-drag.js";

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
    await canvas.load(decoded.source, {
      label: `Load ${label}`,
      profile: decoded.profile,
      profileKnown: decoded.profileKnown,
    });
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
      const params =
        descriptor.name === "filter.brightness"
          ? { amount: Number(document.getElementById("brightnessAmount").value) }
          : {};
      const result = await canvas.run(descriptor.name, params);
      const duration = Math.round((performance.now() - started) * 10) / 10;
      setStatus(`${result.label} applied in ${duration} ms.`);
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

const foregroundColor = document.getElementById("foregroundColor");
const foregroundHex = document.getElementById("foregroundHex");
const foregroundRgb = document.getElementById("foregroundRgb");
const cursorHex = document.getElementById("cursorHex");
const cursorRgb = document.getElementById("cursorRgb");
const documentInfo = document.getElementById("documentInfo");

function rgbText(hex) {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `${red}, ${green}, ${blue}`;
}

function hexFromRgb(text) {
  const channels = text.split(",").map((part) => Number(part.trim()));
  if (channels.length !== 3) return null;
  if (channels.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function syncForeground(hex) {
  if (document.activeElement !== foregroundColor) foregroundColor.value = hex;
  if (document.activeElement !== foregroundHex) foregroundHex.value = hex;
  if (document.activeElement !== foregroundRgb) foregroundRgb.value = rgbText(hex);
}

function documentLine(doc) {
  if (!doc.hasContent || !doc.profile) return "";
  const size = `${doc.width} × ${doc.height}`;
  if (!doc.profile.known) return `${size} · Profile: unavailable (assumed sRGB)`;
  if (!doc.profile.name) return `${size} · Profile: none (assumed sRGB)`;
  const shown = doc.profile.assumedSrgb ? "" : " (shown as sRGB)";
  return `${size} · Profile: ${doc.profile.name}${shown}`;
}

function renderPanel() {
  const doc = canvas.doc;
  layersList.replaceChildren(renderRows(doc.layers, doc.activeId, 0));
  const active = activeNode();
  for (const id of ["layerAdd", "layerGroup", "layerDuplicate", "layerDelete"]) {
    document.getElementById(id).disabled = doc.busy || !doc.hasContent;
  }
  opacityInput.disabled = blendSelect.disabled = doc.busy || !active;
  syncForeground(doc.foreground);
  documentInfo.textContent = documentLine(doc);
  if (doc.busy || !active) return;
  opacityInput.value = String(active.opacity);
  opacityValue.value = String(active.opacity);
  blendSelect.value = active.blend;
}

window.addEventListener("canvasstatechange", renderPanel);
renderPanel();

function applyForeground(hex) {
  if (!hex) return;
  try {
    canvas.setForeground(hex);
  } catch (error) {
    setStatus(error.message, true);
  }
}

foregroundColor.addEventListener("input", () => applyForeground(foregroundColor.value));
foregroundHex.addEventListener("input", () => {
  if (/^#[0-9a-f]{6}$/i.test(foregroundHex.value.trim())) applyForeground(foregroundHex.value.trim());
});
foregroundRgb.addEventListener("input", () => applyForeground(hexFromRgb(foregroundRgb.value)));

window.addEventListener("canvassample", (event) => {
  const sample = event.detail;
  cursorHex.textContent = sample ? sample.hex : "none";
  cursorRgb.textContent = sample ? `${sample.r}, ${sample.g}, ${sample.b}` : "";
});

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
const layerActionGate = createLayerActionGate();
for (const [id, action] of Object.entries(layerButtons)) {
  const button = document.getElementById(id);
  const holdRename = (event) => {
    if (event.button !== 0 || !document.querySelector(".layer-rename")) return;
    layerActionGate.holdForButton();
  };
  button.addEventListener("pointerdown", holdRename);
  button.addEventListener("mousedown", (event) => {
    holdRename(event);
    if (event.button !== 0 || !document.querySelector(".layer-rename")) return;
    event.preventDefault();
  });
  button.addEventListener("click", () => {
    layerActionGate.activate(action);
  });
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
  let inflight = Promise.resolve(null);
  const finish = (commit) => {
    if (done) return inflight;
    done = true;
    const next = input.value.trim();
    if (!commit || next === node.name) {
      renderPanel();
      return inflight;
    }
    inflight = runLayerCommand("layer.rename", { id: node.id, name: next }).then((result) => {
      if (!result) renderPanel();
      return result;
    });
    return inflight;
  };
  layerActionGate.open(() => finish(true));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
  });
  input.addEventListener("blur", (event) => {
    if (done) return;
    const next = event.relatedTarget;
    if (next && Object.hasOwn(layerButtons, next.id)) layerActionGate.holdForButton();
    if (layerActionGate.blur() !== null) return;
    const commitLater = () => {
      if (!done) layerActionGate.flush();
    };
    if (next && Object.hasOwn(layerButtons, next.id)) {
      next.addEventListener("blur", commitLater, { once: true });
    } else {
      setTimeout(commitLater, 0);
    }
  });
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

attachLayerDrag(layersList, {
  isBusy: () => canvas.doc.busy,
  dropTargetAt,
  onActivate: activateRow,
  onDrop: dropOn,
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
  setForeground: canvas.setForeground,
  commands: canvas.commands,
  get doc() {
    return canvas.doc;
  },
  get foreground() {
    return canvas.foreground;
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
