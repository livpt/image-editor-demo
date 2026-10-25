#!/usr/bin/env node
/**
 * Check styles.css for design-token violations.
 *
 * styles.css is read from the repository root, four directories above this
 * script (.cursor/skills/verify-design/scripts/). The process working
 * directory is not used.
 *
 * Colour literals are allowed only inside a :root rule: #hex of 3, 4, 6, or
 * 8 digits, and rgb(), rgba(), hsl(), hsla(). A font-family value must be
 * one var(--font-...) call, or a comma-separated stack of those calls. The
 * font-family descriptor inside @font-face names the face and is exempt.
 * Comments are ignored. Quoted strings are not colour literals.
 *
 *   node .cursor/skills/verify-design/scripts/check-tokens.mjs
 *
 * Exit 0 when clean, 1 when violations are printed, 2 when styles.css is missing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../../../..");
const CSS_PATH = path.join(REPO_ROOT, "styles.css");
const FILE_LABEL = "styles.css";

/**
 * @param {string} css
 * @returns {{ index: number, line: number, reason: string }[]}
 */
export function checkCss(css) {
  const lineOf = makeLineIndex(css);
  const violations = [];
  /** @type {{ root: boolean, fontFace: boolean }[]} */
  const frames = [];
  const insideRoot = () => frames.some((frame) => frame.root);
  const insideFontFace = () => frames.some((frame) => frame.fontFace);

  let i = 0;
  let chunkStart = 0;

  const examineDeclaration = (chunk, startIndex) => {
    const masked = maskNoise(chunk);
    if (!insideRoot()) scanColors(masked, chunk, startIndex, lineOf, violations);
    if (insideFontFace()) return;
    const match = masked.match(/^\s*([A-Za-z_-][\w-]*)\s*:/);
    if (!match || match[1].toLowerCase() !== "font-family") return;
    const rawValue = masked.slice(match.index + match[0].length);
    const value = rawValue.replace(/\s*!\s*important\s*$/i, "").trim();
    const parts = splitTopLevelCommas(value);
    const ok = parts.length > 0 && parts.every((part) => isFontVarReference(part));
    if (ok) return;
    const nameAt = match.index + match[0].search(/font-family/i);
    violations.push({
      index: startIndex + nameAt,
      line: lineOf(startIndex + nameAt),
      reason: "font-family value is not a var(--font-...) stack",
    });
  };

  while (i < css.length) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      i = skipComment(css, i);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(css, i);
      continue;
    }
    if (ch === "{") {
      const prelude = css.slice(chunkStart, i);
      if (!insideRoot()) scanColors(maskNoise(prelude), prelude, chunkStart, lineOf, violations);
      frames.push({ root: isRootPrelude(prelude), fontFace: isFontFacePrelude(prelude) });
      i += 1;
      chunkStart = i;
      continue;
    }
    if (ch === "}") {
      examineDeclaration(css.slice(chunkStart, i), chunkStart);
      frames.pop();
      i += 1;
      chunkStart = i;
      continue;
    }
    if (ch === ";") {
      const chunk = css.slice(chunkStart, i);
      if (frames.length > 0) examineDeclaration(chunk, chunkStart);
      else if (!insideRoot()) scanColors(maskNoise(chunk), chunk, chunkStart, lineOf, violations);
      i += 1;
      chunkStart = i;
      continue;
    }
    i += 1;
  }

  if (chunkStart < css.length) {
    const chunk = css.slice(chunkStart);
    if (frames.length > 0) examineDeclaration(chunk, chunkStart);
    else if (!insideRoot()) scanColors(maskNoise(chunk), chunk, chunkStart, lineOf, violations);
  }

  violations.sort((a, b) => a.index - b.index || a.reason.localeCompare(b.reason));
  return violations;
}

/**
 * @param {string} [cssPath]
 * @returns {{ code: number, lines: string[] }}
 */
export function run(cssPath = CSS_PATH) {
  let css;
  try {
    css = fs.readFileSync(cssPath, "utf8");
  } catch (error) {
    if (error && /** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") {
      return { code: 2, lines: [`${FILE_LABEL}: missing (${cssPath})`] };
    }
    throw error;
  }
  const violations = checkCss(css);
  if (violations.length === 0) return { code: 0, lines: [`${FILE_LABEL}: ok`] };
  return {
    code: 1,
    lines: violations.map((violation) => `${FILE_LABEL}:${violation.line}: ${violation.reason}`),
  };
}

function makeLineIndex(css) {
  const starts = [0];
  for (let i = 0; i < css.length; i += 1) {
    if (css.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return (index) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

function skipComment(css, i) {
  i += 2;
  while (i < css.length && !(css[i] === "*" && css[i + 1] === "/")) i += 1;
  return i < css.length ? i + 2 : i;
}

function skipString(css, i) {
  const quote = css[i];
  i += 1;
  while (i < css.length) {
    if (css[i] === "\\") {
      i += 2;
      continue;
    }
    if (css[i] === "\n") return i;
    if (css[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

/** Replace comments and quoted strings with spaces, keeping newlines and indexes. */
function maskNoise(text) {
  const out = text.split("");
  let i = 0;
  while (i < text.length) {
    if (text[i] === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      blankRange(out, i, stop);
      i = stop;
      continue;
    }
    if (text[i] === '"' || text[i] === "'") {
      const start = i;
      const absoluteEnd = skipString(text, start);
      blankRange(out, start, absoluteEnd);
      i = absoluteEnd;
      continue;
    }
    i += 1;
  }
  return out.join("");
}

function blankRange(chars, start, stop) {
  for (let k = start; k < stop && k < chars.length; k += 1) {
    if (chars[k] !== "\n") chars[k] = " ";
  }
}

function scanColors(masked, original, startIndex, lineOf, violations) {
  let i = 0;
  while (i < masked.length) {
    if (isUrlCall(masked, i)) {
      i = skipBalanced(masked, i + 3);
      continue;
    }
    const hex = matchHex(masked, i);
    if (hex) {
      violations.push({
        index: startIndex + i,
        line: lineOf(startIndex + i),
        reason: `color literal ${original.slice(i, i + hex.length)} outside :root`,
      });
      i += hex.length;
      continue;
    }
    const fn = matchColorFn(masked, i);
    if (fn) {
      violations.push({
        index: startIndex + i,
        line: lineOf(startIndex + i),
        reason: `color literal ${fn.slice(0, -1).toLowerCase()}() outside :root`,
      });
      i += fn.length;
      continue;
    }
    i += 1;
  }
}

function isUrlCall(text, i) {
  if (i > 0 && /[A-Za-z0-9_-]/.test(text[i - 1])) return false;
  return text.slice(i, i + 4).toLowerCase() === "url(";
}

function matchHex(text, i) {
  if (text[i] !== "#") return null;
  let j = i + 1;
  while (j < text.length && /[0-9a-fA-F]/.test(text[j])) j += 1;
  const digits = j - (i + 1);
  if (digits !== 3 && digits !== 4 && digits !== 6 && digits !== 8) return null;
  return text.slice(i, j);
}

function matchColorFn(text, i) {
  if (i > 0 && /[A-Za-z0-9_-]/.test(text[i - 1])) return null;
  for (const name of ["rgba", "hsla", "rgb", "hsl"]) {
    if (text.slice(i, i + name.length).toLowerCase() === name && text[i + name.length] === "(") {
      return text.slice(i, i + name.length + 1);
    }
  }
  return null;
}

function skipBalanced(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

function isRootPrelude(prelude) {
  return splitTopLevelCommas(maskNoise(prelude)).some(selectorIsRoot);
}

function isFontFacePrelude(prelude) {
  return /^\s*@font-face\s*$/i.test(maskNoise(prelude));
}

function selectorIsRoot(selector) {
  let depth = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && selector.startsWith(":root", i)) {
      const after = selector[i + 5] ?? "";
      const prev = i > 0 ? selector[i - 1] : "";
      if (prev === "-") continue;
      if (after && /[-\w]/.test(after)) continue;
      return true;
    }
  }
  return false;
}

function splitTopLevelCommas(value) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(value.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function isFontVarReference(item) {
  const text = item.trim();
  if (text.slice(0, 4).toLowerCase() !== "var(") return false;
  let i = 4;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  const prefix = "--font-";
  if (text.slice(i, i + prefix.length) !== prefix) return false;
  i += prefix.length;
  if (i >= text.length || !/[A-Za-z0-9_-]/.test(text[i])) return false;
  while (i < text.length && /[A-Za-z0-9_-]/.test(text[i])) i += 1;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  if (text[i] === ")") return i === text.length - 1;
  if (text[i] !== ",") return false;
  let depth = 1;
  for (i += 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i === text.length - 1;
    } else if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === "\\") i += 1;
        i += 1;
      }
    }
  }
  return false;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const { code, lines } = run();
  const write = code === 2 ? console.error : console.log;
  for (const line of lines) write(line);
  process.exit(code);
}
