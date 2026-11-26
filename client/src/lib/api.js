import { THEME_KEYS } from "../../../shared/themes.mjs";
/** The API client: same-origin JSON, the session's CSRF token on every change, a fresh Idempotency-Key per action. */
let csrf = null;

export class ApiError extends Error {
  constructor(status, body) { super(body?.error ?? "The line went dead. Try again."); this.status = status; this.code = body?.code ?? "network"; }
}
async function request(method, url, body, { key } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && csrf) headers["x-csrf-token"] = csrf;
  if (key) headers["idempotency-key"] = key;
  let res;
  try { res = await fetch(url, { method, headers, credentials: "same-origin", body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new ApiError(0, null); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
/** Who's signed in (and the CSRF token for this session), or null. */
export async function session() {
  try { const s = await request("GET", "/api/session"); csrf = s.csrf; return s.user; }
  catch (err) { csrf = null; if (err.status === 401) return null; throw err; }
}
export const get = (url) => request("GET", url);
export const post = (url, body = {}) => request("POST", url, body);
export const del = (url) => request("DELETE", url);
export const put = (url, body = {}) => request("PUT", url, body);
/** Apply a theme (shared/themes.mjs) to the page, and remember it for the next visit's first paint. */
export function applyTheme(theme) {
  const t = THEME_KEYS.includes(theme) ? theme : THEME_KEYS[0];
  document.documentElement.dataset.theme = t;
  // The browser's own toolbar colour follows the theme's background (code review r1 #3).
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  try { localStorage.setItem("theme", t); } catch { /* not remembered in private mode */ }
}
/** Apply the readable-font preference to the page, and remember it for the next visit's sign-in page. */
export function applyFont(readable) {
  if (readable) document.documentElement.dataset.font = "readable"; else delete document.documentElement.dataset.font;
  try { localStorage.setItem("font", readable ? "readable" : ""); } catch { /* not remembered in private mode */ }
}
/**
 * A change to the library. Its Idempotency-Key is bound to the EXACT request (method, address, body): if the answer
 * is lost, sending the identical request again reuses the key, and the server replays the first result instead of
 * applying it twice. The key is dropped once the server has answered (either way).
 */
const unanswered = new Map();
export async function mutate(method, url, body) {
  const signature = `${method} ${url} ${JSON.stringify(body)}`;
  const key = unanswered.get(signature) ?? crypto.randomUUID();
  unanswered.set(signature, key);
  try { const data = await request(method, url, body, { key }); unanswered.delete(signature); return data; }
  catch (err) { if (err.code !== "network") unanswered.delete(signature); throw err; }
}
export const forgetSession = () => { csrf = null; };
/** Send a file as the raw body (a portrait), with CSRF and a fresh Idempotency-Key. */
export async function upload(url, file) {
  let res;
  try { res = await fetch(url, { method: "PUT", credentials: "same-origin", headers: { "content-type": file.type, "x-csrf-token": csrf ?? "", "idempotency-key": crypto.randomUUID() }, body: file }); }
  catch { throw new ApiError(0, null); }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
