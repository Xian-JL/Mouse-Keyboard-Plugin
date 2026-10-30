// src/shared/apps.ts
var APP_ALIASES = Object.freeze({ notepad: ["\u8BB0\u4E8B\u672C", "notepad"], winword: ["Microsoft Word", "Word"], excel: ["Microsoft Excel", "Excel"], msedge: ["Microsoft Edge", "Edge"], chrome: ["Google Chrome", "Chrome"] });
function appSearchAliases(query) {
  if (query === void 0) return [];
  const plain = query.trim().replace(/\.exe$/i, "").toLowerCase();
  for (const [app, aliases] of Object.entries(APP_ALIASES)) if (plain === app || aliases.some((alias) => alias.toLowerCase() === plain)) return [.../* @__PURE__ */ new Set([app + ".exe", ...aliases])];
  return [];
}

export {
  appSearchAliases
};
