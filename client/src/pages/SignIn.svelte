<script>
  import { post } from "../lib/api.js";
  let { onDone } = $props();
  let username = $state(""), password = $state(""), error = $state(""), busy = $state(false);

  async function submit(ev) {
    ev.preventDefault();
    busy = true; error = "";
    try { await post("/api/login", { username, password }); await onDone(); }
    catch (err) { error = err.message; password = ""; }
    busy = false;
  }
</script>

<h1>Jack in</h1>
<p class="muted">Invite only. No invite? Ask whoever runs this node.</p>
{#if error}<p class="notice bad" role="alert">{error}</p>{/if}
<form class="stack" onsubmit={submit}>
  <label><span>Handle</span><input bind:value={username} name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
  <label><span>Password</span><input bind:value={password} name="password" type="password" autocomplete="current-password" required></label>
  <div class="row"><button disabled={busy}>{busy ? "Checking…" : "Jack in"}</button></div>
</form>
