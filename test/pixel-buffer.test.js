import assert from "node:assert/strict";
import test from "node:test";

import { brightnessPixels } from "../image-utils.js";
import { CommandError } from "../commands.js";
import { allocate, cropBuffer, ingest, mergePainted, quantize } from "../pixel-buffer.js";

function imageData(bytes, width, height) {
  return { data: Uint8ClampedArray.from(bytes), width, height };
}

test("ingest and quantize keep every 8-bit channel", () => {
  const bytes = [];
  for (let value = 0; value < 256; value += 1) bytes.push(value, value, value, value);
  const roundTrip = quantize(ingest(imageData(bytes, 16, 16)), 16, 16);
  assert.deepEqual([...roundTrip.data], bytes);
});

test("mergePainted replaces only the pixels a stroke changed", () => {
  const original = new Float32Array([0.2, 0.4, 0.6, 0.8, 0.1, 0.3, 0.5, 0.7]);
  const kept = original.slice();
  const before = imageData([51, 102, 153, 204, 26, 77, 128, 179], 2, 1);
  const after = imageData([255, 0, 0, 255, 26, 77, 128, 179], 2, 1);
  const merged = mergePainted(original, before, after);

  assert.deepEqual([...merged.subarray(0, 4)], [1, 0, 0, 1]);
  assert.deepEqual([...merged.subarray(4)], [...kept.subarray(4)]);
  assert.deepEqual([...original], [...kept]);
});

test("cropBuffer copies the requested rectangle", () => {
  const buffer = new Float32Array(16);
  buffer[12] = 0.25;
  buffer[13] = 0.5;
  buffer[14] = 0.75;
  buffer[15] = 1;
  const cropped = cropBuffer(buffer, 2, 1, 1, 1, 1);
  assert.deepEqual([...cropped], [0.25, 0.5, 0.75, 1]);
});

test("brightness down and up quantizes back to the gradient with no missing levels", () => {
  const bytes = [];
  for (let value = 0; value < 256; value += 1) bytes.push(value, value, value, 255);
  const buffer = ingest(imageData(bytes, 256, 1));
  brightnessPixels(buffer, -50);
  brightnessPixels(buffer, 50);
  const roundTrip = [...quantize(buffer, 256, 1).data];
  assert.deepEqual(roundTrip, bytes);

  const eightBit = Uint8ClampedArray.from(bytes);
  for (const amount of [-50, 50]) {
    const delta = Math.round((amount / 100) * 255);
    for (let index = 0; index < eightBit.length; index += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        eightBit[index + channel] = Math.min(255, Math.max(0, eightBit[index + channel] + delta));
      }
    }
  }
  assert.notDeepEqual([...eightBit], bytes);
  const levels = new Set();
  for (let index = 0; index < eightBit.length; index += 4) levels.add(eightBit[index]);
  assert.ok(levels.size < 256);
});

test("allocate refuses a buffer the runtime cannot create", () => {
  assert.throws(() => allocate(2 ** 30, 2 ** 30), CommandError);
});
