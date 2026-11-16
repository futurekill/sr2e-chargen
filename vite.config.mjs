import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// The client is built once and served by the app itself (same origin: the session cookie and the CSP need it).
export default defineConfig({
  root: "client",
  plugins: [svelte()],
  build: { outDir: "../dist/client", emptyOutDir: true, assetsInlineLimit: 0, cssCodeSplit: false, sourcemap: false }
});
