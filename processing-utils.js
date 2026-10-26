import {
  brightnessPixels,
  grayscalePixels,
  invertPixels,
  sepiaPixels,
  thresholdPixels,
} from "./image-utils.js";

export const filters = {
  grayscale: { transform: grayscalePixels },
  threshold: { transform: thresholdPixels },
  sepia: { transform: sepiaPixels },
  invert: { transform: invertPixels },
  brightness: {
    transform: brightnessPixels,
    params: { amount: { type: "integer", min: -100, max: 100 } },
  },
};
