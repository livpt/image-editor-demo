import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const VERSION = 1;

function copyBytes(bytes) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function floatBytes(buffer) {
  if (!(buffer instanceof Float32Array)) {
    throw new Error("A float layer must be a Float32Array.");
  }
  return copyBytes(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
}

function floatsFrom(bytes) {
  if (bytes.byteLength % 4 !== 0) throw new Error("A float layer is truncated.");
  return new Float32Array(copyBytes(bytes).buffer);
}

function serializeNode(node, files) {
  if (!node || (node.kind !== "pixel" && node.kind !== "group")) {
    throw new Error("A project layer has an unknown kind.");
  }
  if (!Number.isInteger(node.id) || node.id < 1) throw new Error("A project layer has an invalid id.");
  const stored = {
    kind: node.kind,
    id: node.id,
    name: node.name,
    visible: node.visible !== false,
    opacity: node.opacity ?? 100,
    blend: node.blend ?? "normal",
  };
  if (node.kind === "group") {
    if (!Array.isArray(node.children)) throw new Error(`Layer ${node.id} is a group with no children.`);
    stored.children = node.children.map((child) => serializeNode(child, files));
    return stored;
  }
  if (!(node.png instanceof Uint8Array) || node.png.byteLength < 1) {
    throw new Error(`Layer ${node.id} has no PNG.`);
  }
  files[`layers/${node.id}.png`] = [copyBytes(node.png), { level: 0 }];
  if (node.f32) files[`layers/${node.id}.f32`] = floatBytes(node.f32);
  return stored;
}

export function encodeProject({ width, height, nextId, profile = null, profileKnown = true, tree }) {
  if (!Array.isArray(tree)) throw new Error("A project needs a layer tree.");
  const files = {};
  const document = {
    version: VERSION,
    width,
    height,
    nextId,
    profileKnown: profileKnown !== false,
    profileName: profile?.name ?? null,
    tree: tree.map((node) => serializeNode(node, files)),
  };
  files["document.json"] = strToU8(JSON.stringify(document));
  if (profile?.bytes) {
    const bytes = profile.bytes instanceof Uint8Array ? profile.bytes : new Uint8Array(profile.bytes);
    files["icc/profile.icc"] = copyBytes(bytes);
  }
  return zipSync(files);
}

function readArchive(bytes) {
  try {
    return unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch {
    throw new Error("This file is not a project archive.");
  }
}

function readDocument(files) {
  const raw = files["document.json"];
  if (!raw) throw new Error("This project file is missing document.json.");
  try {
    return JSON.parse(strFromU8(raw));
  } catch {
    throw new Error("This project file has invalid document.json.");
  }
}

function attachNode(node, files, width, height) {
  if (!node || (node.kind !== "pixel" && node.kind !== "group")) {
    throw new Error("This project file has an invalid layer tree.");
  }
  if (node.kind === "group") {
    if (!Array.isArray(node.children)) throw new Error(`Layer ${node.id} is a group with no children.`);
    return {
      ...node,
      children: node.children.map((child) => attachNode(child, files, width, height)),
    };
  }
  const png = files[`layers/${node.id}.png`];
  if (!png) throw new Error(`Layer ${node.id} is missing its image.`);
  const attached = { ...node, png: copyBytes(png) };
  const rawFloat = files[`layers/${node.id}.f32`];
  if (rawFloat) {
    const f32 = floatsFrom(rawFloat);
    if (f32.length !== width * height * 4) {
      throw new Error(`Layer ${node.id} float data does not match the document size.`);
    }
    attached.f32 = f32;
  }
  return attached;
}

export function decodeProject(bytes) {
  const files = readArchive(bytes);
  const document = readDocument(files);
  if (document.version == null) throw new Error("This project file has no version.");
  if (document.version !== VERSION) {
    throw new Error(`This project needs a newer editor (version ${document.version}).`);
  }
  if (!Array.isArray(document.tree)) throw new Error("This project file has an invalid layer tree.");
  const width = document.width;
  const height = document.height;
  const icc = files["icc/profile.icc"];
  return {
    version: VERSION,
    width,
    height,
    nextId: document.nextId,
    profileKnown: document.profileKnown !== false,
    profile: icc
      ? { name: document.profileName || "Embedded profile", bytes: copyBytes(icc) }
      : null,
    tree: document.tree.map((node) => attachNode(node, files, width, height)),
  };
}
