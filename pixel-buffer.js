import { CommandError } from "./commands.js";

function ownedFloats(length) {
  try {
    return new Float32Array(length);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new CommandError("invalid", "This image is too large for high-precision editing.");
    }
    throw error;
  }
}

export function allocate(width, height) {
  return ownedFloats(width * height * 4);
}

export function ingest(imageData) {
  const source = imageData.data;
  const buffer = ownedFloats(source.length);
  for (let index = 0; index < source.length; index += 1) {
    buffer[index] = source[index] / 255;
  }
  return buffer;
}

function byte(value) {
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

export function quantize(buffer, width, height) {
  const data = new Uint8ClampedArray(buffer.length);
  for (let index = 0; index < buffer.length; index += 1) data[index] = byte(buffer[index]);
  return { data, width, height };
}

function samePixel(before, after, index) {
  return (
    before[index] === after[index] &&
    before[index + 1] === after[index + 1] &&
    before[index + 2] === after[index + 2] &&
    before[index + 3] === after[index + 3]
  );
}

export function mergePainted(buffer, beforeImageData, afterImageData) {
  const before = beforeImageData.data;
  const after = afterImageData.data;
  const next = buffer.slice();
  for (let index = 0; index < before.length; index += 4) {
    if (samePixel(before, after, index)) continue;
    next[index] = after[index] / 255;
    next[index + 1] = after[index + 1] / 255;
    next[index + 2] = after[index + 2] / 255;
    next[index + 3] = after[index + 3] / 255;
  }
  return next;
}

export function cropBuffer(buffer, width, x, y, cropWidth, cropHeight) {
  const next = ownedFloats(cropWidth * cropHeight * 4);
  for (let row = 0; row < cropHeight; row += 1) {
    const from = ((y + row) * width + x) * 4;
    next.set(buffer.subarray(from, from + cropWidth * 4), row * cropWidth * 4);
  }
  return next;
}
