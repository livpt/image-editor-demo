import { embedIccInPng, extractIccProfile } from "./icc.js";

const DECODE_OPTIONS = { colorSpaceConversion: "none", premultiplyAlpha: "none" };

function browserEnvironment(overrides = {}) {
  return {
    createImageBitmap: globalThis.createImageBitmap?.bind(globalThis),
    createImage: () => new Image(),
    createObjectURL: URL.createObjectURL.bind(URL),
    revokeObjectURL: URL.revokeObjectURL.bind(URL),
    createAnchor: () => document.createElement("a"),
    schedule: (callback) => setTimeout(callback, 1000),
    ...overrides,
  };
}

async function waitForImage(image) {
  if (typeof image.decode === "function") {
    await image.decode();
    return;
  }

  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error("The image could not be decoded."));
  });
}

export async function decodeLocalImage(file, overrides) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Choose a valid image file.");
  }

  const environment = browserEnvironment(overrides);
  let profile = null;
  const profileKnown = true;
  let bitmapSource = file;
  if (typeof file.arrayBuffer === "function") {
    const bytes = new Uint8Array(await file.arrayBuffer());
    profile = await extractIccProfile(bytes, file.type);
    bitmapSource = new Blob([bytes], { type: file.type });
  }

  if (typeof environment.createImageBitmap === "function") {
    const source = await environment.createImageBitmap(bitmapSource, DECODE_OPTIONS);
    return {
      source,
      method: "bitmap",
      profile,
      profileKnown,
      dispose: () => source.close?.(),
    };
  }

  const url = environment.createObjectURL(bitmapSource);
  try {
    const source = environment.createImage();
    source.src = url;
    await waitForImage(source);
    return { source, method: "object-url", profile, profileKnown, dispose: () => {} };
  } finally {
    environment.revokeObjectURL(url);
  }
}

export async function decodeExternalImage(url, overrides) {
  if (!url) throw new Error("No image URL was provided.");

  const environment = browserEnvironment(overrides);
  const source = environment.createImage();
  source.crossOrigin = "anonymous";
  source.src = url;

  try {
    await waitForImage(source);
  } catch {
    throw new Error(
      "This image URL cannot be edited. Download it and choose the local file instead."
    );
  }

  return { source, method: "external-url", profile: null, profileKnown: false, dispose: () => {} };
}

export function canvasToBlob(canvas, type = "image/png") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The image could not be exported."));
    }, type);
  });
}

export async function withIccProfile(blob, profile) {
  if (!profile?.bytes) return blob;
  const png = new Uint8Array(await blob.arrayBuffer());
  const embedded = await embedIccInPng(png, profile);
  return new Blob([embedded], { type: "image/png" });
}

export function downloadBlob(blob, filename, overrides) {
  const environment = browserEnvironment(overrides);
  const url = environment.createObjectURL(blob);
  const anchor = environment.createAnchor();
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  environment.schedule(() => environment.revokeObjectURL(url));
  return url;
}
