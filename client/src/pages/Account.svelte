<script>
  import { post, put, applyFont } from "../lib/api.js";
  let { user, onSignedOut } = $props();
  let current = $state(""), next = $state(""), again = $state(""), error = $state(""), busy = $state(false);
  let readable = $state(document.documentElement.dataset.font === "readable");

  /** Saved on the server (every device, and the sheet's default font), applied here at once. */
  async function setFont() {
    applyFont(readable);
    try { await put("/api/account/prefs", { readableFont: readable }); } catch (err) { error = err.message; }
  }
  async function change(ev) {
    ev.preventDefault();
    if (next !== again) { error = "Those two passwords don't match."; return; }
    busy = true; error = "";
    try { await post("/api/account/password", { current, next }); onSignedOut(); }
    catch (err) { error = err.message; }
    busy = false;
  }
  async function everywhere() {
    try { await post("/api/logout-everywhere"); onSignedOut(); } catch (err) { error = err.message; }
  }
</script>

<h1>{user.username}</h1>
<p class="muted">{user.role === "admin" ? "Admin of this node." : "Runner."}</p>
{#if error}<p class="notice bad" role="alert">{error}</p>{/if}

<h2>Reading</h2>
<label class="row"><input class="check" type="checkbox" bind:checked={readable} onchange={setFont}><span>Use an easy-to-read font (Atkinson Hyperlegible) on the site and on printed sheets</span></label>

<h2>Change password</h2>
<p class="muted">Changing it signs you out on every device.</p>
<form class="stack" onsubmit={change}>
  <label><span>Current password</span><input bind:value={current} type="password" autocomplete="current-password" required></label>
  <label><span>New password (12 characters or more)</span><input bind:value={next} type="password" autocomplete="new-password" minlength="12" maxlength="256" required></label>
  <label><span>New password again</span><input bind:value={again} type="password" autocomplete="new-password" required></label>
  <div class="row"><button disabled={busy}>{busy ? "Working…" : "Change password"}</button></div>
</form>

<h2>Sessions</h2>
<p><button class="quiet" onclick={everywhere}>Jack out everywhere</button></p>
