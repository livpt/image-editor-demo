import assert from "node:assert/strict";
import test from "node:test";

import {
  createFrameScheduler,
  grayscalePixels,
  invertPixels,
  mapPointToCanvas,
  normalizeRect,
  scaleDimension,
  sepiaPixels,
  thresholdPixels,
  validateDimensions,
} from "../image-utils.js";

test("coalesces scheduled work into one frame using the latest callback", () => {
  const frames = [];
  const cancelled = [];
  const calls = [];
  const scheduler = createFrameScheduler(
    (callback) => {
      frames.push(callback);
      return frames.length;
    },
    (id) => cancelled.push(id)
  );

  scheduler.schedule(() => calls.push("first"));
  scheduler.schedule(() => calls.push("latest"));

  assert.equal(frames.length, 1);
  frames[0]();
  assert.deepEqual(calls, ["latest"]);
  assert.deepEqual(cancelled, []);
  assert.equal(scheduler.pending, false);
});

test("maps displayed coordinates to intrinsic canvas coordinates", () => {
  const point = mapPointToCanvas(
    250,
    150,
    { left: 50, top: 50, width: 400, height: 200 },
    4000,
    2000
  );
  assert.deepEqual(point, { x: 2000, y: 1000 });
});

test("returns a safe origin for an empty display or canvas", () => {
  assert.deepEqual(
    mapPointToCanvas(20, 20, { left: 0, top: 0, width: 0, height: 20 }, 10, 10),
    { x: 0, y: 0 }
  );
});

test("normalizes rectangles in every drag direction", () => {
  const expected = { x: 10, y: 20, width: 30, height: 40 };
  assert.deepEqual(normalizeRect({ x: 10, y: 20 }, { x: 40, y: 60 }), expected);
  assert.deepEqual(normalizeRect({ x: 40, y: 20 }, { x: 10, y: 60 }), expected);
  assert.deepEqual(normalizeRect({ x: 10, y: 60 }, { x: 40, y: 20 }), expected);
  assert.deepEqual(normalizeRect({ x: 40, y: 60 }, { x: 10, y: 20 }), expected);
});

test("validates and rounds positive dimensions", () => {
  assert.deepEqual(validateDimensions("800", 600.4), {
    width: 800,
    height: 600,
  });
  for (const value of ["", 0, -1, Infinity, NaN, "not-a-number"]) {
    assert.equal(validateDimensions(value, 100), null);
    assert.equal(validateDimensions(100, value), null);
  }
});

test("derives ratio-preserving dimensions", () => {
  assert.equal(scaleDimension(800, 4 / 3, "width"), 600);
  assert.equal(scaleDimension(600, 4 / 3, "height"), 800);
  assert.equal(scaleDimension(0, 4 / 3, "width"), null);
});

test("pixel transformations preserve alpha", () => {
  const transforms = [
    grayscalePixels,
    thresholdPixels,
    sepiaPixels,
    invertPixels,
  ];
  for (const transform of transforms) {
    const pixels = new Uint8ClampedArray([40, 120, 200, 73]);
    transform(pixels);
    assert.equal(pixels[3], 73);
  }
});

test("grayscale uses luminance-weighted channels", () => {
  const pixels = new Uint8ClampedArray([100, 150, 200, 255]);
  grayscalePixels(pixels);
  assert.deepEqual([...pixels], [143, 143, 143, 255]);
});

test("threshold produces black and white values", () => {
  const pixels = new Uint8ClampedArray([
    10, 10, 10, 12, 250, 250, 250, 34,
  ]);
  thresholdPixels(pixels);
  assert.deepEqual([...pixels], [0, 0, 0, 12, 255, 255, 255, 34]);
});

test("sepia and invert produce expected representative channels", () => {
  const sepia = new Uint8ClampedArray([100, 150, 200, 44]);
  sepiaPixels(sepia);
  assert.deepEqual([...sepia], [192, 171, 134, 44]);

  const inverted = new Uint8ClampedArray([10, 20, 30, 55]);
  invertPixels(inverted);
  assert.deepEqual([...inverted], [245, 235, 225, 55]);
});
