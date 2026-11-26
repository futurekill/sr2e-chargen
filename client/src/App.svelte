<script>
  import { route, go } from "./lib/router.svelte.js";
  import { session, post, forgetSession, applyFont, applyTheme } from "./lib/api.js";
  import SignIn from "./pages/SignIn.svelte";
  import Redeem from "./pages/Redeem.svelte";
  import Library from "./pages/Library.svelte";
  import Document from "./pages/Document.svelte";
  import Account from "./pages/Account.svelte";
  import Admin from "./pages/Admin.svelte";
  import Catalog from "./pages/Catalog.svelte";

  let user = $state(null), ready = $state(false), down = $state("");
  const open = ["/redeem", "/reset"];   // pages for people who aren't signed in yet
  const docId = $derived(/^\/doc\/([0-9a-f-]{36})$/.exec(route.path)?.[1] ?? null);

  async function refresh() {
    try { user = await session(); down = ""; if (user?.prefs) { applyFont(user.prefs.readableFont); applyTheme(user.prefs.theme); } } catch (err) { down = err.message; }
    ready = true;
  }
  async function signOut() {
    try { await post("/api/logout"); } catch { /* already gone */ }
    forgetSession(); user = null; go("/");
  }
  refresh();
</script>

<div class="shell">
  <header class="top">
    <a class="brand" href="/">Hoi chummer!</a>
    {#if user}
      <nav aria-label="Main">
        <a href="/" aria-current={route.path === "/" ? "page" : undefined}>Library</a>
        <a href="/catalog" aria-current={route.path === "/catalog" ? "page" : undefined}>Catalog</a>
        <a href="/account" aria-current={route.path === "/account" ? "page" : undefined}>Account</a>
        {#if user.role === "admin"}<a href="/admin" aria-current={route.path === "/admin" ? "page" : undefined}>Admin</a>{/if}
        <button class="quiet" onclick={signOut}>Jack out</button>
      </nav>
    {/if}
  </header>

  <main>
    {#if !ready}
      <p class="muted prompt">Connecting…</p>
    {:else if down}
      <p class="notice bad" role="alert">{down}</p>
      <button onclick={refresh}>Try again</button>
    {:else if open.includes(route.path)}
      <Redeem mode={route.path === "/reset" ? "reset" : "redeem"} onDone={async () => { await refresh(); go("/", { replace: true }); }} />
    {:else if !user}
      <SignIn onDone={async () => { await refresh(); }} />
    {:else if docId}
      {#key docId}<Document id={docId} />{/key}
    {:else if route.path === "/catalog"}
      <Catalog />
    {:else if route.path === "/account"}
      <Account {user} onSignedOut={() => { forgetSession(); user = null; go("/"); }} />
    {:else if route.path === "/admin" && user.role === "admin"}
      <Admin />
    {:else if route.path === "/"}
      <Library />
    {:else}
      <h1>Nothing here</h1>
      <p>That address doesn't lead anywhere. <a href="/">Back to your library.</a></p>
    {/if}
  </main>
</div>
