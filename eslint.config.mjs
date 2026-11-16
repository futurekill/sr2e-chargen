import js from "@eslint/js";
export default [
  js.configs.recommended,
  { files: ["server/**/*.mjs", "test/**/*.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { process: "readonly", console: "readonly", Buffer: "readonly", URL: "readonly", setTimeout: "readonly", clearTimeout: "readonly", fetch: "readonly" } } }
];
