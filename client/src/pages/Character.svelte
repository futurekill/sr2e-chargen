<script>
  /**
   * Character creation (docs/PLAN-M2.md §6). Every change is ONE operation: applied here at once with the shared
   * reducer (a fast screen), then sent to the server, whose answer replaces the local copy. Changes go out one at a
   * time, in order, each on top of the revision the previous answer gave.
   */
  import { get, mutate } from "../lib/api.js";
  import { applyOp, validate, CATEGORIES, CATEGORY_NAMES, LETTERS, METATYPES, MAGIC_TYPES, MAGIC_NAMES, TRADITIONS, ATTRIBUTES, ATTR_NAMES, totemNames } from "../../../shared/creation.mjs";
  import { TABLES } from "../../../shared/rules.mjs";
  let { doc: initial, onDeleted } = $props();

  // Plain objects, not reactive proxies: the reducer clones them (structuredClone can't clone a proxy).
  const start = $state.snapshot(initial);
  let server = $state.raw(start), body = $state.raw(start.body), error = $state(""), sending = $state(0);
  let queue = Promise.resolve();
  const check = $derived(validate(body));
  const sys = $derived(body.actor.system), pr = $derived(sys.chargen.priorities), opts = $derived(body.creation.options);
  const finished = $derived(!!body.creation.finished);
  const TOTEMS = Object.entries(totemNames()).sort((a, b) => a[1].localeCompare(b[1]));
  const STEPS = [["concept", "Concept"], ["priorities", "Priorities"], ["metatype", "Metatype"], ["magic", "Magic"], ["attributes", "Attributes"]];
  const nuyen = (n) => `${n.toLocaleString("en-US")}¥`;
  const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "");

  /**
   * Make a change: refused here (the same reducer the server runs) or shown at once, then saved. When a save fails,
   * the changes still waiting are DROPPED (code review M2a #5): each was made on top of the failed one, so sending it
   * against what the server really holds could save something the player never saw.
   */
  let epoch = 0;
  function change(op) {
    try { body = applyOp(body, op); } catch (err) { error = err.message; return; }
    error = ""; sending++;
    const mine = epoch;
    queue = queue.then(async () => {
      if (mine === epoch) {
        try { server = await mutate("POST", `/api/documents/${server.document.id}/ops`, { revision: server.document.revision, ops: [op] }); }
        catch (err) {
          epoch++;
          error = err.code === "stale" ? "This character changed somewhere else. It now shows the saved version: redo your last changes."
            : err.code === "network" ? "The line dropped. This shows what was saved: redo your last changes." : err.message;
          try { server = await get(`/api/documents/${server.document.id}`); } catch { /* keep the last answer */ }
        }
      }
      if (--sending === 0) body = server.body;   // the server's copy wins once nothing else is on its way
    });
  }
  const numberFrom = (ev) => Number.parseInt(ev.currentTarget.value, 10);
  let nameInput = $state(initial.body.name);
  let notesInput = $state(initial.body.notes);
</script>

<div class="sheet">
  <div class="steps">
    <header>
      <h1>{body.name}</h1>
      <p class="muted">character · revision {server.document.revision} · {sending ? "saving…" : "saved"}{finished ? " · finished" : ""}</p>
      <nav aria-label="Steps" class="row">{#each STEPS as [id, title]}<a href={`#step-${id}`}>{title}</a>{/each}</nav>
    </header>
    {#if error}<p class="notice bad" role="alert">{error}</p>{/if}

    <section id="step-concept">
      <h2>Concept</h2>
      <form class="stack wide" onsubmit={(ev) => { ev.preventDefault(); if (nameInput.trim() && nameInput.trim() !== body.name) change({ op: "setName", name: nameInput }); }}>
        <div class="row">
          <label class="grow"><span>Street name</span><input bind:value={nameInput} maxlength="120" required disabled={finished}></label>
          <button disabled={finished || !nameInput.trim() || nameInput.trim() === body.name}>Rename</button>
        </div>
      </form>
      <label class="notes"><span>Notes: who is this, and why do they run the shadows?</span>
        <textarea bind:value={notesInput} maxlength="20000" onchange={() => notesInput !== body.notes && change({ op: "setNotes", notes: notesInput })}></textarea></label>
    </section>

    <section id="step-priorities">
      <h2>Priorities</h2>
      <p class="muted">Give each of the five categories one letter, A to E. Each letter once: picking a letter another category has swaps the two. <span class="cite">SR2 p.44</span></p>
      <div class="scroll"><table class="grid">
        <thead><tr><th scope="col">Category</th>{#each LETTERS as l}<th scope="col">{l}</th>{/each}</tr></thead>
        <tbody>
          {#each CATEGORIES as c}
            <tr>
              <th scope="row">{CATEGORY_NAMES[c]}</th>
              {#each LETTERS as l}
                <td><input type="radio" class="check" name={`prio-${c}`} aria-label={`${CATEGORY_NAMES[c]} ${l}`} checked={pr[c] === l} disabled={finished}
                  onchange={() => change({ op: "setPriority", category: c, letter: l })}></td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table></div>
      <label class="row inline"><input type="checkbox" class="check" checked={opts.moreMetahumans} disabled={finished}
        onchange={(ev) => change({ op: "setOption", key: "moreMetahumans", value: ev.currentTarget.checked })}>
        <span>Optional rule: More Metahumans (metahumans at Race C; magic at A or B for everyone) <span class="cite">SR2 p.46</span></span></label>
      <dl class="table-rows">
        {#each LETTERS as l}
          <div><dt>{l}</dt><dd>{TABLES.priorities[l].attributes} attribute pts · {TABLES.priorities[l].skills} skill pts · {nuyen(TABLES.priorities[l].resources)}</dd></div>
        {/each}
      </dl>
    </section>

    <section id="step-metatype">
      <h2>Metatype</h2>
      <div class="row" role="radiogroup" aria-label="Metatype">
        {#each METATYPES as m}
          <label class="row inline"><input type="radio" class="check" name="metatype" checked={sys.race === m} disabled={finished} onchange={() => change({ op: "setMetatype", race: m })}><span>{m[0].toUpperCase() + m.slice(1)}</span></label>
        {/each}
      </div>
      <p class="muted">A metahuman needs Priority A in Race{opts.moreMetahumans ? " (C or better with More Metahumans)" : ""}. <span class="cite">SR2 p.44</span></p>
    </section>

    <section id="step-magic">
      <h2>Magic</h2>
      <div class="row">
        <label><span>Magic</span>
          <select value={sys.magic.type} disabled={finished} onchange={(ev) => change({ op: "setMagic", type: ev.currentTarget.value })}>
            {#each MAGIC_TYPES as t}<option value={t}>{MAGIC_NAMES[t][0].toUpperCase() + MAGIC_NAMES[t].slice(1)}</option>{/each}
          </select></label>
        {#if sys.magic.type === "full_magician"}
          <label><span>Tradition</span>
            <select value={sys.magic.tradition} disabled={finished} onchange={(ev) => change({ op: "setTradition", tradition: ev.currentTarget.value })}>
              <option value="none">Choose…</option>
              {#each TRADITIONS as t}<option value={t}>{t[0].toUpperCase() + t.slice(1)}</option>{/each}
            </select></label>
          {#if sys.magic.tradition === "shamanic"}
            <label><span>Totem <span class="cite">SR2 p.119</span></span>
              <select value={sys.magic.totem} disabled={finished} onchange={(ev) => change({ op: "setTotem", totem: ev.currentTarget.value })}>
                <option value="">Choose…</option>
                {#each TOTEMS as [k, name]}<option value={k}>{name}</option>{/each}
              </select></label>
          {/if}
        {/if}
      </div>
    </section>

    <section id="step-attributes">
      <h2>Attributes</h2>
      <p class="muted">Buy each attribute from 1; racial modifiers apply after. <span class="cite">SR2 p.45</span></p>
      <div class="scroll"><table class="grid attrs">
        <thead><tr><th scope="col">Attribute</th><th scope="col">Bought</th><th scope="col">Racial</th><th scope="col">Rating</th><th scope="col">Max</th></tr></thead>
        <tbody>
          {#each ATTRIBUTES as a}
            {@const mod = TABLES.racialModifiers[sys.race]?.[a] ?? 0}
            {@const max = TABLES.racialMaximums[sys.race]?.[a] ?? 6}
            {@const rating = sys[a].base + mod}
            <tr>
              <th scope="row">{ATTR_NAMES[a]}</th>
              <td><input type="number" min="1" max="12" step="1" value={sys[a].base} aria-label={`${ATTR_NAMES[a]} bought`} disabled={finished}
                onchange={(ev) => { const n = numberFrom(ev); if (Number.isInteger(n) && n !== sys[a].base) change({ op: "setAttribute", attr: a, base: n }); else ev.currentTarget.value = sys[a].base; }}></td>
              <td>{sign(mod)}</td>
              <td class:bad={rating > max || rating < 1}>{rating}</td>
              <td class="muted">{max}</td>
            </tr>
          {/each}
        </tbody>
      </table></div>
    </section>

    <p class="row later"><button type="button" class="danger" onclick={onDeleted}>Delete character</button></p>
  </div>

  <aside class="panel" aria-label="Rules check">
    <h2>Rules check</h2>
    <dl>
      <div><dt>Attribute points</dt><dd class:bad={pr.attributes && check.budgets.attributes.over}>{check.budgets.attributes.spent} / {pr.attributes ? check.budgets.attributes.total : "—"}</dd></div>
      {#if sys.magic.type === "full_magician"}<div><dt>Force Points</dt><dd>{check.budgets.forcePoints.total}</dd></div>{/if}
      <div><dt>Nuyen</dt><dd>{pr.resources ? nuyen(check.budgets.resources.total) : "—"}</dd></div>
    </dl>
    {#if check.problems.length === 0}
      <p class="good">No problems in these steps. Skills, gear and finishing come next.</p>
    {:else}
      <ul class="problems">
        {#each check.problems as p, i (i)}
          <li class={p.severity}><a href={`#step-${p.step}`}>{p.severity === "error" ? "Rule" : p.severity === "todo" ? "To do" : "Note"}</a> {p.text} <span class="cite">SR2 p.{p.cite.page}</span></li>
        {/each}
      </ul>
    {/if}
  </aside>
</div>

<style>
  .sheet { display: grid; gap: 1.5rem; grid-template-columns: minmax(0, 1fr); }
  @media (min-width: 60rem) { .sheet { grid-template-columns: minmax(0, 1fr) 19rem; align-items: start; } .panel { position: sticky; top: 1rem; } }
  section { scroll-margin-top: 1rem; }
  .panel { border: 1px solid var(--line); background: var(--surface); padding: .9rem 1rem; }
  .panel h2 { margin-top: 0; }
  .problems { list-style: none; margin: .8rem 0 0; padding: 0; display: grid; gap: .55rem; font-size: .95rem; }
  .problems a { font-weight: 700; margin-right: .25rem; }
  .problems li.error a { color: var(--danger); }
  .problems li.warning { color: var(--muted); }
  .good { color: var(--ok); margin: .8rem 0 0; }
  .bad { color: var(--danger); font-weight: 700; }
  .cite { color: var(--muted); font-size: .85rem; white-space: nowrap; }
  table.grid { border-collapse: collapse; margin: 0 0 1rem; }
  .scroll { overflow-x: auto; }
  table.grid th, table.grid td { padding: .3rem .4rem; border-bottom: 1px solid var(--line); text-align: center; }
  table.grid th[scope="row"] { text-align: left; font-weight: 400; }
  table.grid thead th { color: var(--muted); font-weight: 400; font-size: .9rem; }
  table.attrs input { width: 3.75rem; text-align: right; padding: .3rem .45rem; }
  label.inline { display: flex; gap: .5rem; margin: 0 0 1rem; }
  label.notes { margin-top: 1rem; }
  .table-rows { margin-bottom: .5rem; font-size: .9rem; }
  .later { margin-top: 2.5rem; }
</style>
