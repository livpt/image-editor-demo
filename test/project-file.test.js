import assert from "node:assert/strict";
import test from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { decodeProject, encodeProject } from "../project-file.js";

function sampleProject() {
  return {
    width: 1,
    height: 1,
    nextId: 4,
    profile: { name: "Test RGB", bytes: new Uint8Array([9, 8, 7]) },
    profileKnown: true,
    tree: [
      {
        kind: "pixel",
        id: 1,
        name: "Background",
        visible: true,
        opacity: 100,
        blend: "normal",
        png: new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]),
        f32: new Float32Array([0.25, 0.5, 0.75, 1]),
      },
      {
        kind: "group",
        id: 3,
        name: "Group",
        visible: true,
        opacity: 50,
        blend: "multiply",
        children: [
          {
            kind: "pixel",
            id: 2,
            name: "Paint",
            visible: false,
            opacity: 80,
            blend: "screen",
            png: new Uint8Array([7, 7, 7, 7]),
          },
        ],
      },
    ],
  };
}

function methods(zip) {
  const found = [];
  for (let offset = 0; offset + 30 < zip.length; offset += 1) {
    if (zip[offset] !== 0x50 || zip[offset + 1] !== 0x4b || zip[offset + 2] !== 3 || zip[offset + 3] !== 4) {
      continue;
    }
    const method = zip[offset + 8] | (zip[offset + 9] << 8);
    const nameLength = zip[offset + 26] | (zip[offset + 27] << 8);
    const extraLength = zip[offset + 28] | (zip[offset + 29] << 8);
    const name = new TextDecoder().decode(zip.subarray(offset + 30, offset + 30 + nameLength));
    found.push({ name, method });
    offset += 29 + nameLength + extraLength;
  }
  return found;
}

test("encodeProject round-trips layers, float data, and the profile", () => {
  const source = sampleProject();
  const bytes = encodeProject(source);
  const stored = methods(bytes);
  assert.equal(stored.find((entry) => entry.name === "layers/1.png").method, 0);
  assert.equal(stored.find((entry) => entry.name === "layers/1.f32").method, 8);
  assert.equal(stored.some((entry) => entry.name === "layers/2.f32"), false);

  const decoded = decodeProject(bytes);
  assert.equal(decoded.version, 1);
  assert.equal(decoded.width, 1);
  assert.equal(decoded.nextId, 4);
  assert.equal(decoded.profile.name, "Test RGB");
  assert.deepEqual([...decoded.profile.bytes], [9, 8, 7]);
  assert.deepEqual([...decoded.tree[0].png], [...source.tree[0].png]);
  assert.deepEqual([...decoded.tree[0].f32], [...source.tree[0].f32]);
  assert.equal(decoded.tree[1].children[0].name, "Paint");
  assert.equal(decoded.tree[1].children[0].visible, false);
  assert.equal(decoded.tree[1].children[0].f32, undefined);
});

test("decodeProject rejects a missing version, a newer version, bad JSON, and a missing layer", () => {
  const bytes = encodeProject(sampleProject());
  const files = unzipSync(bytes);

  const missingVersion = unzipSync(bytes);
  const document = JSON.parse(strFromU8(missingVersion["document.json"]));
  delete document.version;
  missingVersion["document.json"] = strToU8(JSON.stringify(document));
  assert.throws(() => decodeProject(zipSync(missingVersion)), /no version/);

  document.version = 2;
  const newer = unzipSync(bytes);
  newer["document.json"] = strToU8(JSON.stringify(document));
  assert.throws(() => decodeProject(zipSync(newer)), /newer editor \(version 2\)/);

  const broken = unzipSync(bytes);
  broken["document.json"] = strToU8("{");
  assert.throws(() => decodeProject(zipSync(broken)), /invalid document\.json/);

  delete files["layers/2.png"];
  assert.throws(() => decodeProject(zipSync(files)), /Layer 2 is missing its image/);

  assert.throws(() => decodeProject(new Uint8Array([1, 2, 3, 4])), /not a project archive/);
});
