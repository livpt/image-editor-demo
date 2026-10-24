import assert from "node:assert/strict";
import test from "node:test";

// canvas.js binds the page canvases at import, so the stand-in DOM has to exist first.
const processed = createSurface();
const surfaces = new Map([
  ["imageProcessed", processed],
  ["imageOverlay", createSurface()],
  ["canvasStack", { hidden: true, style: {} }],
]);

globalThis.document = {
  getElementById(id) {
    return surfaces.get(id) ?? null;
  },
  createElement(tag) {
    if (tag !== "canvas") throw new Error(`unexpected element ${tag}`);
    return createSurface();
  },
};

globalThis.HTMLElement = class HTMLElement {};
globalThis.HTMLButtonElement = class HTMLButtonElement extends HTMLElement {};

globalThis.window = {
  dispatchEvent() {},
  requestAnimationFrame() {
    return 0;
  },
  cancelAnimationFrame() {},
};

let bitmapGate = Promise.resolve();
globalThis.createImageBitmap = async (source) => {
  await bitmapGate;
  const image = readPixels(source);
  return {
    width: image.width,
    height: image.height,
    rgba: new Uint8ClampedArray(image.rgba),
    close() {},
  };
};

const { canvas } = await import("../canvas.js");

function solid(r, g, b, a = 255) {
  return { width: 1, height: 1, rgba: new Uint8ClampedArray([r, g, b, a]) };
}

function pixels() {
  return [...processed.rgba];
}

async function settleMicrotasks() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

test("toBlob exports an opacity preview that has not started committing", async () => {
  await canvas.load(solid(255, 0, 0));
  canvas.previewOpacity(1, 40);

  const preview = pixels();
  const exported = await canvas.toBlob();

  assert.equal(preview[0], 255);
  assert.ok(preview[3] > 0 && preview[3] < 255);
  assert.deepEqual([...exported.rgba], preview);
});

test("toBlob exports the opacity being committed, not the composite cancelPreview restored", async () => {
  await canvas.load(solid(255, 0, 0));
  canvas.previewOpacity(1, 40);
  const preview = pixels();
  assert.equal(preview[0], 255);
  assert.ok(preview[3] > 0 && preview[3] < 255);

  let releaseBitmaps = () => {};
  bitmapGate = new Promise((resolve) => {
    releaseBitmaps = resolve;
  });
  try {
    const committing = canvas.run("layer.opacity", { id: 1, opacity: 40 });
    // run() drops the preview before freezeDocument paints the new composite.
    assert.deepEqual(pixels(), [255, 0, 0, 255]);

    let exported = null;
    const pending = canvas.toBlob().then((blob) => {
      exported = [...blob.rgba];
    });
    await settleMicrotasks();
    assert.equal(exported, null);

    releaseBitmaps();
    await pending;
    await committing;
    assert.deepEqual(exported, preview);
  } finally {
    releaseBitmaps();
    bitmapGate = Promise.resolve();
  }
});

function readPixels(source) {
  if (!source?.rgba || !Number.isInteger(source.width) || !Number.isInteger(source.height)) {
    throw new Error("image source has no pixels");
  }
  return source;
}

function compositeSourceOver(dst, src, alpha) {
  const srcA = (src[3] / 255) * alpha;
  const dstA = dst[3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) {
    dst[0] = dst[1] = dst[2] = dst[3] = 0;
    return;
  }
  for (let channel = 0; channel < 3; channel += 1) {
    dst[channel] = Math.round((src[channel] * srcA + dst[channel] * dstA * (1 - srcA)) / outA);
  }
  dst[3] = Math.round(outA * 255);
}

function createSurface() {
  const surface = {
    rgba: new Uint8ClampedArray(0),
    alpha: 1,
    composite: "source-over",
    _width: 0,
    _height: 0,
    hidden: false,
    style: {},
    get width() {
      return surface._width;
    },
    set width(value) {
      surface._width = value;
      resize(surface);
    },
    get height() {
      return surface._height;
    },
    set height(value) {
      surface._height = value;
      resize(surface);
    },
    getContext() {
      return surface.context;
    },
    toBlob(callback, type) {
      callback({ rgba: new Uint8ClampedArray(surface.rgba), type });
    },
  };
  surface.context = {
    clearRect() {
      surface.rgba.fill(0);
    },
    drawImage(source, dx = 0, dy = 0, dw, dh) {
      const src = readPixels(source);
      const destW = dw ?? src.width;
      const destH = dh ?? src.height;
      if (dx !== 0 || dy !== 0 || destW !== src.width || destH !== src.height) {
        throw new Error("drawImage scale is not supported in this harness");
      }
      if (destW !== surface._width || destH !== surface._height) {
        throw new Error("drawImage destination size mismatch");
      }
      if (surface.composite !== "source-over") {
        throw new Error(`unsupported composite ${surface.composite}`);
      }
      for (let i = 0; i < surface.rgba.length; i += 4) {
        compositeSourceOver(surface.rgba.subarray(i, i + 4), src.rgba.subarray(i, i + 4), surface.alpha);
      }
    },
    getImageData(x, y, w, h) {
      const data = new Uint8ClampedArray(w * h * 4);
      for (let row = 0; row < h; row += 1) {
        for (let col = 0; col < w; col += 1) {
          const src = ((y + row) * surface._width + (x + col)) * 4;
          data.set(surface.rgba.subarray(src, src + 4), (row * w + col) * 4);
        }
      }
      return { data, width: w, height: h };
    },
    get globalAlpha() {
      return surface.alpha;
    },
    set globalAlpha(value) {
      surface.alpha = value;
    },
    get globalCompositeOperation() {
      return surface.composite;
    },
    set globalCompositeOperation(value) {
      surface.composite = value;
    },
  };
  return surface;
}

function resize(surface) {
  surface.rgba = new Uint8ClampedArray(surface._width * surface._height * 4);
  surface.alpha = 1;
  surface.composite = "source-over";
}
