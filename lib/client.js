window.__ModuleLoader__.load({id:"mouse-keyboard-plugin",factory:(require)=>{var module={exports:{}};var exports=module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  SettingsSection: () => SettingsSection,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);
var React = __toESM(require("react"), 1);

// src/shared/settings.ts
var DEFAULTS = Object.freeze({ enabled: true, snapshotTtlMs: 3e4, controlIdleMs: 3e5, screenshotMaxWidth: 1600, screenshotMaxHeight: 1200, maxElements: 300, maxTreeDepth: 10, diagnosticsEnabled: false });
var NUMBER_RANGES = { snapshotTtlMs: [1e3, 6e4], controlIdleMs: [6e4, 9e5], screenshotMaxWidth: [640, 1600], screenshotMaxHeight: [480, 1200], maxElements: [50, 300], maxTreeDepth: [3, 10] };
var SETTING_LABELS = { enabled: "\u542F\u7528\u63D2\u4EF6", snapshotTtlMs: "\u89C2\u5BDF\u6709\u6548\u671F\uFF08\u6BEB\u79D2\uFF09", controlIdleMs: "\u7A7A\u95F2\u5173\u95ED\u65F6\u9650\uFF08\u6BEB\u79D2\uFF09", screenshotMaxWidth: "\u622A\u56FE\u6700\u5927\u5BBD\u5EA6", screenshotMaxHeight: "\u622A\u56FE\u6700\u5927\u9AD8\u5EA6", maxElements: "\u63A7\u4EF6\u6570\u91CF\u4E0A\u9650", maxTreeDepth: "\u63A7\u4EF6\u6811\u6DF1\u5EA6\u4E0A\u9650", diagnosticsEnabled: "\u8131\u654F\u8BCA\u65AD\u6A21\u5F0F" };

// src/client/settings.ts
function readable(snapshot) {
  if (snapshot.status !== "ready" || !snapshot.value) return false;
  for (const key of Object.keys(DEFAULTS)) {
    const v = snapshot.value[key];
    if (typeof DEFAULTS[key] !== typeof v) return false;
    if (typeof v === "number") {
      const r = NUMBER_RANGES[key];
      if (!r || !Number.isSafeInteger(v) || v < r[0] || v > r[1]) return false;
    }
  }
  return true;
}
async function savePatch(form, patch) {
  const s = form.getSnapshot();
  if (!readable(s)) throw new Error("\u914D\u7F6E\u5C1A\u672A\u8BFB\u53D6\u6210\u529F\uFF0C\u672A\u4FDD\u5B58\u3002");
  if (s.writable !== true) throw new Error("\u5F53\u524D\u8FDE\u63A5\u53EA\u8BFB\uFF0C\u672A\u4FDD\u5B58\u3002");
  const next = { ...s.value, ...patch };
  if (!readable({ status: "ready", writable: true, value: next })) throw new Error("\u8BBE\u7F6E\u503C\u8D85\u51FA\u5141\u8BB8\u8303\u56F4\uFF0C\u672A\u4FDD\u5B58\u3002");
  for (const key of Object.keys(patch)) if (!Object.hasOwn(DEFAULTS, key)) throw new Error("\u672A\u77E5\u8BBE\u7F6E\u5B57\u6BB5\uFF0C\u672A\u4FDD\u5B58\u3002");
  const ops = Object.entries(patch).map(([field, value]) => ({ op: "set", path: [field], value }));
  if (!ops.length) return;
  if (await form.mutate(ops) !== true) throw new Error("\u4FDD\u5B58\u5931\u8D25\uFF0C\u5BBF\u4E3B\u672A\u786E\u8BA4\u8BBE\u7F6E\u5DF2\u751F\u6548\u3002");
}

// src/client/index.ts
var inject = ["slots", "configForms"];
var h = React.createElement;
function SettingsSection({ form }) {
  const subscribe = React.useCallback((fn) => form.subscribe(fn), [form]);
  const get = React.useCallback(() => form.getSnapshot(), [form]);
  const snapshot = React.useSyncExternalStore(subscribe, get, get), prefix = React.useId();
  const [draft, setDraft] = React.useState({}), [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState("");
  const mounted = React.useRef(true), currentForm = React.useRef(form);
  currentForm.current = form;
  React.useEffect(() => {
    mounted.current = true;
    setDraft({});
    setMessage("");
    setBusy(false);
    return () => {
      mounted.current = false;
    };
  }, [form]);
  const ok = readable(snapshot), writable = ok && snapshot.writable === true && !busy;
  const commit = async (patch) => {
    setBusy(true);
    setMessage("\u6B63\u5728\u4FDD\u5B58\u2026");
    const active = () => mounted.current && currentForm.current === form;
    try {
      await savePatch(form, patch);
      if (active()) {
        setMessage("\u8BBE\u7F6E\u5DF2\u4FDD\u5B58\u3002");
        setDraft((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !Object.hasOwn(patch, key))));
      }
    } catch (error) {
      if (active()) setMessage(error instanceof Error ? error.message : "\u4FDD\u5B58\u5931\u8D25\uFF0C\u672A\u786E\u8BA4\u751F\u6548\u3002");
    } finally {
      if (active()) setBusy(false);
    }
  };
  const rows = ok ? Object.keys(DEFAULTS).map((key) => {
    const value = snapshot.value[key], id = prefix + "-" + key;
    const input = typeof value === "boolean" ? h("input", { id, type: "checkbox", checked: value, disabled: !writable, onChange: (e) => {
      void commit({ [key]: e.currentTarget.checked });
    } }) : h("input", { id, type: "number", step: 1, min: NUMBER_RANGES[key]?.[0], max: NUMBER_RANGES[key]?.[1], value: draft[key] ?? String(value), disabled: !writable, onChange: (e) => setDraft((current) => ({ ...current, [key]: e.currentTarget.value })), style: { width: 110, font: "inherit" } });
    return h("div", { key, style: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, padding: "8px 0" } }, h("label", { htmlFor: id }, SETTING_LABELS[key]), input);
  }) : [];
  return h(
    "section",
    { "aria-label": "Mouse Keyboard Plugin \u8BBE\u7F6E", style: { maxWidth: 640, width: "100%", boxSizing: "border-box", padding: 16, color: "var(--dsw-alias-label-primary,#1f2937)" } },
    h("h3", null, "\u9F20\u6807\u4E0E\u952E\u76D8"),
    h("p", null, "\u6A21\u578B\u53EF\u81EA\u884C\u9009\u62E9\u7535\u8111\u64CD\u4F5C\uFF0C\u81EA\u52A8\u6062\u590D\u5E76\u524D\u7F6E\u76EE\u6807\u7A97\u53E3\uFF0C\u5B8C\u6210\u540E\u4EA4\u8FD8\u7535\u8111\u7EE7\u7EED\u601D\u8003\u3002\u64CD\u4F5C\u65F6\u663E\u793A\u84DD\u8272\u6307\u9488\u548C\u53F3\u4E0B\u89D2 DeepSeek \u52A8\u753B\uFF1B\u6309 Esc \u505C\u6B62\u3002"),
    !ok ? h("p", { role: "alert" }, snapshot.status === "loading" ? "\u6B63\u5728\u8BFB\u53D6\u63D2\u4EF6\u914D\u7F6E\u2026" : "\u63D2\u4EF6\u914D\u7F6E\u4E0D\u53EF\u7528\uFF0C\u5F53\u524D\u65E0\u6CD5\u4FEE\u6539\u3002") : snapshot.writable !== true ? h("p", { role: "status" }, "\u5F53\u524D\u8FDE\u63A5\u4E3A\u53EA\u8BFB\uFF0C\u53EF\u4EE5\u67E5\u770B\u8BBE\u7F6E\u3002") : null,
    ...rows,
    ok ? h("div", { style: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 } }, h("button", { type: "button", disabled: !writable || Object.keys(draft).length === 0, onClick: () => {
      const patch = {};
      for (const [key, value] of Object.entries(draft)) Object.assign(patch, { [key]: Number(value) });
      void commit(patch);
    } }, "\u4FDD\u5B58\u6570\u503C\u8BBE\u7F6E"), h("button", { type: "button", disabled: !writable || !snapshot.value.enabled, onClick: () => {
      void commit({ enabled: false });
    } }, "\u7ACB\u5373\u505C\u7528\u63D2\u4EF6")) : null,
    h("p", { role: message.includes("\u5931\u8D25") ? "alert" : "status", "aria-live": "polite" }, message),
    h("p", { style: { fontSize: 12, opacity: 0.8 } }, "\u4FEE\u6539\u8BBE\u7F6E\u4F1A\u4EA4\u8FD8\u7535\u8111\u5E76\u6E05\u9664\u65E7\u5F15\u7528\uFF1B\u6A21\u578B\u53EF\u5728\u5F53\u524D\u4EFB\u52A1\u4E2D\u81EA\u884C\u91CD\u65B0\u5F00\u542F\u3002")
  );
}
function apply(ctx) {
  const forms = ctx.get("configForms");
  if (!forms) throw new Error("Mouse Keyboard Plugin requires native config forms.");
  const form = forms.get("mouse-keyboard-plugin");
  ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", id: "mouse-keyboard-plugin-settings", order: 65, label: () => "\u9F20\u6807\u4E0E\u952E\u76D8", inject: () => ({ form }) }, SettingsSection));
}

return module.exports;}});
