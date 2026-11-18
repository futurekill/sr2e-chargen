<script>
  /**
   * Character creation (docs/PLAN-M2.md §6). Every change is ONE operation: applied here at once with the shared
   * reducer (a fast screen), then sent to the server, whose answer replaces the local copy. Changes go out one at a
   * time, in order, each on top of the revision the previous answer gave.
   */
  import { untrack, onDestroy } from "svelte";
  import { get, mutate } from "../lib/api.js";
  import { applyOp, validate, CATEGORIES, CATEGORY_NAMES, LETTERS, METATYPES, MAGIC_TYPES, MAGIC_NAMES, TRADITIONS, ATTRIBUTES, ATTR_NAMES, CUSTOM_SKILL_CATEGORIES, totemNames } from "../../../shared/creation.mjs";
  import { TABLES } from "../../../shared/rules.mjs";
  let { doc: initial, onDeleted } = $props();

  // Plain objects, not reactive proxies: the reducer clones them (structuredClone can't clone a proxy).
  // The page reads its document ONCE (Document.svelte re-creates it per id); later answers come from the server here.
  const start = untrack(() => $state.snapshot(initial));
  let server = $state.raw(start), body = $state.raw(start.body), error = $state(""), sending = $state(0);
  let queue = Promise.resolve();
  const check = $derived(validate(body));
  const sys = $derived(body.actor.system), pr = $derived(sys.chargen.priorities), opts = $derived(body.creation.options);
  const finished = $derived(!!body.creation.finished);
  const TOTEMS = Object.entries(totemNames()).sort((a, b) => a[1].localeCompare(b[1]));
  const STEPS = [["concept", "Concept"], ["priorities", "Priorities"], ["metatype", "Metatype"], ["magic", "Magic"], ["attributes", "Attributes"], ["skills", "Skills"]];
  const SKILL_CATEGORY = { active: "Active", knowledge: "Knowledge", language: "Language", build_repair: "Build/Repair", special: "Special" };
  /** The full catalog entries this page fetched (the reducer copies an entry's data into the character). */
  const entries = new Map();
  const lookup = (id) => entries.get(id) ?? null;
  let coreSkills = $state([]), pickSkill = $state(""), customCategory = $state("knowledge"), customName = $state("");
  get("/api/catalog/entries?type=skill&book=sr2&limit=100").then(r => { coreSkills = r.entries; }).catch(() => { /* the add list stays empty; the page still works */ });
  const skills = $derived(body.actor.items.filter(i => i.type === "skill"));
  const choicesOf = (item) => body.creation.items[item._id]?.choices ?? {};
  function skillChange(item, patch) {
    const c = choicesOf(item);
    change({ op: "setSkill", itemId: item._id, allocated: c.allocated, concentration: c.concentration, specialization: c.specialization, freeLanguage: c.freeLanguage, ...patch });
  }
  async function addCoreSkill() {
    const id = pickSkill;   // read once: the list can change while the entry is on its way
    if (!id) return;
    pickSkill = "";
    try { if (!entries.has(id)) entries.set(id, await get(`/api/catalog/entries/${encodeURIComponent(id)}`)); }
    catch (err) { if (!gone) error = err.message; return; }
    if (!gone) change({ op: "addSkill", catalogId: id });   // not after the page closed (review M2b #5)
  }
  const nuyen = (n) => `${n.toLocaleString("en-US")}¥`;
  const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "");

  /**
   * Make a change: refused here (the same reducer the server runs) or shown at once, then saved. When a save fails,
   * the changes still waiting are DROPPED (code review M2a #5): each was made on top of the failed one, so sending it
   * against what the server really holds could save something the player never saw.
   */
  let epoch = 0, recovering = $state(false), gone = false;
  onDestroy(() => { gone = true; });
  function change(op) {
    if (recovering) return;   // nothing new on top of a copy that's about to be replaced (review r2)
    try { body = applyOp(body, op, lookup); } catch (err) { error = err.message; return; }
    error = ""; sending++;
    const mine = epoch;
    queue = queue.then(async () => {
      if (mine === epoch) {
        try { server = await mutate("POST", `/api/documents/${server.document.id}/ops`, { revision: server.document.revision, ops: [op] }); }
        catch (err) {
          epoch++; recovering = true;
          error = err.code === "stale" ? "This character changed somewhere else. It now shows the saved version: redo your last changes."
            : err.code === "network" ? "The line dropped. This shows what was saved: redo your last changes." : err.message;
          try { server = await get(`/api/documents/${server.document.id}`); } catch { /* keep the last answer */ }
          body = server.body; recovering = false;
        }
      }
      if (--sending === 0) body = server.body;   // the server's copy wins once nothing else is on its way
    });
  }
  const numberFrom = (ev) => Number.parseInt(ev.currentTarget.value, 10);
  let nameInput = $state(start.body.name);
  let notesInput = $state(start.body.notes);
</script>

<div class="sheet" inert={recovering} aria-busy={recovering}>
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


    <section id="step-skills">
      <h2>Skills</h2>
      <p class="muted">Put Skill Points into each skill; no skill rating may start above 6. A concentration takes 1 from the skill and gives +1 in the narrow field; a specialization takes 2 and gives +2 (Firearms 5 → Firearms 3, Pistols 5, Ares Predator 7), and only those may start above 6. Your native language is free at Intelligence + 2. <span class="cite">SR2 p.45, p.70, p.74</span></p>
      {#if !finished}
        <div class="row adders">
          <label><span>From the core book</span>
            <select bind:value={pickSkill}>
              <option value="">Choose a skill…</option>
              {#each ["active", "knowledge", "language"] as cat}
                <optgroup label={SKILL_CATEGORY[cat]}>
                  {#each coreSkills.filter(e => e.category?.includes(cat)) as e (e.id)}<option value={e.id}>{e.name}</option>{/each}
                </optgroup>
              {/each}
            </select></label>
          <button type="button" disabled={!pickSkill} onclick={addCoreSkill}>Add</button>
        </div>
        <form class="row adders" onsubmit={(ev) => { ev.preventDefault(); if (customName.trim()) { change({ op: "addCustomSkill", category: customCategory, name: customName }); customName = ""; } }}>
          <label><span>Your own</span>
            <select bind:value={customCategory}>{#each CUSTOM_SKILL_CATEGORIES as c}<option value={c}>{SKILL_CATEGORY[c]}</option>{/each}</select></label>
          <label class="grow"><span>Name</span><input bind:value={customName} maxlength="60" placeholder="Seattle Gangs, Or'zet, Car B/R…"></label>
          <button disabled={!customName.trim()}>Add</button>
        </form>
      {/if}
      {#if skills.length}
        <div class="scroll"><table class="grid skills">
          <thead><tr><th scope="col">Skill</th><th scope="col">Points</th><th scope="col">Concentration</th><th scope="col">Specialization</th><th scope="col"><span class="sr-only">Remove</span></th></tr></thead>
          <tbody>
            {#each skills as item (item._id)}
              {@const c = choicesOf(item)}
              {@const s = item.system}
              <tr>
                <th scope="row">{item.name} <strong class="rating">{s.rating}</strong><br><span class="muted small">{SKILL_CATEGORY[s.category] ?? s.category}{s.isMagical ? " · magical" : ""}{#if s.concentration.name}{` · ${s.concentration.name} ${s.concentration.rating}`}{/if}{#if s.specialization.name}{` · ${s.specialization.name} ${s.specialization.rating}`}{/if}</span></th>
                <td>
                  {#if s.category === "language"}
                    <select value={c.freeLanguage} aria-label={`${item.name}: free language`} disabled={finished} onchange={(ev) => skillChange(item, { freeLanguage: ev.currentTarget.value })}>
                      <option value="">Bought</option><option value="native">Native (free)</option><option value="dialect">Street dialect (free)</option>
                    </select>
                  {/if}
                  {#if !c.freeLanguage}
                    <input type="number" min="1" max={c.specialization ? 8 : c.concentration ? 7 : 6} step="1" value={c.allocated} aria-label={`${item.name} points`} disabled={finished}
                      onchange={(ev) => { const n = numberFrom(ev); if (Number.isInteger(n) && n >= 0 && n <= 12) skillChange(item, { allocated: n }); else ev.currentTarget.value = c.allocated; }}>
                  {/if}
                </td>
                <td><input value={c.concentration} maxlength="60" aria-label={`${item.name} concentration`} disabled={finished || !!c.freeLanguage}
                  onchange={(ev) => skillChange(item, { concentration: ev.currentTarget.value, specialization: ev.currentTarget.value.trim() ? c.specialization : "" })}></td>
                <td><input value={c.specialization} maxlength="60" aria-label={`${item.name} specialization`} disabled={finished || !c.concentration}
                  onchange={(ev) => skillChange(item, { specialization: ev.currentTarget.value })}></td>
                <td><button type="button" class="quiet" disabled={finished} aria-label={`Remove ${item.name}`} onclick={() => change({ op: "removeSkill", itemId: item._id })}>✕</button></td>
              </tr>
            {/each}
          </tbody>
        </table></div>
      {:else}
        <p class="muted">No skills yet.</p>
      {/if}
    </section>

    <p class="row later"><button type="button" class="danger" onclick={onDeleted}>Delete character</button></p>
  </div>

  <aside class="panel" aria-label="Rules check">
    <h2>Rules check</h2>
    <dl>
      <div><dt>Attribute points</dt><dd class:bad={pr.attributes && check.budgets.attributes.over}>{check.budgets.attributes.spent} / {pr.attributes ? check.budgets.attributes.total : "—"}</dd></div>
      <div><dt>Skill points</dt><dd class:bad={pr.skills && check.budgets.skills.over}>{check.budgets.skills.spent} / {pr.skills ? check.budgets.skills.total : "—"}</dd></div>
      {#if sys.magic.type === "full_magician"}<div><dt>Force Points</dt><dd>{check.budgets.forcePoints.total}</dd></div>{/if}
      <div><dt>Nuyen</dt><dd>{pr.resources ? nuyen(check.budgets.resources.total) : "—"}</dd></div>
    </dl>
    {#if check.problems.length === 0}
      <p class="good">No problems in these steps. Gear, contacts and finishing come next.</p>
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
  .adders { margin: 0 0 .9rem; align-items: end; }
  table.skills input:not([type="number"]) { width: 9rem; padding: .3rem .45rem; }
  table.skills input[type="number"] { width: 3.75rem; text-align: right; padding: .3rem .45rem; }
  table.skills select { padding: .3rem .4rem; margin-bottom: .25rem; }
  table.skills th[scope="row"] { min-width: 10rem; max-width: 16rem; }
  table.skills select { width: 100%; max-width: 9rem; }
  .rating { color: var(--accent); }
  .small { font-size: .82rem; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
