const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const DROPPED_PNG_CHUNKS = new Set(["iCCP", "sRGB", "gAMA", "cHRM"]);

function latin1(bytes, offset, length) {
  let text = "";
  for (let index = 0; index < length; index += 1) text += String.fromCharCode(bytes[offset + index]);
  return text;
}

function readU32(bytes, offset) {
  return (
    ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>>
    0
  );
}

function writeU32(bytes, offset, value) {
  bytes[offset] = (value >>> 24) & 255;
  bytes[offset + 1] = (value >>> 16) & 255;
  bytes[offset + 2] = (value >>> 8) & 255;
  bytes[offset + 3] = value & 255;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
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

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function utf16be(bytes, offset, length) {
  let text = "";
  for (let index = 0; index + 1 < length; index += 2) {
    text += String.fromCharCode((bytes[offset + index] << 8) | bytes[offset + index + 1]);
  }
  return text;
}

function descriptionName(tag) {
  if (tag.length < 12) return null;
  const type = latin1(tag, 0, 4);
  if (type === "desc") {
    const length = readU32(tag, 8);
    if (length < 1 || 12 + length > tag.length) return null;
    const text = latin1(tag, 12, length - 1).replace(/\0/g, "").trim();
    return text || null;
  }
  if (type === "mluc") {
    const records = readU32(tag, 8);
    const recordSize = readU32(tag, 12);
    let fallback = null;
    for (let index = 0; index < records; index += 1) {
      const record = 16 + index * recordSize;
      if (record + 12 > tag.length) break;
      const language = latin1(tag, record, 2);
      const country = latin1(tag, record + 2, 2);
      const length = readU32(tag, record + 4);
      const offset = readU32(tag, record + 8);
      if (offset + length > tag.length) continue;
      const text = utf16be(tag, offset, length).trim();
      if (!text) continue;
      if (!fallback) fallback = text;
      if (language === "en" && country === "US") return text;
    }
    return fallback;
  }
  return null;
}

function profileName(profile) {
  if (profile.length < 132) return null;
  const count = readU32(profile, 128);
  for (let index = 0; index < count; index += 1) {
    const entry = 132 + index * 12;
    if (entry + 12 > profile.length) break;
    if (latin1(profile, entry, 4) !== "desc") continue;
    const offset = readU32(profile, entry + 4);
    const size = readU32(profile, entry + 8);
    if (offset + size > profile.length) continue;
    const name = descriptionName(profile.subarray(offset, offset + size));
    if (name) return name;
  }
  return null;
}

function namedProfile(bytes, fallback) {
  return { name: profileName(bytes) || fallback, bytes };
}

function isPng(bytes) {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function pngChunks(bytes) {
  const chunks = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readU32(bytes, offset);
    const type = latin1(bytes, offset + 4, 4);
    const start = offset + 8;
    const data = bytes.subarray(start, start + length);
    offset = start + length + 4;
    chunks.push({ type, data });
    if (type === "IEND") break;
  }
  return chunks;
}

async function profileFromPng(bytes) {
  for (const chunk of pngChunks(bytes)) {
    if (chunk.type !== "iCCP") continue;
    const separator = chunk.data.indexOf(0);
    if (separator < 1 || chunk.data[separator + 1] !== 0) continue;
    const keyword = latin1(chunk.data, 0, separator);
    try {
      const profile = await inflate(chunk.data.subarray(separator + 2));
      return namedProfile(profile, keyword || "Embedded profile");
    } catch {
      return null;
    }
  }
  return null;
}

function startsWithIcc(bytes) {
  return latin1(bytes, 0, 11) === "ICC_PROFILE" && bytes[11] === 0;
}

function profileFromJpeg(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const parts = [];
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    const payload = bytes.subarray(offset + 2, offset + length);
    if (marker === 0xe2 && payload.length > 14 && startsWithIcc(payload)) {
      parts.push({ sequence: payload[12], data: payload.subarray(14) });
    }
    offset += length;
  }
  if (!parts.length) return null;
  parts.sort((left, right) => left.sequence - right.sequence);
  return namedProfile(concat(parts.map((part) => part.data)), "Embedded profile");
}

export async function extractIccProfile(bytes, mimeType) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (mimeType === "image/png" || isPng(data)) return profileFromPng(data);
  if (mimeType === "image/jpeg" || (data[0] === 0xff && data[1] === 0xd8)) return profileFromJpeg(data);
  return null;
}

function pngChunk(type, data) {
  const body = new Uint8Array(4 + data.length);
  for (let index = 0; index < 4; index += 1) body[index] = type.charCodeAt(index);
  body.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  writeU32(out, 0, data.length);
  out.set(body, 4);
  writeU32(out, 8 + data.length, crc32(body));
  return out;
}

export async function embedIccInPng(pngBytes, profile) {
  const png = pngBytes instanceof Uint8Array ? pngBytes : new Uint8Array(pngBytes);
  if (!profile?.bytes || !isPng(png)) return png;
  const compressed = await deflate(profile.bytes);
  const keyword = "ICC Profile";
  const payload = new Uint8Array(keyword.length + 2 + compressed.length);
  for (let index = 0; index < keyword.length; index += 1) payload[index] = keyword.charCodeAt(index);
  payload[keyword.length + 1] = 0;
  payload.set(compressed, keyword.length + 2);
  const embedded = pngChunk("iCCP", payload);
  const parts = [Uint8Array.from(PNG_SIGNATURE)];
  let inserted = false;
  for (const chunk of pngChunks(png)) {
    if (DROPPED_PNG_CHUNKS.has(chunk.type)) continue;
    if (!inserted && chunk.type !== "IHDR") {
      parts.push(embedded);
      inserted = true;
    }
    parts.push(pngChunk(chunk.type, chunk.data));
    if (chunk.type === "IHDR" && !inserted) {
      parts.push(embedded);
      inserted = true;
    }
  }
  return concat(parts);
}

export function isSrgbProfile(name) {
  return typeof name === "string" && /srgb/i.test(name);
}
