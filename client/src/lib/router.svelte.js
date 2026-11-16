/** A tiny history router: no hash routes (the fragment is reserved for one-time link secrets). */
export const route = $state({ path: location.pathname });
export function go(path, { replace = false } = {}) {
  if (path !== location.pathname) history[replace ? "replaceState" : "pushState"](null, "", path);
  route.path = path;
  window.scrollTo(0, 0);
}
addEventListener("popstate", () => { route.path = location.pathname; });
/** Same-origin link clicks stay in the app. */
addEventListener("click", (ev) => {
  const a = ev.target.closest?.("a[href]");
  if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || a.target || a.hasAttribute("download")) return;
  const url = new URL(a.href);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  ev.preventDefault();
  go(url.pathname);
});
/** Read a one-time secret from the fragment (`#k=…`) and wipe it from the address bar and history at once. */
export function takeFragmentSecret() {
  const m = /^#k=([A-Za-z0-9_-]{43})$/.exec(location.hash);
  if (location.hash) history.replaceState(null, "", location.pathname);
  return m ? m[1] : null;
}
