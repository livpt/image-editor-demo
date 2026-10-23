import { canvas } from "./canvas.js";

// Load image drag and drop
document.getElementById("dragAndDropZone").addEventListener("dragover", (e) => {
  e.preventDefault();
});

document.getElementById("dragAndDropZone").addEventListener("drop", (e) => {
  e.preventDefault();

  function loadImage(src) {
    const image = new Image();
    image.src = src;
    image.onload = () => {
      document.querySelector(".drag-helper").classList.add("invisible");
      document.getElementById("controls").classList.remove("no-events");
      canvas.loadImage(image);
    };
  }

  const file = e.dataTransfer.files[0];
  if (file) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      loadImage(e.target.result);
    };
  }

  const url = e.dataTransfer.getData("url");
  if (url) loadImage(url);
});

// Drawings
document.getElementById("ellipseDraw").addEventListener("click", () => {
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

document.getElementById("rectangleDraw").addEventListener("click", () => {
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

document.getElementById("penDraw").addEventListener("click", () => {
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

document.getElementById("lineDraw").addEventListener("click", () => {
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

// Crop
document.getElementById("cropButton").addEventListener("click", () => {
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

// Resize modal
const modal = new bootstrap.Modal(document.getElementById("resolutionModal"));
document
  .getElementById("resolutionModal")
  .addEventListener("show.bs.modal", () => {
    const image = new Image();
    const widthInput = document.getElementById("width-size");
    const heightInput = document.getElementById("height-size");
    const ratioCheckbox = document.getElementById("checkbox-img-ratio");

    // Update values with current resolution
    const canvasSize = canvas.getSize();
    widthInput.value = canvasSize.width;
    heightInput.value = canvasSize.height;

    // Keep image ratio if selected
    const ratio = canvasSize.width / canvasSize.height;
    widthInput.addEventListener("keyup", () => {
      if (!ratioCheckbox.checked) return;
      heightInput.value = widthInput.value / ratio;
    });
    heightInput.addEventListener("keyup", () => {
      if (!ratioCheckbox.checked) return;
      widthInput.value = heightInput.value * ratio;
    });

    // Redraw image with new resolution values
    document.getElementById("saveResolution").addEventListener("click", () => {
      image.src = canvas.getOctetStream();
      image.width = widthInput.value;
      image.height = heightInput.value;
      image.onload = () =>
        canvas.drawImage(image, {
          width: Number(widthInput.value),
          height: Number(heightInput.value),
        });
      modal.hide();
    });
  });

// Image filters
document.getElementById("grayscale").addEventListener("click", () => {
  canvas.applyPixelTransformation((pixels) => {
    for (let i = 0; i < pixels.length; i += 4)
      pixels[i] =
        pixels[i + 1] =
        pixels[i + 2] =
          Math.round((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3);
  });
});

document.getElementById("threshold").addEventListener("click", () => {
  canvas.applyPixelTransformation((pixels) => {
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = getRGB(pixels, i);
      const v = 0.2126 * r + 0.7152 * g + 0.0722 * b >= 180 ? 255 : 0;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = v;
    }
  });
});

document.getElementById("sephia").addEventListener("click", () => {
  canvas.applyPixelTransformation((pixels) => {
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = getRGB(pixels, i);
      pixels[i] = r * 0.393 + g * 0.769 + b * 0.189;
      pixels[i + 1] = r * 0.349 + g * 0.686 + b * 0.168;
      pixels[i + 2] = r * 0.272 + g * 0.534 + b * 0.131;
    }
  });
});

document.getElementById("invert").addEventListener("click", () => {
  canvas.applyPixelTransformation((pixels) => {
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = getRGB(pixels, i);
      pixels[i] = 255 - r;
      pixels[i + 1] = 255 - g;
      pixels[i + 2] = 255 - b;
    }
  });
});

function getRGB(pixel, position) {
  return [pixel[position], pixel[position + 1], pixel[position + 2]];
}

// History buttons
document
  .getElementById("redoButton")
  .addEventListener("click", () => canvas.redo());
document
  .getElementById("undoButton")
  .addEventListener("click", () => canvas.undo());

// Download
document.getElementById("linkDownload").addEventListener("click", (e) => {
  if (canvas.isEmpty()) e.preventDefault();
  e.currentTarget.setAttribute("href", canvas.getOctetStream());
});
