import { mount } from "svelte";
import "./themes/terminal.css";
import "./app.css";
import App from "./App.svelte";

const root = document.documentElement;
root.dataset.theme = "terminal";
try { if (localStorage.getItem("font") === "readable") root.dataset.font = "readable"; } catch { /* private mode: default font */ }
mount(App, { target: document.getElementById("app") });
