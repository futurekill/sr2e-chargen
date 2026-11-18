import { mount } from "svelte";
import "@fontsource/atkinson-hyperlegible-next/latin-400.css";   // the readable font (U22), self-hosted
import "@fontsource/atkinson-hyperlegible-next/latin-700.css";
import "@fontsource/atkinson-hyperlegible-next/latin-ext-400.css";
import "@fontsource/atkinson-hyperlegible-next/latin-ext-700.css";
import "./themes/terminal.css";
import "./app.css";
import App from "./App.svelte";

const root = document.documentElement;
root.dataset.theme = "terminal";
try { if (localStorage.getItem("font") === "readable") root.dataset.font = "readable"; } catch { /* private mode: default font */ }
mount(App, { target: document.getElementById("app") });
