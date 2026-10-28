import { canvas } from "./canvas.js";
import { createAutosave } from "./autosave.js";
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
import { keymap, matchShortcut } from "./keymap.js";

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

async function showDocument(message) {
  dragHelper.classList.add("invisible");
  controls.disabled = false;
  layersControls.disabled = false;
  setStatus(message);
}

async function installDecodedImage(decoded, label) {
  try {
    await canvas.load(decoded.source, {
      label: `Load ${label}`,
      profile: decoded.profile,
      profileKnown: decoded.profileKnown,
    });
    await showDocument(`${label} is ready to edit.`);
  } finally {
    decoded.dispose();
  }
}

function isZipSignature(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

async function isProjectFile(file) {
  const name = file.name?.toLowerCase() ?? "";
  if (name.endsWith(".msho")) return true;
  if (typeof file.slice !== "function") return false;
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return isZipSignature(bytes);
}

async function openProjectFile(file) {
  setStatus(`Loading ${file.name || "project"}…`);
  await canvas.loadProject(file);
  await showDocument(`${file.name || "Project"} is ready to edit.`);
}

async function loadLocalFile(file) {
  if (!file) return;
  setStatus(`Loading ${file.name || "image"}…`);
  try {
    if (await isProjectFile(file)) {
      await openProjectFile(file);
      return;
    }
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

function selectTool(name) {
  if (controls.disabled) return;
  setStatus(`${canvas.commands.get(name).label} tool selected.`);
  canvas.armTool(name);
}

for (const [id, name] of Object.entries(toolButtons)) {
  document.getElementById(id).addEventListener("click", (event) => {
    closeContainingMenu(event.currentTarget);
    selectTool(name);
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

const SHAPES = ["draw.line", "draw.rect", "draw.ellipse"];
let shapeCursor = 0;

function cycleShape() {
  const name = SHAPES[shapeCursor];
  shapeCursor = (shapeCursor + 1) % SHAPES.length;
  selectTool(name);
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function dialogOpen() {
  return [...document.querySelectorAll("dialog")].some((dialog) => dialog.open);
}

function runShortcut(binding) {
  if (binding.note) {
    setStatus(binding.note);
    return;
  }
  if (binding.command === "history.undo") undoEdit();
  else if (binding.command === "history.redo") redoEdit();
  else if (binding.command === "file.export") openExportDialog();
  else if (binding.command === "file.open") fileInput.click();
  else if (binding.command === "draw.pen") selectTool("draw.pen");
  else if (binding.command === "draw.shape") cycleShape();
  else if (binding.command === "image.crop") selectTool("image.crop");
}

window.addEventListener("keydown", (event) => {
  if (event.repeat || dialogOpen() || isEditableTarget(event.target)) return;
  const binding = matchShortcut(event, keymap);
  if (!binding) return;
  event.preventDefault();
  runShortcut(binding);
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

const historyList = document.getElementById("historyList");

function renderHistory(doc) {
  const { past, present, future } = doc.history;
  const steps = [];
  if (present) {
    past.forEach((entry, index) => steps.push({ entry, index, kind: "past" }));
    steps.push({ entry: present, index: past.length, kind: "present" });
    future.forEach((entry, offset) => {
      steps.push({ entry, index: past.length + 1 + offset, kind: "future" });
    });
  }
  historyList.replaceChildren();
  for (const step of steps) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-step";
    button.dataset.index = String(step.index);
    button.textContent = step.entry.label;
    if (step.kind === "present") button.setAttribute("aria-current", "step");
    if (step.kind === "future") button.dataset.future = "true";
    item.append(button);
    historyList.append(item);
  }
}

async function jumpHistory(index) {
  try {
    const entry = await canvas.jumpTo(index);
    if (entry) setStatus(`History: ${entry.label}.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

historyList.addEventListener("click", (event) => {
  const button = event.target.closest(".history-step");
  if (!button) return;
  jumpHistory(Number(button.dataset.index));
});

historyList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  const button = event.target.closest(".history-step");
  if (!button || event.target !== button) return;
  event.preventDefault();
  jumpHistory(Number(button.dataset.index));
});

function renderPanel() {
  const doc = canvas.doc;
  layersList.replaceChildren(renderRows(doc.layers, doc.activeId, 0));
  renderHistory(doc);
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
  jumpTo: canvas.jumpTo,
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

document.getElementById("downloadButton").addEventListener("click", () => {
  openExportDialog();
});

const exportDialog = document.getElementById("exportDialog");
const exportForm = document.getElementById("exportForm");
const exportFilename = document.getElementById("exportFilename");
const exportFormat = document.getElementById("exportFormat");
const exportQualityRow = document.getElementById("exportQualityRow");
const exportQuality = document.getElementById("exportQuality");
const exportQualityValue = document.getElementById("exportQualityValue");
const exportNote = document.getElementById("exportNote");
const exportError = document.getElementById("exportError");
const confirmExport = document.getElementById("confirmExport");

const EXPORT_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/x-msho": "msho",
  "application/zip": "msho",
};

const DOWNLOAD_LABELS = {
  png: "PNG",
  jpg: "JPEG",
  webp: "WebP",
  msho: "Project",
};

function filenameStem(value) {
  const trimmed = value.trim().replace(/\.[^.]+$/, "");
  const clean = trimmed.replace(/[\\/:*?"<>|]/g, "").trim();
  return clean || "edited";
}

function syncExportOptions() {
  const lossy = exportFormat.value === "image/jpeg" || exportFormat.value === "image/webp";
  exportQualityRow.hidden = !lossy;
  exportQualityValue.value = String(Math.round(Number(exportQuality.value) * 100));
  const hasProfile = Boolean(canvas.doc.profile?.name);
  exportNote.textContent = lossy && hasProfile ? "Profile not embedded." : "";
}

function openExportDialog() {
  if (!canvas.doc.hasContent) return;
  exportError.textContent = "";
  if (!exportFilename.value.trim()) exportFilename.value = "edited";
  syncExportOptions();
  exportDialog.showModal();
  exportFilename.focus();
  exportFilename.select();
}

exportFormat.addEventListener("change", syncExportOptions);
exportQuality.addEventListener("input", syncExportOptions);

for (const id of ["closeExport", "cancelExport"]) {
  document.getElementById(id).addEventListener("click", () => {
    exportDialog.close();
  });
}

exportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canvas.doc.hasContent) return;
  const format = exportFormat.value;
  const lossy = format === "image/jpeg" || format === "image/webp";
  const hasProfile = Boolean(canvas.doc.profile?.name);
  confirmExport.disabled = true;
  exportError.textContent = "";
  setStatus("Preparing export…");
  try {
    const blob =
      format === "project"
        ? await canvas.toProjectBlob()
        : await canvas.toBlob({
            type: format,
            quality: lossy ? Number(exportQuality.value) : undefined,
          });
    if (!blob) return;
    const actual = blob.type || (format === "project" ? "application/x-msho" : format);
    const fellBack = format !== "project" && actual !== format;
    const extension = EXPORT_EXTENSIONS[actual] || EXPORT_EXTENSIONS[format] || "png";
    downloadBlob(blob, `${filenameStem(exportFilename.value)}.${extension}`);
    exportDialog.close();
    const parts = [];
    if (fellBack) {
      const savedAs = DOWNLOAD_LABELS[extension] || extension.toUpperCase();
      parts.push(
        `${format === "image/webp" ? "WebP" : "That format"} is not supported here, so the file was saved as ${savedAs}.`
      );
    } else if (format === "project") {
      parts.push("Project download started.");
    } else {
      parts.push(`${DOWNLOAD_LABELS[extension] || extension.toUpperCase()} download started.`);
    }
    if (lossy && hasProfile) parts.push("Profile not embedded.");
    setStatus(parts.join(" "));
  } catch (error) {
    exportError.textContent = error.message;
    setStatus(error.message, true);
  } finally {
    confirmExport.disabled = false;
  }
});

const restoreDialog = document.getElementById("restoreDialog");
const restoreMessage = document.getElementById("restoreMessage");
const recovery = createAutosave({
  onQuotaExceeded() {
    setStatus("Autosave paused: storage is full.", true);
  },
  onError(error) {
    setStatus(error?.message || "Autosave failed.", true);
  },
});

function clockOf(savedAt) {
  const date = new Date(savedAt);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

let autosaveArmed = false;
let scheduledRevision = canvas.doc.revision;

async function persistRecovery() {
  const blob = await canvas.toProjectBlob();
  if (!blob || !canvas.doc.hasContent) return;
  const doc = canvas.doc;
  await recovery.write(blob, {
    savedAt: Date.now(),
    width: doc.width,
    height: doc.height,
    label: doc.history.present?.label ?? "Document",
  });
}

function considerAutosave() {
  if (!autosaveArmed || restoreDialog.open) return;
  const doc = canvas.doc;
  if (doc.busy || doc.revision === scheduledRevision) return;
  scheduledRevision = doc.revision;
  if (!doc.hasContent) return;
  recovery.schedule(() => persistRecovery());
}

window.addEventListener("canvasstatechange", considerAutosave);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") recovery.flush();
});

restoreDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
});

let pendingRecovery = null;

document.getElementById("confirmRestore").addEventListener("click", async () => {
  const record = pendingRecovery;
  if (!record) return;
  setStatus("Restoring autosave…");
  try {
    await canvas.loadProject(record.blob);
    pendingRecovery = null;
    restoreDialog.close();
    considerAutosave();
    await showDocument("Restored the autosaved project.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

document.getElementById("discardRestore").addEventListener("click", async () => {
  try {
    await recovery.clear();
    pendingRecovery = null;
    restoreDialog.close();
    setStatus("Discarded the autosaved project.");
  } catch (error) {
    setStatus(error.message, true);
  }
});

async function startRecovery() {
  try {
    const writer = await recovery.acquireWriter();
    await recovery.requestPersistence();
    if (!writer) {
      setStatus("Autosave is on in another tab.");
      return;
    }
    autosaveArmed = true;
    const record = await recovery.read();
    if (record && !canvas.doc.hasContent) {
      pendingRecovery = record;
      restoreMessage.textContent = `Restore work from ${clockOf(record.savedAt)}, ${record.width} × ${record.height}`;
      restoreDialog.showModal();
    }
    considerAutosave();
  } catch (error) {
    setStatus(error.message, true);
  }
}

startRecovery();

window.addEventListener("canvaserror", (event) => {
  setStatus(event.detail.message, true);
});
