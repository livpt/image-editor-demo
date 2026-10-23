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
import { filters } from "./processing-utils.js";

const controls = document.getElementById("controls");
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
    await canvas.loadImage(decoded.source);
    dragHelper.classList.add("invisible");
    controls.disabled = false;
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

document.getElementById("ellipseDraw").addEventListener("click", (event) => {
  closeContainingMenu(event.currentTarget);
  setStatus("Ellipse tool selected.");
  canvas.performWhilePointerDown(() => {
    let moved = false;
    return {
      onmousemove: ({ start, point, context }) => {
        const radiusX = Math.abs(point.x - start.x) / 2;
        const radiusY = Math.abs(point.y - start.y) / 2;
        moved = radiusX > 0 && radiusY > 0;
        if (!moved) return;
        context.beginPath();
        context.ellipse(
          (start.x + point.x) / 2,
          (start.y + point.y) / 2,
          radiusX,
          radiusY,
          0,
          0,
          Math.PI * 2
        );
        context.stroke();
      },
      onmouseup: () => moved,
    };
  });
});

document.getElementById("rectangleDraw").addEventListener("click", (event) => {
  closeContainingMenu(event.currentTarget);
  setStatus("Rectangle tool selected.");
  canvas.performWhilePointerDown(() => {
    let moved = false;
    return {
      onmousemove: ({ start, point, context }) => {
        const width = point.x - start.x;
        const height = point.y - start.y;
        moved = width !== 0 && height !== 0;
        if (moved) context.strokeRect(start.x, start.y, width, height);
      },
      onmouseup: () => moved,
    };
  });
});

document.getElementById("penDraw").addEventListener("click", (event) => {
  closeContainingMenu(event.currentTarget);
  setStatus("Pen tool selected.");
  canvas.performWhilePointerDown(() => {
    let lastPoint;
    let moved = false;
    return {
      clearEachFrame: false,
      onmousedown: ({ point }) => {
        lastPoint = point;
      },
      onmousemove: ({ points, context }) => {
        for (const point of points) {
          if (point.x === lastPoint.x && point.y === lastPoint.y) continue;
          context.beginPath();
          context.moveTo(lastPoint.x, lastPoint.y);
          context.lineTo(point.x, point.y);
          context.stroke();
          lastPoint = point;
          moved = true;
        }
      },
      onmouseup: () => moved,
    };
  });
});

document.getElementById("lineDraw").addEventListener("click", (event) => {
  closeContainingMenu(event.currentTarget);
  setStatus("Line tool selected.");
  canvas.performWhilePointerDown(() => {
    let moved = false;
    return {
      onmousemove: ({ start, point, context }) => {
        moved = point.x !== start.x || point.y !== start.y;
        if (!moved) return;
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(point.x, point.y);
        context.stroke();
      },
      onmouseup: () => moved,
    };
  });
});

document.getElementById("cropButton").addEventListener("click", () => {
  setStatus("Crop tool selected.");
  canvas.performWhilePointerDown(() => ({
    commitOverlay: false,
    onmousemove: ({ start, point, context }) => {
      const width = point.x - start.x;
      const height = point.y - start.y;
      if (width && height) context.strokeRect(start.x, start.y, width, height);
    },
    onmouseup: ({ start, point }) => canvas.crop(start, point),
  }));
});

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
  const size = canvas.getSize();
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
    await canvas.resizeImage(dimensions);
    resolutionDialog.close();
    setStatus(`Resized to ${dimensions.width} × ${dimensions.height}.`);
  } catch (error) {
    resizeError.textContent = error.message;
  } finally {
    saveResolution.disabled = false;
  }
});

for (const [name, filter] of Object.entries(filters)) {
  document.getElementById(name).addEventListener("click", async (event) => {
    closeContainingMenu(event.currentTarget);
    const label = event.currentTarget.textContent.trim();
    setStatus(`Applying ${label.toLowerCase()}…`);
    const started = performance.now();
    try {
      const result = await canvas.applyFilter(filter);
      const duration = Math.round((performance.now() - started) * 10) / 10;
      setStatus(
        `${label} applied in ${duration} ms${result.accelerated ? " using the canvas filter path" : ""}.`
      );
    } catch (error) {
      setStatus(error.message, true);
    }
  });
}

document.getElementById("redoButton").addEventListener("click", () => canvas.redo());
document.getElementById("undoButton").addEventListener("click", () => canvas.undo());

document.getElementById("downloadButton").addEventListener("click", async () => {
  if (canvas.isEmpty()) return;
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
