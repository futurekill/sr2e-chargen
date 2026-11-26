<script>
  import { get, post, put, applyFont, applyTheme } from "../lib/api.js";
  import { THEMES } from "../../../shared/themes.mjs";
  let { user, onSignedOut } = $props();
  let current = $state(""), next = $state(""), again = $state(""), error = $state(""), busy = $state(false);
  let readable = $state(document.documentElement.dataset.font === "readable");
  let theme = $state(document.documentElement.dataset.theme);
  let savedTheme = theme;   // the last theme the server confirmed: shown again if a save can't be confirmed (r1 #2)

  /** Saved on the server (every device, and the sheet's default font), then applied; one save at a time (r1 #4 #5). */
  let saving = $state(false);
  async function setFont() {
    saving = true; error = "";
    try { const p = await put("/api/account/prefs", { readableFont: readable }); readable = p.readableFont; applyFont(readable); }
    catch (err) {
      error = err.message;
      // The answer may be lost after the save landed: show what the server holds (r2 #4).
      try { readable = (await get("/api/account/prefs")).readableFont; applyFont(readable); } catch { readable = !readable; }
    }
    saving = false;
  }
  /** Shown at once; saved on the server for every device. A failed save shows what the server holds. */
  async function setTheme() {
    saving = true; error = ""; applyTheme(theme);
    try { theme = savedTheme = (await put("/api/account/prefs", { theme })).theme; }
    catch (err) {
      error = err.message;
      try { theme = savedTheme = (await get("/api/account/prefs")).theme; } catch { theme = savedTheme; }
    }
    applyTheme(theme);
    saving = false;
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

<h2>Look</h2>
<label><span>Theme</span><select bind:value={theme} onchange={setTheme} disabled={saving}>
  {#each THEMES as t (t.key)}<option value={t.key}>{t.name}</option>{/each}
</select></label>

<h2>Reading</h2>
<label class="row"><input class="check" type="checkbox" bind:checked={readable} onchange={setFont} disabled={saving}><span>Use an easy-to-read font (Atkinson Hyperlegible) on the site and on printed sheets</span></label>

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
