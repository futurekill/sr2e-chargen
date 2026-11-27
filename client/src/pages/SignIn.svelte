<script>
  import { post } from "../lib/api.js";
  let { onDone } = $props();
  import { tick } from "svelte";
  let username = $state(""), password = $state(""), error = $state(""), busy = $state(false), userEl = $state();

  async function submit(ev) {
    ev.preventDefault();
    busy = true; error = "";
    try { await post("/api/login", { username, password }); await onDone(); }
    catch (err) { error = err.message; password = ""; await tick(); userEl?.focus(); }
    busy = false;
  }
</script>

<!-- The landing plate (docs/GRAPHICS.md; original art, prompt in docs/art/landing-prompt.txt): the same picture in
     every theme, framed by the theme's own tokens. Decorative, so screen readers skip it. -->
<div class="landing">
  <figure class="plate" aria-hidden="true">
    <img src="/art/landing-960.webp" srcset="/art/landing-640.webp 640w, /art/landing-960.webp 960w, /art/landing-1536.webp 1536w"
         sizes="(min-width: 72rem) 42rem, (min-width: 56rem) 60vw, 100vw" width="1536" height="1024" alt="" fetchpriority="high" decoding="async">
  </figure>
  <section class="gate" aria-labelledby="jack-in">
    <h1 id="jack-in">Jack in</h1>
    <p class="muted">Invite only. No invite? Ask whoever runs this node.</p>
    {#if error}<p class="notice bad" role="alert" id="signin-error">{error}</p>{/if}
    <form class="stack" onsubmit={submit}>
      <!-- A refused sign-in marks both fields: the server never says which one was wrong (3.3.1). -->
      <label><span>Handle</span><input bind:this={userEl} aria-invalid={error ? "true" : undefined} aria-describedby={error ? "signin-error" : undefined} bind:value={username} name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      <label><span>Password</span><input aria-invalid={error ? "true" : undefined} aria-describedby={error ? "signin-error" : undefined} bind:value={password} name="password" type="password" autocomplete="current-password" required></label>
      <div class="row"><button disabled={busy}>{busy ? "Checking…" : "Jack in"}</button></div>
    </form>
  </section>
</div>

<style>
  /* Wide: the plate fills the left, the gate stands on the right; narrow: the plate is a banner above the gate. */
  .landing {
    display: grid;
    gap: 0;
    border: 1px solid var(--line);
    background: var(--surface);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .plate { margin: 0; aspect-ratio: 16 / 9; background: var(--bg); }
  .plate img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 55% 62%; }
  .gate { padding: 1.25rem 1.25rem 1.75rem; }
  .gate h1 { font-size: clamp(2.6rem, 2rem + 3vw, 4.25rem); line-height: 1; letter-spacing: -0.01em; text-transform: var(--caps); margin: 0 0 .75rem; }
  .gate form { max-width: none; }
  .gate button { width: 100%; padding-block: .7rem; font-size: 1.05rem; text-transform: var(--caps); letter-spacing: .04em; }
  .landing ::selection { background: var(--accent); color: var(--on-accent); }

  /* Between the phone and the wide layout: a flatter banner, so the button stays in view on a short screen. */
  @media (min-width: 36rem) and (max-width: 55.99rem) { .plate { aspect-ratio: 3 / 1; } .plate img { object-position: 55% 35%; } }

  @media (min-width: 56rem) {
    .landing { grid-template-columns: minmax(0, 3fr) minmax(19rem, 2fr); }
    /* At least the picture's own shape (the whole team); taller when the form is taller, cropping only the sides. */
    .plate { aspect-ratio: auto; display: grid; }
    .plate img { aspect-ratio: 3 / 2; height: 100%; }
    .gate { align-self: center; padding: 2rem 2.25rem 2.5rem 1.25rem; }
  }

  /* One moment: the street comes up out of the dark as the page opens (already visible; no motion if reduced). */
  @media (prefers-reduced-motion: no-preference) {
    .plate img { animation: lights-up 1.4s cubic-bezier(.16, 1, .3, 1) both; }
    @keyframes lights-up { from { filter: brightness(.55) saturate(.6); } to { filter: none; } }
  }
</style>
