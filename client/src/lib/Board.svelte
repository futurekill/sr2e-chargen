<script>
  /**
   * The Shadowland board (docs/PLAN-help-footer.md 3): a thread of in-character banter that fits where you are, new on
   * every page, revealed line by line like a live BBS. Decoration, never an announcement: assistive tech gets a
   * complete static copy (all lines, not live); the animated copy is aria-hidden. Pause shows the whole thread
   * (2.2.2); "reduce motion" shows it at once (2.3.3).
   */
  import { onDestroy, tick, untrack } from "svelte";
  import { board } from "./context.svelte.js";
  import { route } from "./router.svelte.js";
  import { setBanter } from "./prefs.svelte.js";
  import { BANTER } from "./banter.js";
  import { contextKeys, pickThread } from "../../../shared/banter.mjs";
  let { onHidden = () => {} } = $props();

  const rng = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32; };
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let thread = $state(null), shown = $state(0), typing = $state(false), paused = $state(false), error = $state("");
  let timer = null;
  const stop = () => { clearTimeout(timer); timer = null; typing = false; };
  onDestroy(stop);

  // A new thread when the place changes (a page, a character step) — never on an ordinary re-render.
  const place = $derived(`${route.path}|${board.page}|${board.step}|${board.race}|${board.choices.join(",")}`);
  $effect(() => {
    void place;
    untrack(pick);   // only `place` re-runs this; the reveal's own state must not
  });
  function pick() {
    const keys = contextKeys(board);
    let avoid = null;
    try { avoid = sessionStorage.getItem(`banter:${keys[0]}`); } catch { /* no memory in private mode */ }
    const t = pickThread(BANTER, keys, rng, { avoid });
    try { if (t) sessionStorage.setItem(`banter:${keys[0]}`, t.id); } catch { /* fine */ }
    stop();
    thread = t;
    paused = false;
    shown = reduced ? (t?.lines.length ?? 0) : 0;
    if (!reduced && t) next();
  }
  /** Reveal the next line after a short "typing" pause, like a live board (about 1.2–2.5 s a line). */
  function next() {
    if (!thread || shown >= thread.lines.length) { typing = false; return; }
    typing = true;
    timer = setTimeout(() => { typing = false; shown++; timer = setTimeout(next, 250); }, 1200 + Math.floor(rng() * 1300));
  }
  const done = $derived(!!thread && shown >= thread.lines.length);
  function pauseOrReplay() {
    if (done) { if (reduced) return; shown = 0; paused = false; next(); return; }
    stop(); paused = true; shown = thread.lines.length;   // paused = the whole thread, still (2.2.2)
  }
  async function hide() {
    try { await setBanter(false); await tick(); onHidden(); }
    catch (err) { error = err.message; }
  }
</script>

{#if thread}
  <section class="board" aria-labelledby="board-title">
    <div class="bar">
      <h2 id="board-title">Shadowland <span class="muted">// board</span></h2>
      <button type="button" class="quiet small" onclick={pauseOrReplay}>{done ? "Replay" : "Pause"}</button>
      <button type="button" class="quiet small" onclick={hide}>Hide banter</button>
    </div>
    {#if error}<p class="notice bad" role="alert">{error}</p>{/if}
    <!-- For assistive tech: the whole thread, always (not live: it never interrupts). -->
    <ol class="sr-only">{#each thread.lines as l, i (i)}<li>{l.handle}: {l.text}</li>{/each}</ol>
    <!-- For the eye: the same lines, revealed one by one. -->
    <ol class="screen" aria-hidden="true">
      {#each thread.lines.slice(0, shown) as l, i (i)}
        <li><span class="msg">&gt;&gt;&gt;&gt;&gt;[ {l.text} ]&lt;&lt;&lt;&lt;&lt;</span> <span class="who">—{l.handle} <span class="stamp">&lt;{l.stamp}&gt;</span></span></li>
      {/each}
      {#if typing && thread.lines[shown]}<li class="typing">{thread.lines[shown].handle} is typing…</li>{/if}
    </ol>
  </section>
{/if}

<style>
  .board { border: 1px solid var(--line); background: var(--surface); padding: .6rem .8rem .7rem; margin: 0 0 1rem; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem .8rem; }
  .bar h2 { margin: 0 auto 0 0; font-size: .85rem; }
  .bar button { min-height: 2.25rem; padding: .25rem .7rem; font-size: .85rem; }
  .screen { list-style: none; margin: .5rem 0 0; padding: 0; font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: .85rem; line-height: 1.45; }
  .screen li { margin: 0 0 .35rem; overflow-wrap: anywhere; }
  .msg { color: var(--ink); }
  .who { color: var(--accent); }
  .stamp { color: var(--muted); }
  .typing { color: var(--muted); font-style: italic; }
</style>
