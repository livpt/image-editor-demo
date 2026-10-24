import { CommandError } from "./commands.js";

export const MAX_PIXELS = 50_000_000;
export const MAX_NAME_LENGTH = 80;
export const BLEND_MODES = Object.freeze(["normal", "multiply", "screen", "overlay"]);
const COMPOSITE_OPERATIONS = Object.freeze({
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
});
const ROOT_ID = 0;

function pixelNode(id, name, pixels, style = {}) {
  return Object.freeze({
    kind: "pixel",
    id,
    name,
    visible: style.visible ?? true,
    opacity: style.opacity ?? 100,
    blend: style.blend ?? "normal",
    pixels,
  });
}

function groupNode(id, name, children, style = {}) {
  return Object.freeze({
    kind: "group",
    id,
    name,
    visible: style.visible ?? true,
    opacity: style.opacity ?? 100,
    blend: style.blend ?? "normal",
    children: Object.freeze(children),
  });
}

function withNode(node, patch) {
  return node.kind === "pixel"
    ? pixelNode(node.id, patch.name ?? node.name, patch.pixels ?? node.pixels, { ...node, ...patch })
    : groupNode(node.id, patch.name ?? node.name, patch.children ?? node.children, {
        ...node,
        ...patch,
      });
}

function draft(doc, patch) {
  return Object.freeze({
    width: doc.width,
    height: doc.height,
    nextId: doc.nextId,
    tree: doc.tree,
    ...patch,
  });
}

export function sizeProblem(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return "width and height must be positive integers";
  }
  if (width * height > MAX_PIXELS) {
    return `${width} × ${height} exceeds the ${MAX_PIXELS / 1_000_000} megapixel limit`;
  }
  return null;
}

export function nameProblem(name) {
  if (typeof name !== "string" || name.trim() === "") return "name is required";
  if (name.trim().length > MAX_NAME_LENGTH) {
    return `name must be ${MAX_NAME_LENGTH} characters or fewer`;
  }
  return null;
}

export function opacityProblem(opacity) {
  if (!Number.isInteger(opacity) || opacity < 0 || opacity > 100) {
    return "opacity must be an integer between 0 and 100";
  }
  return null;
}

export function blendProblem(blend) {
  return BLEND_MODES.includes(blend)
    ? null
    : `blend must be one of ${BLEND_MODES.map((mode) => `"${mode}"`).join(", ")}`;
}

export function findNode(tree, id, parent = null) {
  for (let index = 0; index < tree.length; index += 1) {
    const node = tree[index];
    if (node.id === id) return { node, parent, siblings: tree, index };
    if (node.kind === "group") {
      const found = findNode(node.children, id, node);
      if (found) return found;
    }
  }
  return null;
}

function contains(node, id) {
  if (node.id === id) return true;
  return node.kind === "group" && node.children.some((child) => contains(child, id));
}

function updateChildren(tree, parentId, update) {
  if (parentId === ROOT_ID) return Object.freeze(update(tree));
  return Object.freeze(
    tree.map((node) => {
      if (node.kind !== "group" || !contains(node, parentId)) return node;
      if (node.id === parentId) return withNode(node, { children: update(node.children) });
      return withNode(node, { children: updateChildren(node.children, parentId, update) });
    })
  );
}

function replaceNode(tree, id, replace) {
  return Object.freeze(
    tree.map((node) => {
      if (node.id === id) return replace(node);
      if (node.kind === "group" && contains(node, id)) {
        return withNode(node, { children: replaceNode(node.children, id, replace) });
      }
      return node;
    })
  );
}

function insertAt(list, index, ...items) {
  return [...list.slice(0, index), ...items, ...list.slice(index)];
}

function removeAt(list, index) {
  return [...list.slice(0, index), ...list.slice(index + 1)];
}

export function pixelLayers(tree) {
  const layers = [];
  for (const node of tree) {
    if (node.kind === "pixel") layers.push(node);
    else layers.push(...pixelLayers(node.children));
  }
  return layers;
}

export function publicLayers(tree) {
  return Object.freeze(
    tree.map((node) => {
      const base = {
        kind: node.kind,
        id: node.id,
        name: node.name,
        visible: node.visible,
        opacity: node.opacity,
        blend: node.blend,
      };
      if (node.kind === "group") base.children = publicLayers(node.children);
      return Object.freeze(base);
    })
  );
}

export function resolveActive(doc, activeId) {
  if (activeId !== null && findNode(doc.tree, activeId)) return activeId;
  const layers = pixelLayers(doc.tree);
  return layers.length ? layers[layers.length - 1].id : null;
}

export function layerSource(doc, id) {
  const found = findNode(doc.tree, id);
  if (!found) throw new CommandError("invalid", `no layer ${id}`);
  if (found.node.kind !== "pixel") {
    throw new CommandError("invalid", `"${found.node.name}" is a group; select a layer to paint`);
  }
  return found.node.pixels;
}

export function createDraft({ width, height, pixels, name = "Background" }) {
  const problem = sizeProblem(width, height) ?? nameProblem(name);
  if (problem) throw new CommandError("invalid", problem);
  return Object.freeze({
    width,
    height,
    nextId: 2,
    tree: Object.freeze([pixelNode(1, name.trim(), pixels)]),
  });
}

function op(problem, apply) {
  const run = (doc, params) => {
    const reason = problem(doc, params);
    if (reason) throw new CommandError("invalid", reason);
    return apply(doc, params);
  };
  run.problem = problem;
  return run;
}

function missing(id) {
  return `no layer ${id}`;
}

export const addLayer = op(
  (doc, { afterId, name, pixels }) => {
    if (!findNode(doc.tree, afterId)) return missing(afterId);
    if (pixels == null) return "pixels are required";
    return name === undefined ? null : nameProblem(name);
  },
  (doc, { afterId, name = `Layer ${doc.nextId}`, pixels }) => {
    const { parent, index } = findNode(doc.tree, afterId);
    const node = pixelNode(doc.nextId, name.trim(), pixels);
    return draft(doc, {
      nextId: doc.nextId + 1,
      tree: updateChildren(doc.tree, parent?.id ?? ROOT_ID, (children) =>
        insertAt(children, index + 1, node)
      ),
    });
  }
);

export const groupLayer = op(
  (doc, { id, name }) => {
    if (!findNode(doc.tree, id)) return missing(id);
    return name === undefined ? null : nameProblem(name);
  },
  (doc, { id, name = `Group ${doc.nextId}` }) =>
    draft(doc, {
      nextId: doc.nextId + 1,
      tree: replaceNode(doc.tree, id, (node) => groupNode(doc.nextId, name.trim(), [node])),
    })
);

export const deleteNode = op(
  (doc, { id }) => {
    const found = findNode(doc.tree, id);
    if (!found) return missing(id);
    const removed = pixelLayers([found.node]).length;
    if (pixelLayers(doc.tree).length - removed < 1) return "cannot delete the last layer";
    return null;
  },
  (doc, { id }) => {
    const { parent, index } = findNode(doc.tree, id);
    return draft(doc, {
      tree: updateChildren(doc.tree, parent?.id ?? ROOT_ID, (children) =>
        removeAt(children, index)
      ),
    });
  }
);

export const renameNode = op(
  (doc, { id, name }) => (findNode(doc.tree, id) ? nameProblem(name) : missing(id)),
  (doc, { id, name }) =>
    draft(doc, { tree: replaceNode(doc.tree, id, (node) => withNode(node, { name: name.trim() })) })
);

function copySubtree(node, nextId) {
  const id = nextId.value;
  nextId.value += 1;
  if (node.kind === "pixel") return pixelNode(id, node.name, node.pixels, node);
  return groupNode(
    id,
    node.name,
    node.children.map((child) => copySubtree(child, nextId)),
    node
  );
}

export const duplicateNode = op(
  (doc, { id }) => (findNode(doc.tree, id) ? null : missing(id)),
  (doc, { id }) => {
    const { node, parent, index } = findNode(doc.tree, id);
    const nextId = { value: doc.nextId };
    const copy = withNode(copySubtree(node, nextId), {
      name: `${node.name} copy`.slice(0, MAX_NAME_LENGTH),
    });
    return draft(doc, {
      nextId: nextId.value,
      tree: updateChildren(doc.tree, parent?.id ?? ROOT_ID, (children) =>
        insertAt(children, index + 1, copy)
      ),
    });
  }
);

function destinationChildren(doc, parentId) {
  if (parentId === ROOT_ID) return doc.tree;
  const found = findNode(doc.tree, parentId);
  return found && found.node.kind === "group" ? found.node.children : null;
}

export const reorderNode = op(
  (doc, { id, parentId, index }) => {
    const found = findNode(doc.tree, id);
    if (!found) return missing(id);
    if (parentId !== ROOT_ID && contains(found.node, parentId)) {
      return `cannot move "${found.node.name}" into itself`;
    }
    const children = destinationChildren(doc, parentId);
    if (!children) return `${missing(parentId)} to move into`;
    const sameParent = (found.parent?.id ?? ROOT_ID) === parentId;
    const max = children.length - (sameParent ? 1 : 0);
    if (!Number.isInteger(index) || index < 0 || index > max) {
      return `index must be an integer between 0 and ${max}`;
    }
    return null;
  },
  (doc, { id, parentId, index }) => {
    const { node, parent, index: oldIndex } = findNode(doc.tree, id);
    const without = updateChildren(doc.tree, parent?.id ?? ROOT_ID, (children) =>
      removeAt(children, oldIndex)
    );
    return draft(doc, {
      tree: updateChildren(without, parentId, (children) => insertAt(children, index, node)),
    });
  }
);

function styleOp(field, problem) {
  return op(
    (doc, params) => (findNode(doc.tree, params.id) ? problem(params[field]) : missing(params.id)),
    (doc, params) =>
      draft(doc, {
        tree: replaceNode(doc.tree, params.id, (node) =>
          withNode(node, { [field]: params[field] })
        ),
      })
  );
}

export const setVisibility = styleOp("visible", (visible) =>
  typeof visible === "boolean" ? null : "visible must be true or false"
);
export const setOpacity = styleOp("opacity", opacityProblem);
export const setBlend = styleOp("blend", blendProblem);

export const paintLayer = op(
  (doc, { id, pixels }) => {
    const found = findNode(doc.tree, id);
    if (!found) return missing(id);
    if (found.node.kind !== "pixel") return `"${found.node.name}" is a group; select a layer to paint`;
    return pixels == null ? "pixels are required" : null;
  },
  (doc, { id, pixels }) =>
    draft(doc, { tree: replaceNode(doc.tree, id, (node) => withNode(node, { pixels })) })
);

function mapPixels(tree, transform) {
  return Object.freeze(
    tree.map((node) =>
      node.kind === "pixel"
        ? withNode(node, { pixels: transform(node.pixels) })
        : withNode(node, { children: mapPixels(node.children, transform) })
    )
  );
}

export const resampleLayers = op(
  (doc, { width, height, resample }) =>
    typeof resample === "function" ? sizeProblem(width, height) : "resample must be a function",
  (doc, { width, height, resample }) =>
    draft(doc, { width, height, tree: mapPixels(doc.tree, resample) })
);

export function compositeOperation(blend) {
  return COMPOSITE_OPERATIONS[blend];
}
