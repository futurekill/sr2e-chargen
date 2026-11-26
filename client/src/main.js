import { mount } from "svelte";
import "@fontsource/atkinson-hyperlegible-next/latin-400.css";   // the readable font (U22), self-hosted
import "@fontsource/atkinson-hyperlegible-next/latin-700.css";
import "@fontsource/atkinson-hyperlegible-next/latin-ext-400.css";
import "@fontsource/atkinson-hyperlegible-next/latin-ext-700.css";
import "./themes/terminal.css";
import "./themes/cyberpunk.css";
import "./themes/cybernoir.css";
import "./themes/geocities.css";
import "./readable-font.css";
import "./app.css";
import App from "./App.svelte";
import { applyTheme } from "./lib/api.js";

const root = document.documentElement;
let theme = null;
try { theme = localStorage.getItem("theme"); } catch { /* private mode: the default theme */ }
applyTheme(theme);
try { if (localStorage.getItem("font") === "readable") root.dataset.font = "readable"; } catch { /* private mode: default font */ }
mount(App, { target: document.getElementById("app") });
