import {
  grayscalePixels,
  invertPixels,
  sepiaPixels,
  thresholdPixels,
} from "./image-utils.js";

export const filters = {
  grayscale: {
    canvasFilter: "grayscale(1)",
    transform: grayscalePixels,
  },
  threshold: {
    canvasFilter: null,
    transform: thresholdPixels,
  },
  sepia: {
    canvasFilter: "sepia(1)",
    transform: sepiaPixels,
  },
  invert: {
    canvasFilter: "invert(1)",
    transform: invertPixels,
  },
};

export function enableCanvasFilter(context, filter) {
  if (!filter || !("filter" in context)) return false;
  const previous = context.filter;
  context.filter = filter;
  const enabled = context.filter !== previous || context.filter === filter;
  if (!enabled) context.filter = previous;
  return enabled;
}
