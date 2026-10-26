import assert from "node:assert/strict";
import test from "node:test";

import { embedIccInPng, extractIccProfile, isSrgbProfile } from "../icc.js";

function text(value) {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

function u32(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function pngChunk(type, data) {
  const body = concat([text(type), data]);
  return concat([Uint8Array.from(u32(data.length)), body, Uint8Array.from(u32(crc32(body)))]);
}

function concat(parts) {
  const size = parts.reduce((total, part) => total + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function barePng() {
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  ihdr[3] = 1;
  ihdr[7] = 1;
  ihdr[8] = 8;
  return concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("sRGB", Uint8Array.of(0)),
    pngChunk("IDAT", Uint8Array.of(0)),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
}

function profileWithDesc(name, type = "desc") {
  const encoded =
    type === "mluc"
      ? Uint8Array.from([...name].flatMap((character) => [character.charCodeAt(0) >> 8, character.charCodeAt(0) & 255]))
      : text(name);
  const tag =
    type === "mluc"
      ? concat([
          text("mluc"),
          new Uint8Array(4),
          Uint8Array.from(u32(1)),
          Uint8Array.from(u32(12)),
          text("enUS"),
          Uint8Array.from(u32(encoded.length)),
          Uint8Array.from(u32(28)),
          encoded,
        ])
      : concat([text("desc"), new Uint8Array(4), Uint8Array.from(u32(encoded.length + 1)), encoded, Uint8Array.of(0)]);
  const table = concat([Uint8Array.from(u32(1)), text("desc"), new Uint8Array(8)]);
  const profile = concat([new Uint8Array(128), table, tag]);
  const view = new DataView(profile.buffer);
  view.setUint32(0, profile.length);
  view.setUint32(136, 128 + table.length);
  view.setUint32(140, tag.length);
  return profile;
}

function chunkTypes(png) {
  const types = [];
  let offset = 8;
  while (offset + 8 <= png.length) {
    const length = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0);
    types.push(String.fromCharCode(...png.subarray(offset + 4, offset + 8)));
    offset += 12 + length;
    if (types.at(-1) === "IEND") break;
  }
  return types;
}

function jpegWithProfile(profile) {
  const mid = Math.ceil(profile.length / 2);
  const parts = [profile.subarray(0, mid), profile.subarray(mid)];
  const segments = parts.map((part, index) => {
    const payload = concat([text("ICC_PROFILE"), Uint8Array.of(0, index + 1, parts.length), part]);
    const marker = new Uint8Array(4 + payload.length);
    marker[0] = 0xff;
    marker[1] = 0xe2;
    marker[2] = (payload.length + 2) >> 8;
    marker[3] = (payload.length + 2) & 255;
    marker.set(payload, 4);
    return marker;
  });
  return concat([Uint8Array.of(0xff, 0xd8), segments[1], segments[0], Uint8Array.of(0xff, 0xd9)]);
}

test("a PNG profile round-trips byte for byte and keeps the chunk order", async () => {
  const profile = profileWithDesc("Adobe RGB (1998)");
  const png = await embedIccInPng(barePng(), { bytes: profile });
  const extracted = await extractIccProfile(png, "image/png");

  assert.equal(extracted.name, "Adobe RGB (1998)");
  assert.deepEqual([...extracted.bytes], [...profile]);
  assert.deepEqual(chunkTypes(png), ["IHDR", "iCCP", "IDAT", "IEND"]);
});

test("JPEG APP2 segments are joined in sequence order and an mluc name prefers en-US", async () => {
  const profile = profileWithDesc("Display P3", "mluc");
  const extracted = await extractIccProfile(jpegWithProfile(profile), "image/jpeg");
  assert.equal(extracted.name, "Display P3");
  assert.deepEqual([...extracted.bytes], [...profile]);
});

test("a file without a profile and an sRGB name are reported plainly", async () => {
  assert.equal(await extractIccProfile(barePng(), "image/png"), null);
  assert.equal(await extractIccProfile(Uint8Array.of(0, 1, 2), "image/gif"), null);
  assert.equal(isSrgbProfile("sRGB IEC61966-2.1"), true);
  assert.equal(isSrgbProfile("Adobe RGB (1998)"), false);
});
