<script>
  import { post } from "../lib/api.js";
  import { linkSecret } from "../lib/router.svelte.js";
  let { mode, onDone } = $props();
  // The secret arrived in the URL fragment (never sent to a server); the router wiped it from the address bar at load.
  const secret = linkSecret;
  let username = $state(""), password = $state(""), again = $state(""), error = $state(""), busy = $state(false), done = $state(false);
  const reset = $derived(mode === "reset");

  async function submit(ev) {
    ev.preventDefault();
    if (password !== again) { error = "Those two passwords don't match."; return; }
    busy = true; error = "";
    try {
      if (reset) { await post("/api/reset", { secret, password }); done = true; }
      else { await post("/api/redeem", { secret, username, password }); await onDone(); }
    } catch (err) { error = err.message; }
    busy = false;
  }
</script>

{#if !secret}
  <h1>That link is dead</h1>
  <p>It's missing its key, or it was already opened in this tab. Links work once: ask for a fresh one.</p>
  <p><a href="/">Back to the front door.</a></p>
{:else if done}
  <h1>Password changed</h1>
  <p class="notice good">Done. Every old session was cut.</p>
  <p><a class="button" href="/">Jack in</a></p>
{:else}
  <h1>{reset ? "Pick a new password" : "Welcome, chummer"}</h1>
  <p class="muted">{reset ? "This link works once." : "Pick a handle and a password. This invite works once."}</p>
  {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
  <form class="stack" onsubmit={submit}>
    {#if !reset}
      <label><span>Handle (3–32: letters, digits, dot, dash, underscore)</span>
        <input bind:value={username} name="username" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="32" required></label>
    {/if}
    <label><span>Password (12 characters or more)</span><input bind:value={password} type="password" autocomplete="new-password" minlength="12" maxlength="256" required></label>
    <label><span>Password again</span><input bind:value={again} type="password" autocomplete="new-password" required></label>
    <div class="row"><button disabled={busy}>{busy ? "Working…" : reset ? "Set password" : "Create account"}</button></div>
  </form>
{/if}
