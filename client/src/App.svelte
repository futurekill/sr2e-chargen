<script>
  import { tick } from "svelte";
  import { route, go } from "./lib/router.svelte.js";
  import { page } from "./lib/page.svelte.js";
  import { loadPrefs } from "./lib/prefs.svelte.js";
  import { setBoard } from "./lib/context.svelte.js";
  import Footer from "./lib/Footer.svelte";
  import { session, post, forgetSession, applyFont, applyTheme } from "./lib/api.js";
  import SignIn from "./pages/SignIn.svelte";
  import Redeem from "./pages/Redeem.svelte";
  import Library from "./pages/Library.svelte";
  import Document from "./pages/Document.svelte";
  import Account from "./pages/Account.svelte";
  import Admin from "./pages/Admin.svelte";
  import Catalog from "./pages/Catalog.svelte";
  import Help from "./pages/Help.svelte";
  import WhatsNew from "./pages/WhatsNew.svelte";
  import { SECTIONS } from "./help/sections.js";

  let user = $state(null), ready = $state(false), down = $state("");
  const open = ["/redeem", "/reset"];   // pages for people who aren't signed in yet
  const docId = $derived(/^\/doc\/([0-9a-f-]{36})$/.exec(route.path)?.[1] ?? null);
  // Page titles (2.4.2), and focus + an announcement on every page change after the first (docs/PLAN-a11y.md 2): a
  // route change, or signing in or out at the same address. A document's title waits for its data (r1 #7).
  const STATIC = { "/": "Library", "/catalog": "Catalog", "/account": "Account", "/admin": "Admin" };
  const helpId = $derived(route.path === "/help" ? "" : /^\/help\/([a-z0-9-]+)$/.exec(route.path)?.[1] ?? null);
  const helpTitle = $derived(helpId === "" ? "Help" : helpId ? `${SECTIONS.find(s => s.id === helpId)?.title ?? "Not found"} · Help` : null);
  const title = $derived(!ready ? "" : down ? "Can't connect" : helpTitle ? helpTitle : route.path === "/whats-new" ? "What's new" : open.includes(route.path) ? (route.path === "/reset" ? "Reset your password" : "Redeem an invite")
    : !user ? "Jack in" : docId ? page.title : STATIC[route.path] ?? "Nothing here");
  let lastPlace = null, announce = $state("");
  $effect(() => {
    const place = `${route.path}${route.hash}|${user?.id ?? ""}`;
    if (!title) return;
    document.title = `${title} · Hoi, chummer!`;
    if (lastPlace === place) return;
    const first = lastPlace === null;
    lastPlace = place;
    if (first) { if (route.hash) tick().then(() => document.getElementById(decodeURIComponent(route.hash.slice(1)))?.scrollIntoView({ block: "start" })); return; }
    tick().then(() => {
      // An anchor (`/help/garage#mounts`) takes focus at its target; otherwise the page's heading does.
      const target = (route.hash && document.getElementById(decodeURIComponent(route.hash.slice(1)))) || document.querySelector("main h1");
      if (target) { if (!target.matches("a, button, input, select, textarea")) target.setAttribute("tabindex", "-1"); target.focus({ preventScroll: true }); target.scrollIntoView({ block: "start" }); }
      announce = document.title;
    });
  });
  $effect(() => { if (!docId) page.title = ""; });
  // The board's place: the page from the address; a document page refines it (its kind, a character's step).
  const BOARD_PAGE = { "/": "library", "/catalog": "catalog", "/account": "account", "/admin": "admin" };
  $effect(() => {
    const p = route.path, signedIn = !!user;
    setBoard({ page: !signedIn ? (p.startsWith("/help") ? "help" : "sign-in") : p.startsWith("/help") ? "help" : docId ? "" : BOARD_PAGE[p] ?? "any" });
  });

  async function refresh() {
    try { user = await session(); down = ""; loadPrefs(user); if (user?.prefs) { applyFont(user.prefs.readableFont); applyTheme(user.prefs.theme); } } catch (err) { down = err.message; }
    ready = true;
  }
  async function signOut() {
    try { await post("/api/logout"); } catch { /* already gone */ }
    forgetSession(); user = null; loadPrefs(null); go("/");
  }
  refresh();
</script>

<a class="skip" href="#main">Skip to content</a>
<p class="sr-only" aria-live="polite">{announce}</p>
<div class="shell">
  <header class="top">
    <a class="brand" href="/">Hoi, chummer!</a>
    {#if user}
      <nav aria-label="Main">
        <a href="/" aria-current={route.path === "/" ? "page" : undefined}>Library</a>
        <a href="/catalog" aria-current={route.path === "/catalog" ? "page" : undefined}>Catalog</a>
        <a href="/account" aria-current={route.path === "/account" ? "page" : undefined}>Account</a>
        {#if user.role === "admin"}<a href="/admin" aria-current={route.path === "/admin" ? "page" : undefined}>Admin</a>{/if}
        <a href="/help" aria-current={route.path.startsWith("/help") ? "page" : undefined}>Help</a>
        <button class="quiet" onclick={signOut}>Jack out</button>
      </nav>
    {/if}
  </header>

  <main id="main" tabindex="-1">
    {#if !ready}
      <p class="muted prompt">Connecting…</p>
    {:else if down}
      <p class="notice bad" role="alert">{down}</p>
      <button onclick={refresh}>Try again</button>
    {:else if open.includes(route.path)}
      <Redeem mode={route.path === "/reset" ? "reset" : "redeem"} onDone={async () => { await refresh(); go("/", { replace: true }); }} />
    {:else if route.path === "/whats-new"}
      <WhatsNew />
    {:else if helpId !== null}
      {#key helpId}<Help id={helpId || null} />{/key}
    {:else if !user}
      <SignIn onDone={async () => { await refresh(); }} />
    {:else if docId}
      {#key docId}<Document id={docId} />{/key}
    {:else if route.path === "/catalog"}
      <Catalog />
    {:else if route.path === "/account"}
      <Account {user} onSignedOut={() => { forgetSession(); user = null; loadPrefs(null); go("/"); }} />
    {:else if route.path === "/admin" && user.role === "admin"}
      <Admin me={user.id} onSelfDemoted={async () => { await refresh(); go("/", { replace: true }); }} />
    {:else if route.path === "/"}
      <Library />
    {:else}
      <h1>Nothing here</h1>
      <p>That address doesn't lead anywhere. <a href="/">Back to your library.</a></p>
    {/if}
  </main>
  {#if ready}<Footer />{/if}
</div>
