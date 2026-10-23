import assert from "node:assert/strict";
import test from "node:test";

import {
  canvasToBlob,
  decodeExternalImage,
  decodeLocalImage,
  downloadBlob,
} from "../image-io.js";

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
