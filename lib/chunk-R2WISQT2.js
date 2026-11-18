// src/shared/contracts.ts
import { randomUUID } from "node:crypto";

// src/shared/settings.ts
var DEFAULTS = Object.freeze({ enabled: true, snapshotTtlMs: 3e4, controlIdleMs: 3e5, screenshotMaxWidth: 1600, screenshotMaxHeight: 1200, maxElements: 300, maxTreeDepth: 10, diagnosticsEnabled: false, humanizeEnabled: true, humanizeProfile: "natural" });
var NUMBER_RANGES = { snapshotTtlMs: [1e3, 6e4], controlIdleMs: [6e4, 9e5], screenshotMaxWidth: [640, 1600], screenshotMaxHeight: [480, 1200], maxElements: [50, 300], maxTreeDepth: [3, 10] };

// src/shared/contracts.ts
var VERSION = "0.5.2";
var PROTOCOL = 1;
var KEYS = ["Enter", "Tab", "Shift+Tab", "Escape", "Backspace", "Delete", "Left", "Right", "Up", "Down", "Home", "End", "PageUp", "PageDown", "Ctrl+A", "Ctrl+S", "Ctrl+Home", "Ctrl+End"];
var ERROR_CODES = ["INVALID_ARGUMENT", "UNSUPPORTED_INPUT", "NOT_AUTHORIZED", "USER_BUSY", "INPUT_INTERFERENCE", "STATE_CHANGED", "STALE_SNAPSHOT", "OCCLUDED_TARGET", "FOCUS_MISMATCH", "PASSWORD_FIELD", "MULTILINE_UNCONFIRMED", "ELEMENT_NOT_FOUND", "AMBIGUOUS_TARGET", "SAVE_EXISTS", "OBSERVATION_TIMEOUT", "PROTOCOL_ERROR", "CONTROL_CLOSE_FAILED", "INPUT_UNKNOWN", "USER_STOPPED", "HUMANIZE_BUDGET_EXCEEDED"];
var RETRYABLE = /* @__PURE__ */ new Set(["STATE_CHANGED", "FOCUS_MISMATCH", "OCCLUDED_TARGET", "STALE_SNAPSHOT", "USER_BUSY", "INPUT_INTERFERENCE", "INVALID_COORDINATE", "ELEMENT_NOT_FOUND"]);
var STOP = /* @__PURE__ */ new Set(["USER_STOPPED", "CONTROL_CLOSE_FAILED", "PROTOCOL_ERROR", "HELPER_TIMEOUT"]);
var REBEGIN = /* @__PURE__ */ new Set(["CONTROL_CLOSED", "TARGET_CHANGED", "CONFIG_UNAVAILABLE"]);
function recovery(code, execution, verification) {
  if (code && STOP.has(code)) return { retryable: false, requiredAction: "stop" };
  if (execution !== "not_sent") {
    if (!code && (verification === "verified" || verification === "observed_change")) return { retryable: false, requiredAction: "none" };
    if (execution === "unknown" && !code) return { retryable: false, requiredAction: "wait" };
    return { retryable: false, requiredAction: "reobserve" };
  }
  if (code && REBEGIN.has(code)) return { retryable: false, requiredAction: "rebegin" };
  return { retryable: !!code && RETRYABLE.has(code), requiredAction: code ? "reobserve" : "none" };
}
var MkError = class extends Error {
  constructor(code, message, execution = "not_sent", details) {
    super(message);
    this.code = code;
    this.execution = execution;
    this.details = details;
    this.name = "MkError";
    const advice = recovery(code, execution);
    this.retryable = advice.retryable;
    this.requiredAction = advice.requiredAction;
  }
  code;
  execution;
  details;
  retryable;
  requiredAction;
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
      if (key === "stage" && !["visual-comparison", "input-arbitration", "window-activation", "observation", "snapshot", "focus-validation", "element-validation", "authorization", "native-validation", "humanization"].includes(value)) return bad();
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
    } else if (key === "candidates") {
      if (!Array.isArray(value) || value.length < 1 || value.length > 8) return bad();
      const list = [];
      for (const item of value) {
        if (!item || typeof item !== "object" || Array.isArray(item)) return bad();
        const c = item;
        const keys = Object.keys(c);
        if (keys.length !== 3 || !["ref", "name", "role"].every((k) => keys.includes(k))) return bad();
        const ref = c.ref, name = c.name, role = c.role;
        if (typeof ref !== "string" || !ref.length || ref.length > 64) return bad();
        if (typeof name !== "string" || name.length > 128) return bad();
        if (typeof role !== "string" || role.length > 64) return bad();
        list.push({ ref, name, role });
      }
      result[key] = list;
    } else if (["changedPixels", "significantPixels", "maxChannelDelta", "dpi", "snapshotAgeMs", "waitedMs", "plannedDelayMs", "budgetMs"].includes(key)) {
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
function boolean(v, key) {
  if (typeof v !== "boolean") return fail("INVALID_ARGUMENT", `Invalid ${key}.`);
  return v;
}
function optionalBoolean(v, key) {
  return v === void 0 ? void 0 : boolean(v, key);
}
function evidencePath(v) {
  if (typeof v !== "string" || v.length < 8 || v.length > 240) return fail("INVALID_ARGUMENT", "Invalid savePath.");
  if (/[\u0000-\u001f\u007f]/u.test(v)) return fail("INVALID_ARGUMENT", "Invalid savePath.");
  if (!/^(?:[A-Za-z]:[\\/]|\\\\)/u.test(v) || !/\.png$/iu.test(v)) return fail("INVALID_ARGUMENT", "savePath must be an absolute Windows path ending in .png.");
  return v;
}
var id = () => randomUUID();
function decodeSettings(value) {
  const v = object(value);
  exact(v, Object.keys(DEFAULTS));
  const result = { ...DEFAULTS };
  for (const k of ["enabled", "diagnosticsEnabled", "humanizeEnabled"]) {
    if (v[k] !== void 0) {
      if (typeof v[k] !== "boolean") fail("INVALID_CONFIG", `Invalid ${k}.`);
      result[k] = v[k];
    }
  }
  if (v.humanizeProfile !== void 0) {
    if (v.humanizeProfile !== "natural" && v.humanizeProfile !== "slow") fail("INVALID_CONFIG", "Invalid humanizeProfile.");
    result.humanizeProfile = v.humanizeProfile;
  }
  for (const [key, [min, max]] of Object.entries(NUMBER_RANGES)) {
    const k = key;
    if (v[k] !== void 0) result[k] = integer(v[k], k, min, max);
  }
  return result;
}
function regionValue(v) {
  const r = object(v);
  exact(r, ["left", "top", "width", "height"]);
  return { left: integer(r.left, "region.left", -2147483648, 2147483647), top: integer(r.top, "region.top", -2147483648, 2147483647), width: integer(r.width, "region.width", 1, 1600), height: integer(r.height, "region.height", 1, 1200) };
}
function waitForValue(v) {
  const w = object(v);
  const timeoutMs = w.timeoutMs === void 0 ? 5e3 : integer(w.timeoutMs, "timeoutMs", 1e3, 3e4);
  if (w.kind === "text") {
    exact(w, ["kind", "value", "exact", "timeoutMs"]);
    return { kind: "text", value: string(w.value, "value", 256), exact: optionalBoolean(w.exact, "exact") ?? false, timeoutMs };
  }
  if (w.kind === "element") {
    exact(w, ["kind", "value", "role", "exact", "timeoutMs"]);
    return { kind: "element", value: string(w.value, "value", 256), ...w.role === void 0 ? {} : { role: string(w.role, "role", 64) }, exact: optionalBoolean(w.exact, "exact") ?? false, timeoutMs };
  }
  if (w.kind === "pixel") {
    exact(w, ["kind", "region", "mode", "settleSamples", "minChangedPixels", "timeoutMs"]);
    if (w.mode !== "stable" && w.mode !== "changed") return fail("INVALID_ARGUMENT", "Invalid waitFor.mode.");
    return { kind: "pixel", region: regionValue(w.region), mode: w.mode, settleSamples: w.settleSamples === void 0 ? 3 : integer(w.settleSamples, "settleSamples", 2, 10), minChangedPixels: w.minChangedPixels === void 0 ? 64 : integer(w.minChangedPixels, "minChangedPixels", 1, 4096), timeoutMs };
  }
  return fail("INVALID_ARGUMENT", "Invalid waitFor.kind.");
}
function observeAmount(v) {
  if (v === void 0) return void 0;
  if (v !== "full" && v !== "compact" && v !== "none") return fail("INVALID_ARGUMENT", "Invalid observe amount.");
  return v;
}
function humanizeValue(v) {
  if (v === void 0) return void 0;
  if (v !== "off" && v !== "natural" && v !== "slow") return fail("INVALID_ARGUMENT", "Invalid humanize profile.");
  return v;
}
function settleValue(v) {
  return v === void 0 ? void 0 : integer(v, "settleMs", 0, 5e3);
}
function parseRequest(tool, input) {
  const v = object(input);
  if (tool === "mk_control") {
    exact(v, ["action"]);
    if (!["begin", "end", "status"].includes(String(v.action))) fail("INVALID_ARGUMENT", "Invalid control action.");
    return { tool, action: v.action };
  }
  if (tool === "mk_observe") {
    exact(v, ["mode", "target", "query", "detail", "savePath", "region", "waitFor"]);
    if (v.mode === "targets") {
      if (v.target !== void 0 || v.detail !== void 0 || v.savePath !== void 0 || v.region !== void 0 || v.waitFor !== void 0) fail("INVALID_ARGUMENT", "targets does not accept target, detail, savePath, region or waitFor.");
      if (v.query === void 0) return { tool, mode: "targets" };
      const query = string(v.query, "query", 256);
      if ([...query].length > 128) fail("INVALID_ARGUMENT", "query too long.");
      return { tool, mode: "targets", query };
    }
    if (v.mode === "window") {
      if (v.query !== void 0) fail("INVALID_ARGUMENT", "window does not accept query.");
      if (v.detail !== void 0 && !["compact", "expanded"].includes(String(v.detail))) fail("INVALID_ARGUMENT", "Invalid observation detail.");
      return { tool, mode: "window", target: string(v.target, "target"), ...v.detail !== void 0 ? { detail: v.detail } : {}, ...v.savePath === void 0 ? {} : { savePath: evidencePath(v.savePath) }, ...v.region === void 0 ? {} : { region: regionValue(v.region) }, ...v.waitFor === void 0 ? {} : { waitFor: waitForValue(v.waitFor) } };
    }
    return fail("INVALID_ARGUMENT", "Invalid observation mode.");
  }
  if (tool === "mk_mouse") {
    exact(v, ["action", "target", "snapshot", "element", "x", "y", "elementName", "elementRole", "elementExact", "savePath", "region", "observe", "humanize"]);
    if (v.action !== "click") fail("INVALID_ARGUMENT", "Only one left click is supported.");
    const base = { tool: "mk_mouse", action: "click", target: string(v.target, "target"), snapshot: string(v.snapshot, "snapshot"), ...v.savePath === void 0 ? {} : { savePath: evidencePath(v.savePath) }, ...v.region === void 0 ? {} : { region: regionValue(v.region) }, ...observeAmount(v.observe) === void 0 ? {} : { observe: observeAmount(v.observe) }, ...humanizeValue(v.humanize) === void 0 ? {} : { humanize: humanizeValue(v.humanize) } };
    if (v.element !== void 0) {
      if (v.x !== void 0 || v.y !== void 0) fail("INVALID_ARGUMENT", "Choose element OR coordinates.");
      if (v.elementName !== void 0 || v.elementRole !== void 0 || v.elementExact !== void 0) fail("INVALID_ARGUMENT", "Choose element OR elementName, not both.");
      return { ...base, element: string(v.element, "element") };
    }
    if (v.elementName !== void 0) {
      if (v.x !== void 0 || v.y !== void 0) fail("INVALID_ARGUMENT", "Choose elementName OR coordinates.");
      if (v.elementExact !== void 0 && typeof v.elementExact !== "boolean") fail("INVALID_ARGUMENT", "Invalid elementExact.");
      return { ...base, elementName: string(v.elementName, "elementName", 256), ...v.elementRole === void 0 ? {} : { elementRole: string(v.elementRole, "elementRole", 64) }, ...v.elementExact === void 0 ? {} : { elementExact: v.elementExact } };
    }
    if (v.elementRole !== void 0 || v.elementExact !== void 0) fail("INVALID_ARGUMENT", "elementRole and elementExact require elementName.");
    return { ...base, x: integer(v.x, "x", 0, 1599), y: integer(v.y, "y", 0, 1199) };
  }
  if (tool === "mk_keyboard") {
    exact(v, ["action", "target", "snapshot", "text", "key", "savePath", "region", "observe", "settleMs", "paceMs", "inputMode", "humanize"]);
    const base = { tool: "mk_keyboard", target: string(v.target, "target"), snapshot: string(v.snapshot, "snapshot"), ...v.savePath === void 0 ? {} : { savePath: evidencePath(v.savePath) }, ...v.region === void 0 ? {} : { region: regionValue(v.region) }, ...observeAmount(v.observe) === void 0 ? {} : { observe: observeAmount(v.observe) }, ...humanizeValue(v.humanize) === void 0 ? {} : { humanize: humanizeValue(v.humanize) }, ...settleValue(v.settleMs) === void 0 ? {} : { settleMs: settleValue(v.settleMs) } };
    if (v.action === "type") {
      if (v.key !== void 0) fail("INVALID_ARGUMENT", "type does not accept key.");
      const raw = string(v.text, "text", 64e3);
      if (/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/u.test(raw) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(raw)) fail("UNSUPPORTED_INPUT", "Unsupported text control or Unicode sequence.");
      const text = raw.replace(/\r\n?/g, "\n");
      if ([...text].length > 16e3 || Buffer.byteLength(text) > 65536) fail("UNSUPPORTED_INPUT", "Text exceeds the bounded input budget.");
      const mode = v.inputMode === void 0 ? "auto" : v.inputMode;
      if (mode !== "auto" && mode !== "unicode" && mode !== "scancode") fail("INVALID_ARGUMENT", "Invalid inputMode.");
      const paceMs = v.paceMs === void 0 ? void 0 : integer(v.paceMs, "paceMs", 0, 400);
      if (mode === "scancode" && /[^\x00-\x7F]/u.test(text)) fail("UNSUPPORTED_INPUT", "scancode input covers ASCII only; use inputMode unicode or auto.");
      return { ...base, action: "type", text, ...paceMs === void 0 ? {} : { paceMs }, inputMode: mode };
    }
    if (v.action === "key") {
      if (v.text !== void 0 || !KEYS.includes(v.key)) fail("UNSUPPORTED_INPUT", "Key is outside the allowed set.");
      if (v.paceMs !== void 0 || v.inputMode !== void 0) fail("INVALID_ARGUMENT", "key does not accept paceMs or inputMode.");
      return { ...base, action: "key", key: v.key };
    }
  }
  return fail("INVALID_ARGUMENT", "Unknown tool/action.");
}
var COMPACT_ELEMENTS = 21;
function projectObservation(data, amount = "full") {
  if (amount === "none") return null;
  if (amount !== "compact") return data;
  const focus = data.focusedElement;
  const others = data.elements.filter((e) => !focus || e.ref !== focus.ref);
  const elements = (focus ? [focus, ...others] : others).slice(0, COMPACT_ELEMENTS);
  return { ...data, elements, coverage: { ...data.coverage, availableElements: data.elements.length, deliveredElements: elements.length } };
}
function mapPoint(x, y, rect, size) {
  integer(x, "x", 0, size.width - 1);
  integer(y, "y", 0, size.height - 1);
  if (![rect.left, rect.top, rect.width, rect.height, size.width, size.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0 || size.width <= 0 || size.height <= 0) fail("INVALID_COORDINATE", "Invalid image mapping.");
  return { x: Math.min(rect.left + rect.width - 1, rect.left + Math.floor((x + 0.5) * rect.width / size.width)), y: Math.min(rect.top + rect.height - 1, rect.top + Math.floor((y + 0.5) * rect.height / size.height)) };
}
var regionSchema = { type: "object", properties: { left: { type: "integer" }, top: { type: "integer" }, width: { type: "integer", minimum: 1, maximum: 1600 }, height: { type: "integer", minimum: 1, maximum: 1200 } }, required: ["left", "top", "width", "height"], additionalProperties: false };
var waitForSchema = { type: "object", properties: { kind: { type: "string", enum: ["text", "element", "pixel"] }, value: { type: "string", maxLength: 256 }, role: { type: "string", maxLength: 64 }, exact: { type: "boolean" }, region: regionSchema, mode: { type: "string", enum: ["stable", "changed"] }, settleSamples: { type: "integer", minimum: 2, maximum: 10 }, minChangedPixels: { type: "integer", minimum: 1, maximum: 4096 }, timeoutMs: { type: "integer", minimum: 1e3, maximum: 3e4 } }, required: ["kind"], additionalProperties: false };
var TOOL_SCHEMAS = {
  mk_control: { type: "object", properties: { action: { type: "string", enum: ["begin", "end", "status"] } }, required: ["action"], additionalProperties: false },
  mk_observe: { type: "object", properties: { mode: { type: "string", enum: ["targets", "window"] }, target: { type: "string" }, query: { type: "string", maxLength: 256 }, detail: { type: "string", enum: ["compact", "expanded"], description: "Window mode only. Compact is the default; request expanded only if more text context is needed." }, savePath: { type: "string", maxLength: 240, description: "Window mode only. Absolute Windows .png path inside an existing directory. Writes this full-resolution capture; refuses to overwrite an existing file. Use it to keep local evidence images." }, region: regionSchema, waitFor: { ...waitForSchema, description: "Window mode only. Wait until a condition holds: text/element match UIA content (a canvas has no text channel), pixel stable|changed compares the region against itself or the call-start baseline. On timeout the last observation is returned with OBSERVATION_TIMEOUT. No OCR, no reference image." } }, required: ["mode"], additionalProperties: false },
  mk_mouse: { type: "object", properties: { humanize: { type: "string", enum: ["off", "natural", "slow"] }, action: { type: "string", enum: ["click"] }, target: { type: "string" }, snapshot: { type: "string" }, element: { type: "string" }, elementName: { type: "string", maxLength: 256, description: "Locate by accessible name in the current snapshot instead of a ref. Mutually exclusive with element and x/y." }, elementRole: { type: "string", maxLength: 64, description: "Optional exact role for elementName lookups." }, elementExact: { type: "boolean", description: "Require an exact name match; the default is a contains match." }, x: { type: "integer", minimum: 0, maximum: 1599 }, y: { type: "integer", minimum: 0, maximum: 1199 }, observe: { type: "string", enum: ["full", "compact", "none"], description: "Post-action observation size. compact keeps the focus plus at most 20 elements; none returns only the execution facts. Default full." }, region: regionSchema, savePath: { type: "string", maxLength: 240, description: "Optional absolute .png path for the post-action observation. Region crops the saved file only. Never overwrites an existing file." } }, required: ["action", "target", "snapshot"], additionalProperties: false },
  mk_keyboard: { type: "object", properties: { action: { type: "string", enum: ["type", "key"] }, target: { type: "string" }, snapshot: { type: "string" }, text: { type: "string", maxLength: 64e3 }, key: { type: "string", enum: [...KEYS] }, settleMs: { type: "integer", minimum: 0, maximum: 5e3, description: "Extra wait after the last input event so the target consumes the text before the action returns. Default 0." }, paceMs: { type: "integer", minimum: 0, maximum: 400, description: "Nominal inter-character gap in ms, randomized in natural/slow mode. Explicit 0 selects maxSpeed; omitted uses the profile." }, humanize: { type: "string", enum: ["off", "natural", "slow"], description: "Action pacing profile. Default follows settings; off selects maxSpeed. Physical Esc and injection markers remain active." }, inputMode: { type: "string", enum: ["auto", "unicode", "scancode"], description: "auto uses target-layout scan-code mappings for ASCII on all controls and Unicode for non-ASCII. Explicit unicode is retained; scancode accepts ASCII mappings only." }, observe: { type: "string", enum: ["full", "compact", "none"], description: "Post-action observation size. Default full." }, region: regionSchema, savePath: { type: "string", maxLength: 240, description: "Optional absolute .png path for the post-action observation. Region crops the saved file only. Never overwrites an existing file." } }, required: ["action", "target", "snapshot"], additionalProperties: false }
};

export {
  DEFAULTS,
  NUMBER_RANGES,
  VERSION,
  PROTOCOL,
  KEYS,
  ERROR_CODES,
  recovery,
  MkError,
  diagnosticDetails,
  fail,
  object,
  exact,
  string,
  integer,
  boolean,
  evidencePath,
  id,
  decodeSettings,
  parseRequest,
  COMPACT_ELEMENTS,
  projectObservation,
  mapPoint,
  TOOL_SCHEMAS
};
