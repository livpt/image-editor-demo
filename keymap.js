// `command` is the action id. `ctrl` matches either Ctrl or Command.
// Single-key tools that are not built yet carry a `note` instead of running.

export const keymap = Object.freeze([
  Object.freeze({ key: "z", ctrl: true, shift: false, command: "history.undo", label: "Undo" }),
  Object.freeze({ key: "z", ctrl: true, shift: true, command: "history.redo", label: "Redo" }),
  Object.freeze({ key: "y", ctrl: true, shift: false, command: "history.redo", label: "Redo" }),
  Object.freeze({ key: "s", ctrl: true, shift: false, command: "file.export", label: "Export" }),
  Object.freeze({ key: "o", ctrl: true, shift: false, command: "file.open", label: "Open" }),
  Object.freeze({ key: "p", ctrl: false, shift: false, command: "draw.pen", label: "Pen" }),
  Object.freeze({ key: "u", ctrl: false, shift: false, command: "draw.shape", label: "Shape" }),
  Object.freeze({ key: "c", ctrl: false, shift: false, command: "image.crop", label: "Crop" }),
  Object.freeze({
    key: "v",
    ctrl: false,
    shift: false,
    command: "tool.move",
    label: "Move",
    note: "Move (V) arrives with a later release.",
  }),
  Object.freeze({
    key: "b",
    ctrl: false,
    shift: false,
    command: "paint.brush",
    label: "Brush",
    note: "Brush (B) arrives with a later release.",
  }),
  Object.freeze({
    key: "m",
    ctrl: false,
    shift: false,
    command: "select.rect",
    label: "Marquee",
    note: "Marquee (M) arrives with F3.",
  }),
  Object.freeze({
    key: "l",
    ctrl: false,
    shift: false,
    command: "select.lasso",
    label: "Lasso",
    note: "Lasso (L) arrives with F3.",
  }),
  Object.freeze({
    key: "t",
    ctrl: false,
    shift: false,
    command: "layer.transform",
    label: "Transform",
    note: "Transform (T) arrives with F7.",
  }),
]);

export function matchShortcut(event, bindings = keymap) {
  if (!event || event.altKey || event.isComposing) return null;
  const key = String(event.key || "").toLowerCase();
  if (!key) return null;
  const ctrl = Boolean(event.ctrlKey || event.metaKey);
  const shift = Boolean(event.shiftKey);
  return (
    bindings.find(
      (binding) => binding.key === key && Boolean(binding.ctrl) === ctrl && Boolean(binding.shift) === shift
    ) ?? null
  );
}
