import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasToBlob,
  decodeExternalImage,
  decodeLocalImage,
  downloadBlob,
  withIccProfile,
} from "../image-io.js";
import { embedIccInPng } from "../icc.js";

test("decodes a local image with createImageBitmap and disposes it", async () => {
  const bitmap = {
    closed: false,
    close() {
      this.closed = true;
    },
  };
  const result = await decodeLocalImage(
    { type: "image/png" },
    { createImageBitmap: async () => bitmap }
  );

  assert.equal(result.source, bitmap);
  assert.equal(result.method, "bitmap");
  result.dispose();
  assert.equal(bitmap.closed, true);
});

test("uses an object URL fallback and revokes it after decode", async () => {
  const revoked = [];
  const image = {
    async decode() {},
  };
  const result = await decodeLocalImage(
    { type: "image/png" },
    {
      createImageBitmap: undefined,
      createImage: () => image,
      createObjectURL: () => "blob:fixture",
      revokeObjectURL: (url) => revoked.push(url),
    }
  );

  assert.equal(image.src, "blob:fixture");
  assert.equal(result.source, image);
  assert.equal(result.method, "object-url");
  assert.deepEqual(revoked, ["blob:fixture"]);
});

test("rejects a non-image file before decoding", async () => {
  await assert.rejects(
    decodeLocalImage(
      { type: "text/plain" },
      {
        createImageBitmap: async () => {
          throw new Error("must not run");
        },
      }
    ),
    /valid image file/
  );
});

test("configures anonymous CORS for external images", async () => {
  const image = {
    async decode() {},
  };
  const result = await decodeExternalImage("https://example.test/image.png", {
    createImage: () => image,
  });

  assert.equal(image.crossOrigin, "anonymous");
  assert.equal(image.src, "https://example.test/image.png");
  assert.equal(result.source, image);
  assert.equal(result.profile, null);
  assert.equal(result.profileKnown, false);
});

test("returns a local-file recovery message for blocked URLs", async () => {
  await assert.rejects(
    decodeExternalImage("https://example.test/blocked.png", {
      createImage: () => ({
        async decode() {
          throw new Error("CORS");
        },
      }),
    }),
    /Download it and choose the local file/
  );
});

test("converts a canvas to a PNG blob", async () => {
  const blob = { type: "image/png" };
  const result = await canvasToBlob({
    toBlob(callback, type) {
      assert.equal(type, "image/png");
      callback(blob);
    },
  });
  assert.equal(result, blob);
});

test("downloads and revokes a temporary object URL", () => {
  const revoked = [];
  const anchor = {
    clicked: false,
    click() {
      this.clicked = true;
    },
  };

  const url = downloadBlob({ type: "image/png" }, "edited.png", {
    createObjectURL: () => "blob:download",
    revokeObjectURL: (value) => revoked.push(value),
    createAnchor: () => anchor,
    schedule: (callback) => callback(),
  });

  assert.equal(url, "blob:download");
  assert.equal(anchor.href, "blob:download");
  assert.equal(anchor.download, "edited.png");
  assert.equal(anchor.clicked, true);
  assert.deepEqual(revoked, ["blob:download"]);
});

function ascii(value) {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function u32(value) {
  return Uint8Array.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function chunk(type, data) {
  const body = concat([ascii(type), data]);
  return concat([u32(data.length), body, u32(crc32(body))]);
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

test("a local file with bytes keeps its profile and asks the decoder not to convert colour", async () => {
  const tag = concat([ascii("desc"), new Uint8Array(4), u32(5), ascii("sRGB"), Uint8Array.of(0)]);
  const table = concat([u32(1), ascii("desc"), new Uint8Array(8)]);
  const profile = concat([new Uint8Array(128), table, tag]);
  const view = new DataView(profile.buffer);
  view.setUint32(0, profile.length);
  view.setUint32(136, 128 + table.length);
  view.setUint32(140, tag.length);
  const ihdr = new Uint8Array(13);
  ihdr[3] = 1;
  ihdr[7] = 1;
  ihdr[8] = 8;
  const png = await embedIccInPng(
    concat([
      Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", Uint8Array.of(0)),
      chunk("IEND", new Uint8Array(0)),
    ]),
    { bytes: profile }
  );
  const seen = [];
  const bitmap = { close() {} };
  const result = await decodeLocalImage(
    {
      type: "image/png",
      arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
    },
    {
      createImageBitmap: async (source, options) => {
        seen.push({ source, options });
        return bitmap;
      },
    }
  );

  assert.equal(seen[0].source instanceof Blob, true);
  assert.deepEqual(seen[0].options, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  assert.equal(result.profileKnown, true);
  assert.equal(result.profile.name, "sRGB");
  assert.deepEqual([...result.profile.bytes], [...profile]);

  const wrapped = await withIccProfile(new Blob([png], { type: "image/png" }), result.profile);
  assert.equal(wrapped.type, "image/png");
});
