import js from "@eslint/js";
export default [
  js.configs.recommended,
  { files: ["server/**/*.mjs", "test/**/*.mjs", "tools/**/*.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { process: "readonly", console: "readonly", Buffer: "readonly", URL: "readonly", setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly", Atomics: "readonly", SharedArrayBuffer: "readonly", Int32Array: "readonly", fetch: "readonly", structuredClone: "readonly", AbortSignal: "readonly" } } },
  // The accessibility scan runs some of its functions IN the page (puppeteer's evaluate): browser globals there.
  { files: ["tools/a11y-scan.mjs"], languageOptions: { globals: { document: "readonly", window: "readonly", Event: "readonly", KeyboardEvent: "readonly", getComputedStyle: "readonly", innerWidth: "readonly", innerHeight: "readonly", localStorage: "readonly" } } },
  // Shared with the browser: no Node globals.
  { files: ["shared/**/*.mjs"], languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { structuredClone: "readonly" } } }
];
