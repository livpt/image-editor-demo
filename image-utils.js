export function mapPointToCanvas(clientX, clientY, rect, width, height) {
  if (!rect.width || !rect.height || !width || !height) {
    return { x: 0, y: 0 };
  }

  return {
    x: ((clientX - rect.left) * width) / rect.width,
    y: ((clientY - rect.top) * height) / rect.height,
  };
}

export function normalizeRect(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

export function createFrameScheduler(requestFrame, cancelFrame) {
  let frameId = null;
  let callback = null;

  function flush() {
    if (frameId === null) return;
    cancelFrame(frameId);
    frameId = null;
    const next = callback;
    callback = null;
    next?.();
  }

  return {
    schedule(next) {
      callback = next;
      if (frameId !== null) return;
      frameId = requestFrame(() => {
        frameId = null;
        const scheduled = callback;
        callback = null;
        scheduled?.();
      });
    },
    flush,
    cancel() {
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
      callback = null;
    },
    get pending() {
      return frameId !== null;
    },
  };
}

export function parseDimension(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.max(1, Math.round(number));
}

export function validateDimensions(width, height) {
  const parsedWidth = parseDimension(width);
  const parsedHeight = parseDimension(height);
  if (parsedWidth === null || parsedHeight === null) return null;
  return { width: parsedWidth, height: parsedHeight };
}

export function scaleDimension(value, ratio, dimension) {
  const parsed = parseDimension(value);
  if (parsed === null || !Number.isFinite(ratio) || ratio <= 0) return null;
  return dimension === "width"
    ? Math.max(1, Math.round(parsed / ratio))
    : Math.max(1, Math.round(parsed * ratio));
}

export function grayscalePixels(pixels) {
  for (let i = 0; i < pixels.length; i += 4) {
    const value = Math.round(
      0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]
    );
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
  }
}

export function thresholdPixels(pixels, threshold = 180) {
  for (let i = 0; i < pixels.length; i += 4) {
    const value =
      0.2126 * pixels[i] +
        0.7152 * pixels[i + 1] +
        0.0722 * pixels[i + 2] >=
      threshold
        ? 255
        : 0;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
  }
}

export function sepiaPixels(pixels) {
  for (let i = 0; i < pixels.length; i += 4) {
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    pixels[i] = red * 0.393 + green * 0.769 + blue * 0.189;
    pixels[i + 1] = red * 0.349 + green * 0.686 + blue * 0.168;
    pixels[i + 2] = red * 0.272 + green * 0.534 + blue * 0.131;
  }
}

export function invertPixels(pixels) {
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 255 - pixels[i];
    pixels[i + 1] = 255 - pixels[i + 1];
    pixels[i + 2] = 255 - pixels[i + 2];
  }
}

export const pixelTransformations = {
  grayscale: grayscalePixels,
  threshold: thresholdPixels,
  sepia: sepiaPixels,
  invert: invertPixels,
};
