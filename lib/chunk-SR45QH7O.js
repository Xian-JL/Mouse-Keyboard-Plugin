// src/shared/contracts.ts
import { randomUUID } from "node:crypto";

// src/shared/settings.ts
var DEFAULTS = Object.freeze({ enabled: true, snapshotTtlMs: 3e4, controlIdleMs: 3e5, screenshotMaxWidth: 1600, screenshotMaxHeight: 1200, maxElements: 300, maxTreeDepth: 10, diagnosticsEnabled: false });
var NUMBER_RANGES = { snapshotTtlMs: [1e3, 6e4], controlIdleMs: [6e4, 9e5], screenshotMaxWidth: [640, 1600], screenshotMaxHeight: [480, 1200], maxElements: [50, 300], maxTreeDepth: [3, 10] };

// src/shared/contracts.ts
var VERSION = "0.3.0";
var PROTOCOL = 1;
var KEYS = ["Enter", "Tab", "Shift+Tab", "Escape", "Backspace", "Delete", "Left", "Right", "Up", "Down", "Home", "End", "PageUp", "PageDown", "Ctrl+A", "Ctrl+S", "Ctrl+Home", "Ctrl+End"];
var MkError = class extends Error {
  constructor(code, message, execution = "not_sent", details) {
    super(message);
    this.code = code;
    this.execution = execution;
    this.details = details;
    this.name = "MkError";
  }
  code;
  execution;
  details;
};
function diagnosticDetails(raw) {
  if (raw === void 0 || raw === null) return void 0;
  const bad = () => {
    throw new MkError("PROTOCOL_ERROR", "Invalid bounded diagnostic details.", "unknown");
  };
  if (typeof raw !== "object" || Array.isArray(raw) || JSON.stringify(raw).length > 2048) return bad();
  const result = {};
  for (const [key, value] of Object.entries(raw)) {
    if (["stage", "check", "requiredAction"].includes(key)) {
      if (typeof value !== "string" || !/^[a-z][a-z0-9-]{0,79}$/.test(value)) return bad();
      if (key === "stage" && !["visual-comparison", "input-arbitration", "window-activation", "observation", "snapshot", "focus-validation", "element-validation", "authorization", "native-validation"].includes(value)) return bad();
      result[key] = value;
    } else if (key === "space") {
      if (value !== "screen-physical-pixels") return bad();
      result[key] = value;
    } else if (["region", "diffBbox", "captureRect"].includes(key)) {
      if (value === null) {
        result[key] = null;
        continue;
      }
      if (!value || typeof value !== "object" || Array.isArray(value)) return bad();
      const rect = value;
      if (Object.keys(rect).length !== 4 || !["left", "top", "width", "height"].every((k) => Number.isSafeInteger(rect[k]) && Math.abs(Number(rect[k])) <= 2147483647) || Number(rect.width) < 0 || Number(rect.height) < 0) return bad();
      result[key] = { ...rect };
    } else if (["changedPixels", "significantPixels", "maxChannelDelta", "dpi", "snapshotAgeMs", "waitedMs"].includes(key)) {
      if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 2147483647) return bad();
      result[key] = value;
    } else if (key === "activationAttempted") {
      if (typeof value !== "boolean") return bad();
      result[key] = value;
    } else return bad();
  }
  return result;
}
var fail = (code, message) => {
  throw new MkError(code, message);
};
var object = (v) => {
  if (!v || typeof v !== "object" || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) return fail("INVALID_ARGUMENT", "Expected a plain JSON object.");
  return v;
};
function exact(v, keys) {
  for (const k of Object.keys(v)) if (!keys.includes(k)) fail("INVALID_ARGUMENT", `Unknown field: ${k}`);
}
function string(v, key, max = 256) {
  if (typeof v !== "string" || !v.length || v.length > max) return fail("INVALID_ARGUMENT", `Invalid ${key}.`);
  return v;
}
function integer(v, key, min, max) {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) return fail("INVALID_ARGUMENT", `Invalid ${key}.`);
  return v;
}
var id = () => randomUUID();
function decodeSettings(value) {
  const v = object(value);
  exact(v, Object.keys(DEFAULTS));
  const result = { ...DEFAULTS };
  for (const k of ["enabled", "diagnosticsEnabled"]) {
    if (v[k] !== void 0) {
      if (typeof v[k] !== "boolean") fail("INVALID_CONFIG", `Invalid ${k}.`);
      result[k] = v[k];
    }
  }
  for (const [key, [min, max]] of Object.entries(NUMBER_RANGES)) {
    const k = key;
    if (v[k] !== void 0) result[k] = integer(v[k], k, min, max);
  }
  return result;
}
function parseRequest(tool, input) {
  const v = object(input);
  if (tool === "mk_control") {
    exact(v, ["action"]);
    if (!["begin", "end", "status"].includes(String(v.action))) fail("INVALID_ARGUMENT", "Invalid control action.");
    return { tool, action: v.action };
  }
  if (tool === "mk_observe") {
    exact(v, ["mode", "target", "query"]);
    if (v.mode === "targets") {
      if (v.target !== void 0) fail("INVALID_ARGUMENT", "targets does not accept target.");
      if (v.query === void 0) return { tool, mode: "targets" };
      const query = string(v.query, "query", 256);
      if ([...query].length > 128) fail("INVALID_ARGUMENT", "query too long.");
      return { tool, mode: "targets", query };
    }
    if (v.mode === "window") {
      if (v.query !== void 0) fail("INVALID_ARGUMENT", "window does not accept query.");
      return { tool, mode: "window", target: string(v.target, "target") };
    }
    return fail("INVALID_ARGUMENT", "Invalid observation mode.");
  }
  if (tool === "mk_mouse") {
    exact(v, ["action", "target", "snapshot", "element", "x", "y"]);
    if (v.action !== "click") fail("INVALID_ARGUMENT", "Only one left click is supported.");
    const base = { tool: "mk_mouse", action: "click", target: string(v.target, "target"), snapshot: string(v.snapshot, "snapshot") };
    if (v.element !== void 0) {
      if (v.x !== void 0 || v.y !== void 0) fail("INVALID_ARGUMENT", "Choose element OR coordinates.");
      return { ...base, element: string(v.element, "element") };
    }
    return { ...base, x: integer(v.x, "x", 0, 1599), y: integer(v.y, "y", 0, 1199) };
  }
  if (tool === "mk_keyboard") {
    exact(v, ["action", "target", "snapshot", "text", "key"]);
    const base = { tool: "mk_keyboard", target: string(v.target, "target"), snapshot: string(v.snapshot, "snapshot") };
    if (v.action === "type") {
      if (v.key !== void 0) fail("INVALID_ARGUMENT", "type does not accept key.");
      const raw = string(v.text, "text", 64e3);
      if (/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/u.test(raw) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(raw)) fail("UNSUPPORTED_INPUT", "Unsupported text control or Unicode sequence.");
      const text = raw.replace(/\r\n?/g, "\n");
      if ([...text].length > 16e3 || Buffer.byteLength(text) > 65536) fail("UNSUPPORTED_INPUT", "Text exceeds the bounded input budget.");
      return { ...base, action: "type", text };
    }
    if (v.action === "key") {
      if (v.text !== void 0 || !KEYS.includes(v.key)) fail("UNSUPPORTED_INPUT", "Key is outside the allowed set.");
      return { ...base, action: "key", key: v.key };
    }
  }
  return fail("INVALID_ARGUMENT", "Unknown tool/action.");
}
function mapPoint(x, y, rect, size) {
  integer(x, "x", 0, size.width - 1);
  integer(y, "y", 0, size.height - 1);
  if (![rect.left, rect.top, rect.width, rect.height, size.width, size.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || size.width <= 0 || size.height <= 0) fail("INVALID_COORDINATE", "Invalid image mapping.");
  return { x: Math.min(rect.left + rect.width - 1, rect.left + Math.floor((x + 0.5) * rect.width / size.width)), y: Math.min(rect.top + rect.height - 1, rect.top + Math.floor((y + 0.5) * rect.height / size.height)) };
}
var TOOL_SCHEMAS = {
  mk_control: { type: "object", properties: { action: { type: "string", enum: ["begin", "end", "status"] } }, required: ["action"], additionalProperties: false },
  mk_observe: { type: "object", properties: { mode: { type: "string", enum: ["targets", "window"] }, target: { type: "string" }, query: { type: "string", maxLength: 256 } }, required: ["mode"], additionalProperties: false },
  mk_mouse: { type: "object", properties: { action: { type: "string", enum: ["click"] }, target: { type: "string" }, snapshot: { type: "string" }, element: { type: "string" }, x: { type: "integer", minimum: 0, maximum: 1599 }, y: { type: "integer", minimum: 0, maximum: 1199 } }, required: ["action", "target", "snapshot"], additionalProperties: false },
  mk_keyboard: { type: "object", properties: { action: { type: "string", enum: ["type", "key"] }, target: { type: "string" }, snapshot: { type: "string" }, text: { type: "string", maxLength: 64e3 }, key: { type: "string", enum: [...KEYS] } }, required: ["action", "target", "snapshot"], additionalProperties: false }
};

export {
  DEFAULTS,
  NUMBER_RANGES,
  VERSION,
  PROTOCOL,
  KEYS,
  MkError,
  diagnosticDetails,
  fail,
  object,
  exact,
  string,
  integer,
  id,
  decodeSettings,
  parseRequest,
  mapPoint,
  TOOL_SCHEMAS
};
