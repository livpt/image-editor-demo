const NAME_PATTERN = /^[a-z][a-z0-9]*\.[a-z][a-z0-9]*$/;

export class CommandError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CommandError";
    this.code = code;
  }
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function descriptorOf(spec) {
  return Object.freeze({
    name: spec.name,
    label: spec.label,
    historyMode: spec.historyMode,
    params: spec.params,
  });
}

function describe(schema) {
  if (schema.type === "integer") {
    const bounds = [];
    if (schema.min !== undefined) bounds.push(`>= ${schema.min}`);
    if (schema.max !== undefined) bounds.push(`<= ${schema.max}`);
    return bounds.length ? `must be an integer ${bounds.join(" and ")}` : "must be an integer";
  }
  if (schema.type === "number") {
    const bounds = [];
    if (schema.exclusiveMin !== undefined) bounds.push(`> ${schema.exclusiveMin}`);
    if (schema.min !== undefined) bounds.push(`>= ${schema.min}`);
    if (schema.max !== undefined) bounds.push(`<= ${schema.max}`);
    return bounds.length ? `must be a number ${bounds.join(" and ")}` : "must be a finite number";
  }
  if (schema.type === "point") return "must be a point";
  if (schema.type === "points") {
    const minLength = schema.minLength ?? 0;
    return minLength > 0 ? `must be at least ${minLength} points` : "must be a list of points";
  }
  if (schema.type === "string") {
    if (schema.enum) return `must be one of ${schema.enum.map((item) => `"${item}"`).join(", ")}`;
    const bounds = [];
    if (schema.minLength !== undefined) bounds.push(`at least ${schema.minLength}`);
    if (schema.maxLength !== undefined) bounds.push(`at most ${schema.maxLength}`);
    if (!bounds.length) return "must be a string";
    return `must be a string of ${bounds.join(" and ")} characters`;
  }
  if (schema.type === "boolean") return "must be true or false";
  if (schema.type === "color") return "must be a #RRGGBB colour";
  return "is invalid";
}

function finiteBound(value) {
  return value === undefined || Number.isFinite(value);
}

function lengthBound(value) {
  return value === undefined || (Number.isInteger(value) && value >= 0);
}

function isFieldSchema(schema) {
  if (!isPlainObject(schema)) return false;
  if (schema.type === "number") {
    return (
      Object.keys(schema).every((key) =>
        ["type", "min", "max", "exclusiveMin", "default"].includes(key)
      ) &&
      finiteBound(schema.min) &&
      finiteBound(schema.max) &&
      finiteBound(schema.exclusiveMin)
    );
  }
  if (schema.type === "integer") {
    return (
      Object.keys(schema).every((key) => ["type", "min", "max", "default"].includes(key)) &&
      finiteBound(schema.min) &&
      finiteBound(schema.max)
    );
  }
  if (schema.type === "point") return Object.keys(schema).length === 1;
  if (schema.type === "points") {
    return (
      Object.keys(schema).every((key) => key === "type" || key === "minLength") &&
      lengthBound(schema.minLength)
    );
  }
  if (schema.type === "string") {
    return (
      Object.keys(schema).every((key) =>
        ["type", "trim", "minLength", "maxLength", "enum", "default"].includes(key)
      ) &&
      (schema.trim === undefined || typeof schema.trim === "boolean") &&
      lengthBound(schema.minLength) &&
      lengthBound(schema.maxLength) &&
      (schema.enum === undefined ||
        (Array.isArray(schema.enum) &&
          schema.enum.length > 0 &&
          schema.enum.every((item) => typeof item === "string")))
    );
  }
  if (schema.type === "boolean") {
    return Object.keys(schema).every((key) => key === "type" || key === "default");
  }
  if (schema.type === "color") {
    return Object.keys(schema).every((key) => key === "type" || key === "default");
  }
  return false;
}

function normalizeField(schema, value) {
  if (schema.type === "string" && schema.trim && typeof value === "string") return value.trim();
  if (schema.type === "color" && typeof value === "string") return value.toLowerCase();
  return value;
}

function fieldProblem(schema, value) {
  if (schema.type === "point") {
    if (!isPlainObject(value) || !Number.isFinite(value.x) || !Number.isFinite(value.y)) {
      return describe(schema);
    }
    const keys = Object.keys(value);
    if (keys.length !== 2 || !keys.includes("x") || !keys.includes("y")) return describe(schema);
    return null;
  }
  if (schema.type === "points") {
    if (!Array.isArray(value)) return "must be a list of points";
    if (value.length < (schema.minLength ?? 0)) return describe(schema);
    if (value.some((point) => fieldProblem({ type: "point" }, point))) {
      return "must be a list of points";
    }
    return null;
  }
  if (schema.type === "integer") {
    if (!Number.isInteger(value)) return describe(schema);
    if (schema.min !== undefined && value < schema.min) return describe(schema);
    if (schema.max !== undefined && value > schema.max) return describe(schema);
    return null;
  }
  if (schema.type === "number") {
    if (!Number.isFinite(value)) return describe(schema);
    if (schema.min !== undefined && value < schema.min) return describe(schema);
    if (schema.max !== undefined && value > schema.max) return describe(schema);
    if (schema.exclusiveMin !== undefined && value <= schema.exclusiveMin) return describe(schema);
    return null;
  }
  if (schema.type === "string") {
    if (typeof value !== "string") return describe(schema);
    if (schema.enum && !schema.enum.includes(value)) return describe(schema);
    if (schema.minLength !== undefined && value.length < schema.minLength) return describe(schema);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return describe(schema);
    return null;
  }
  if (schema.type === "boolean") {
    return typeof value === "boolean" ? null : describe(schema);
  }
  if (schema.type === "color") {
    return typeof value === "string" && /^#[0-9a-f]{6}$/.test(value) ? null : describe(schema);
  }
  return describe(schema);
}

function assertSpec(spec) {
  if (!isPlainObject(spec)) throw new CommandError("spec", "A command spec must be an object.");
  if (typeof spec.name !== "string" || !NAME_PATTERN.test(spec.name)) {
    throw new CommandError("spec", 'Command name must be "group.verb".');
  }
  if (typeof spec.label !== "string" || spec.label.trim() === "") {
    throw new CommandError("spec", `${spec.name}: label is required.`);
  }
  if (spec.historyMode !== "add" && spec.historyMode !== "reset") {
    throw new CommandError("spec", `${spec.name}: historyMode must be "add" or "reset".`);
  }
  if (!isPlainObject(spec.params)) {
    throw new CommandError("spec", `${spec.name}: params must be an object.`);
  }
  for (const [field, schema] of Object.entries(spec.params)) {
    if (!isFieldSchema(schema)) {
      throw new CommandError("spec", `${spec.name}: "${field}" has an invalid schema.`);
    }
    if (
      schema.default !== undefined &&
      fieldProblem(schema, normalizeField(schema, schema.default))
    ) {
      throw new CommandError("spec", `${spec.name}: "${field}" has a default outside its schema.`);
    }
  }
  if (spec.validate !== undefined && typeof spec.validate !== "function") {
    throw new CommandError("spec", `${spec.name}: validate must be a function.`);
  }
  if (typeof spec.execute !== "function") {
    throw new CommandError("spec", `${spec.name}: execute must be a function.`);
  }
}

function parseParams(spec, raw) {
  if (!isPlainObject(raw)) {
    throw new CommandError("invalid", `${spec.name}: params must be an object.`);
  }

  const problems = [];
  const filled = {};
  for (const [field, schema] of Object.entries(spec.params)) {
    const value = normalizeField(schema, raw[field] ?? schema.default);
    if (value === undefined) {
      problems.push(`"${field}" is required`);
      continue;
    }
    const problem = fieldProblem(schema, value);
    if (problem) problems.push(`"${field}" ${problem}`);
    else filled[field] = value;
  }
  for (const key of Object.keys(raw)) {
    if (!Object.hasOwn(spec.params, key)) problems.push(`unknown field "${key}"`);
  }
  if (problems.length) {
    throw new CommandError("invalid", `${spec.name}: ${problems.join("; ")}.`);
  }
  return Object.freeze(filled);
}

export function createRegistry() {
  const specs = new Map();

  function define(spec) {
    assertSpec(spec);
    if (specs.has(spec.name)) {
      throw new CommandError("duplicate", `Command "${spec.name}" is already defined.`);
    }
    const stored = Object.freeze({
      ...spec,
      params: deepFreeze(structuredClone(spec.params)),
    });
    specs.set(spec.name, stored);
    return descriptorOf(stored);
  }

  function dispatch(name, rawParams = {}, context) {
    const spec = specs.get(name);
    if (!spec) throw new CommandError("unknown", `Unknown command "${name}".`);
    const params = parseParams(spec, rawParams);
    const problem = spec.validate?.(params, context);
    if (problem) throw new CommandError("invalid", `${name}: ${problem}`);
    return {
      name: spec.name,
      label: spec.label,
      historyMode: spec.historyMode,
      params,
      plan: spec.execute(params, context),
    };
  }

  const catalog = Object.freeze({
    list() {
      return [...specs.values()]
        .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
        .map(descriptorOf);
    },
    get(name) {
      const spec = specs.get(name);
      if (!spec) throw new CommandError("unknown", `Unknown command "${name}".`);
      return descriptorOf(spec);
    },
  });

  return Object.freeze({ define, dispatch, catalog });
}
