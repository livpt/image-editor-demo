import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { filters } from "../processing-utils.js";

const root = path.resolve(import.meta.dirname, "..");

function read(name) {
  return readFileSync(path.join(root, name), "utf8");
}

test("only canvas.js imports the history store", () => {
  const importers = readdirSync(root)
    .filter((name) => name.endsWith(".js"))
    .filter((name) => /from\s+["']\.\/history-store\.js["']/.test(read(name)));
  assert.deepEqual(importers, ["canvas.js"]);
});

test("only canvas.js imports the layer engine", () => {
  const importers = readdirSync(root)
    .filter((name) => name.endsWith(".js"))
    .filter((name) => /from\s+["']\.\/layers\.js["']/.test(read(name)));
  assert.deepEqual(importers, ["canvas.js"]);
});

test("the page does not import the registry, the history store, or the layer engine", () => {
  const index = read("index.js");
  assert.doesNotMatch(index, /from\s+["']\.\/commands\.js["']/);
  assert.doesNotMatch(index, /from\s+["']\.\/history-store\.js["']/);
  assert.doesNotMatch(index, /from\s+["']\.\/layers\.js["']/);
});

test("pixel and profile modules stay behind canvas and image loading", () => {
  const importers = readdirSync(root)
    .filter((name) => name.endsWith(".js"))
    .filter((name) => /from\s+["']\.\/(?:pixel-buffer|icc)\.js["']/.test(read(name)));
  assert.deepEqual(importers.sort(), ["canvas.js", "image-io.js"]);
});

test("the layers panel wires its controls to the layer commands", () => {
  const html = read("index.html");
  const index = read("index.js");
  const canvasSource = read("canvas.js");

  assert.match(html, /<aside id="layersPanel"/);
  for (const id of [
    "layersControls",
    "layersList",
    "layerAdd",
    "layerGroup",
    "layerDuplicate",
    "layerDelete",
    "layerOpacity",
    "layerBlend",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  for (const name of [
    "layer.add",
    "layer.group",
    "layer.delete",
    "layer.rename",
    "layer.duplicate",
    "layer.reorder",
    "layer.visibility",
    "layer.opacity",
    "layer.blend",
  ]) {
    assert.match(index, new RegExp(`"${name.replace(".", "\\.")}"`));
    assert.match(canvasSource, new RegExp(`"${name.replace(".", "\\.")}"`));
  }
  assert.match(index, /activate:\s*canvas\.activate/);
  assert.match(index, /canvas\.previewOpacity\(/);
});

test("filter and tool buttons match registered command names", () => {
  const html = read("index.html");
  const canvasSource = read("canvas.js");
  const index = read("index.js");

  for (const key of Object.keys(filters)) {
    assert.match(html, new RegExp(`id="${key}"`));
    assert.match(canvasSource, /name:\s*`filter\.\$\{key\}`/);
  }

  const tools = [
    ["penDraw", "draw.pen"],
    ["lineDraw", "draw.line"],
    ["rectangleDraw", "draw.rect"],
    ["ellipseDraw", "draw.ellipse"],
    ["cropButton", "image.crop"],
  ];
  for (const [id, name] of tools) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(index, new RegExp(`${id}:\\s*"${name}"`));
    assert.match(canvasSource, new RegExp(`["']${name}["']`));
  }

  assert.match(html, /id="resizeButton"/);
  assert.match(index, /canvas\.run\("image\.resize"/);
  assert.match(canvasSource, /name:\s*"image\.resize"/);
  assert.match(canvasSource, /name:\s*"image\.load"/);
});

test("the console panel evaluates against the frozen facade", () => {
  const html = read("index.html");
  const index = read("index.js");
  assert.match(html, /id="consolePanel"/);
  assert.match(html, /id="consoleInput"/);
  assert.match(html, /id="consoleLog"/);
  assert.match(index, /window\.app = Object\.freeze/);
  assert.match(index, /new Function\("app"/);
  assert.match(index, /dialogOpen\(\) \|\| isEditableTarget/);
});

test("the project codec stays behind the canvas", () => {
  const importers = readdirSync(root)
    .filter((name) => name.endsWith(".js"))
    .filter((name) => /from\s+["']\.\/project-file\.js["']/.test(read(name)));
  assert.deepEqual(importers, ["canvas.js"]);

  const zipUsers = readdirSync(root)
    .filter((name) => name.endsWith(".js"))
    .filter((name) => /from\s+["']fflate["']/.test(read(name)));
  assert.deepEqual(zipUsers, ["project-file.js"]);

  const index = read("index.js");
  const canvasSource = read("canvas.js");
  assert.match(index, /from\s+["']\.\/keymap\.js["']/);
  assert.match(index, /from\s+["']\.\/autosave\.js["']/);
  assert.doesNotMatch(index, /from\s+["']\.\/project-file\.js["']/);
  assert.doesNotMatch(canvasSource, /from\s+["']\.\/(?:keymap|autosave)\.js["']/);
  assert.match(canvasSource, /"project\.open"/);
  assert.match(index, /jumpTo:\s*canvas\.jumpTo/);
});

test("export, history, and restore controls are in the page", () => {
  const html = read("index.html");
  for (const id of [
    "exportDialog",
    "exportFilename",
    "exportFormat",
    "exportQuality",
    "exportQualityRow",
    "historyPanel",
    "historyList",
    "restoreDialog",
    "restoreMessage",
    "confirmRestore",
    "discardRestore",
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /accept="image\/png,image\/jpeg,image\/webp,\.msho"/);
  assert.match(html, /aria-keyshortcuts="Control\+Z"/);
  assert.match(html, /aria-keyshortcuts="Control\+S"/);
  assert.match(html, /aria-keyshortcuts="Control\+O"/);
  assert.match(html, /aria-keyshortcuts="P"/);
  assert.match(html, /Ctrl\+T is reserved by the browser/);
});
