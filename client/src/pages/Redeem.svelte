<script>
  import { post } from "../lib/api.js";
  import { linkSecret } from "../lib/router.svelte.js";
  let { mode, onDone } = $props();
  // The secret arrived in the URL fragment (never sent to a server); the router wiped it from the address bar at load.
  const secret = linkSecret;
  import { tick } from "svelte";
  let username = $state(""), password = $state(""), again = $state(""), error = $state(""), busy = $state(false), done = $state(false);
  // The field a refusal is about (3.3.1): marked invalid, tied to the message, focused.
  let bad = $state(""), form = $state();
  const fieldOf = (err) => (err.code === "username-taken" || /handle/i.test(err.message) ? "username" : /password/i.test(err.message) ? "password" : "");
  const invalid = (f) => (bad === f ? { "aria-invalid": "true", "aria-describedby": "redeem-error" } : {});
  async function show(msg, field) { error = msg; bad = field; await tick(); form?.querySelector(`[name="${field}"]`)?.focus(); }
  const reset = $derived(mode === "reset");

  async function submit(ev) {
    ev.preventDefault();
    if (password !== again) return show("Those two passwords don't match.", "again");
    busy = true; error = ""; bad = "";
    try {
      if (reset) { await post("/api/reset", { secret, password }); done = true; }
      else { await post("/api/redeem", { secret, username, password }); await onDone(); }
    } catch (err) { busy = false; return show(err.message, fieldOf(err)); }
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
  {#if error}<p class="notice bad" role="alert" id="redeem-error">{error}</p>{/if}
  <form class="stack" onsubmit={submit} bind:this={form}>
    {#if !reset}
      <label><span>Handle (3–32: letters, digits, dot, dash, underscore)</span>
        <input {...invalid("username")} bind:value={username} name="username" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="32" required></label>
    {/if}
    <label><span>Password (12 characters or more)</span><input {...invalid("password")} name="password" bind:value={password} type="password" autocomplete="new-password" minlength="12" maxlength="256" required></label>
    <label><span>Password again</span><input {...invalid("again")} name="again" bind:value={again} type="password" autocomplete="new-password" required></label>
    <div class="row"><button disabled={busy}>{busy ? "Working…" : reset ? "Set password" : "Create account"}</button></div>
  </form>
{/if}
