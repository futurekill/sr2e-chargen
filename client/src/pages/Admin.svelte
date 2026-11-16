<script>
  import { get, post, del } from "../lib/api.js";
  let invites = $state([]), users = $state([]), error = $state(""), fresh = $state(null), role = $state("user");
  const when = (ms) => new Date(Number(ms)).toLocaleString();

  async function load() {
    try { [invites, users] = [(await get("/api/admin/invites")).invites, (await get("/api/admin/users")).users]; error = ""; }
    catch (err) { error = err.message; }
  }
  const act = (fn) => async () => { try { await fn(); await load(); } catch (err) { error = err.message; } };
  const invite = act(async () => { fresh = { what: `Invite (${role})`, ...(await post("/api/admin/invites", { role })) }; });
  const revoke = (id) => act(async () => { await del(`/api/admin/invites/${id}`); });
  const toggle = (u) => act(async () => { await post(`/api/admin/users/${encodeURIComponent(u.username)}/${u.disabled_at == null ? "disable" : "enable"}`); });
  const resetLink = (u) => act(async () => { fresh = { what: `Password reset for ${u.username}`, ...(await post(`/api/admin/users/${encodeURIComponent(u.username)}/reset-link`)) }; });
  load();
</script>

<h1>Admin</h1>
{#if error}<p class="notice bad" role="alert">{error}</p>{/if}
{#if fresh}
  <div class="notice" role="status">
    <strong>{fresh.what}</strong> — shown once, works once, until {when(fresh.expiresAt)}. Send it over a channel you trust.
    <code class="link-once">{fresh.link}</code>
    <button class="quiet" onclick={() => (fresh = null)}>I've copied it</button>
  </div>
{/if}

<h2>Invites</h2>
<div class="row">
  <label class="row"><span>Role</span><select bind:value={role}><option value="user">runner</option><option value="admin">admin</option></select></label>
  <button onclick={invite}>New invite</button>
</div>
{#if invites.length}
  <ul class="list">
    {#each invites as i (i.id)}
      <li><span class="name">{i.kind} · {i.role}</span><span class="meta">expires {when(i.expires_at)}</span><button class="quiet" onclick={revoke(i.id)}>Revoke</button></li>
    {/each}
  </ul>
{:else}<p class="muted">No open invites.</p>{/if}

<h2>Users</h2>
<ul class="list">
  {#each users as u (u.id)}
    <li>
      <span class="name">{u.username}</span>
      <span class="meta">{u.role}{u.disabled_at != null ? " · disabled" : ""} · {u.doc_count} {u.doc_count === 1 ? "doc" : "docs"}</span>
      <button class="quiet" onclick={resetLink(u)}>Reset link</button>
      <button class={u.disabled_at == null ? "danger" : "quiet"} onclick={toggle(u)}>{u.disabled_at == null ? "Disable" : "Enable"}</button>
    </li>
  {/each}
</ul>
