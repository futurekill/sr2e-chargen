<script>
  /** An NPC (docs/PLAN-npc-builder.md): a stat block tailored to the story (core p.187), exported as a Foundry NPC. */
  import { get, mutate } from "../lib/api.js";
  import { go } from "../lib/router.svelte.js";
  import { keepFocus, flagFocused, clearFlags } from "../lib/focus.js";
  import { page } from "../lib/page.svelte.js";
  import { npcView, experiencePreview } from "../../../shared/npc.mjs";
  import { NPC_ATTRS, SKILL_SUCCESS_TABLE, threatFromDifficulty, threatFromTeamKarma, TABLES, RACE_KEYS, label } from "../../../shared/rules.mjs";
  let { doc } = $props();
  let status = $state("");
  let server = $state(doc), error = $state(""), busy = $state(false), notes = $state(doc.body.notes), name = $state(doc.body.name);
  // Plain copies for the shared helpers (they structuredClone, which a Svelte state proxy refuses).
  const body = $derived($state.snapshot(server.body)), sys = $derived(body.actor.system), view = $derived(npcView(body));
  const items = $derived(body.actor.items), skills = $derived(items.filter(i => i.type === "skill")), gear = $derived(items.filter(i => i.type !== "skill"));
  const TITLE = { body: "Body", quickness: "Quickness", strength: "Strength", charisma: "Charisma", intelligence: "Intelligence", willpower: "Willpower" };
  const PR_NAME = { 1: "Average", 2: "Semi-Trained", 3: "Trained", 4: "Professional" };
  const WITHDRAW = { light: "withdraws after a Light wound", moderate: "withdraws after a Moderate wound", serious: "withdraws after a Serious wound" };
  const DIFFICULTY = { simple: "Simple", routine: "Routine", average: "Average", challenging: "Challenging", difficult: "Difficult", strenuous: "Strenuous", extreme: "Extreme", nearlyImpossible: "Nearly Impossible" };
  const nuyen = (n) => `${Number(n || 0).toLocaleString("en-US")}¥`;

  const send = (ops) => keepFocus(async () => {
    const from = document.activeElement;   // the control that made this change, before busy disables it (r2 #1)
    busy = true; error = ""; status = "";
    try { server = await mutate("POST", `/api/documents/${server.document.id}/npc-ops`, { revision: server.document.revision, ops }); name = server.body.name; notes = server.body.notes; clearFlags(); status = "Saved."; page.title = server.body.name; }
    catch (err) {
      flagFocused("doc-error", from);
      error = err.code === "stale" ? "This NPC changed somewhere else. It now shows the saved version." : err.message;
      try { server = await get(`/api/documents/${server.document.id}`); } catch { /* keep the last answer */ }
    }
    busy = false;
  });
  const int = (v) => Number.parseInt(v, 10);
  const num = (ev) => Number(ev.currentTarget.value);

  // Threat Rating helpers (p.187): a Skill Success Table difficulty (p.68) or the team's Karma; they only fill the field.
  let difficulty = $state("average"), tnChoice = $state(""), teamKarma = $state("");
  const row = $derived(SKILL_SUCCESS_TABLE.find(r => r.key === difficulty));
  const fromDifficulty = $derived(threatFromDifficulty(difficulty, tnChoice === "" ? null : int(tnChoice)));

  // Experience (p.187, R22): a preview of every value that changes, then one Apply.
  let years = $state(""), xpAttrs = $state(true), xpSkills = $state(true), xpRes = $state(false);
  const preview = $derived(int(years) > 0 ? experiencePreview(body, { years: int(years), attributes: xpAttrs, skills: xpSkills, resources: xpRes }) : null);

  // Items: any catalog item, every book (a GM's NPC needs no book toggle).
  let q = $state(""), hits = $state([]), pick = $state(""), skillName = $state(""), skillCat = $state("knowledge"), skillAttr = $state("intelligence"), skillRating = $state(3);
  let searches = 0;
  async function search(ev) {
    ev.preventDefault();
    const mine = ++searches;   // only the newest search fills the picker (code review r1 #4)
    try { const got = (await get(`/api/catalog/entries?limit=50&q=${encodeURIComponent(q.trim())}`)).entries.filter(e => e.kind !== "actor"); if (mine === searches) { hits = got; pick = got[0]?.id ?? ""; } }
    catch (err) { if (mine === searches) error = err.message; }
  }
  async function remove() {
    busy = true;
    try { await mutate("DELETE", `/api/documents/${server.document.id}`, { revision: server.document.revision }); go("/"); }
    catch (err) { error = err.message; }
    busy = false;
  }
</script>

<h1>{body.name}</h1>
<p class="muted">NPC{#if body.source} · from the book's {body.source.kind}{/if} · revision {server.document.revision}</p>
{#if error}<p class="notice bad" role="alert" id="doc-error">{error}</p>{/if}
<p class="sr-only" role="status">{status}</p>

<h2>Attributes</h2>
<div class="row wrap">
  {#each NPC_ATTRS as a (a)}
    <label><span>{TITLE[a]}{#if sys[a].mod} ({sys[a].mod > 0 ? "+" : ""}{sys[a].mod}){/if}</span>
      <input type="number" min="1" max="99" value={sys[a].base} disabled={busy} onchange={(ev) => send([{ op: "setAttribute", attr: a, base: num(ev) }])}></label>
  {/each}
</div>
<dl>
  <div><dt>Reaction</dt><dd>{view.reaction}</dd></div>
  <div><dt>Initiative</dt><dd>{view.reaction} + {view.initiativeDice}D6</dd></div>
  <div><dt>Combat Pool</dt><dd>{view.combatPool}</dd></div>
  {#if view.awakened}<div><dt>Astral Combat Pool</dt><dd>{view.astralPool}</dd></div>{/if}
  <div><dt>Armor</dt><dd>{view.armor.ballistic} / {view.armor.impact}</dd></div>
  <div><dt>Movement</dt><dd>{view.walk} / {view.run}</dd></div>
</dl>
{#if view.unsupported.length}<p class="muted small">Some item effects aren't shown here and apply in Foundry: {view.unsupported.map(u => u.item).join(", ")}.</p>{/if}

<div class="row wrap">
  <label><span>Race</span><select value={sys.race} disabled={busy} onchange={(ev) => send([{ op: "setRace", race: ev.currentTarget.value }])}>
    {#each RACE_KEYS as r (r)}<option value={r}>{r}</option>{/each}</select></label>
  <label><span>Reaction modifier</span><input type="number" min="-20" max="20" value={sys.reaction.mod} disabled={busy} onchange={(ev) => send([{ op: "setReactionMod", mod: num(ev) }])}></label>
  <label><span>Initiative dice</span><input type="number" min="1" max="5" value={sys.initiative.dice} disabled={busy} onchange={(ev) => send([{ op: "setInitiativeDice", dice: num(ev) }])}></label>
  <label><span>Combat Pool bonus</span><input type="number" min="0" max="20" value={sys.combatPoolBonus} disabled={busy} onchange={(ev) => send([{ op: "setCombatPoolBonus", bonus: num(ev) }])}></label>
  <label><span>Ballistic armor (base)</span><input type="number" min="0" max="99" value={sys.armor.ballistic} disabled={busy} onchange={(ev) => send([{ op: "setArmor", ballistic: num(ev), impact: sys.armor.impact }])}></label>
  <label><span>Impact armor (base)</span><input type="number" min="0" max="99" value={sys.armor.impact} disabled={busy} onchange={(ev) => send([{ op: "setArmor", ballistic: sys.armor.ballistic, impact: num(ev) }])}></label>
  <label><span>Essence</span><input type="number" min="0" max="99" step="0.01" value={sys.essence.value} disabled={busy} onchange={(ev) => send([{ op: "setEssence", value: num(ev) }])}></label>
  <label><span>Body Index (Shadowtech p.6)</span><input type="number" min="0" max="99" step="0.05" value={sys.bodyIndex.value} disabled={busy} onchange={(ev) => send([{ op: "setBodyIndex", value: num(ev) }])}></label>
  <label><span>Nuyen</span><input type="number" min="0" max="1000000000" value={sys.nuyen} disabled={busy} onchange={(ev) => send([{ op: "setNuyen", nuyen: num(ev) }])}></label>
</div>

<h2>Magic</h2>
<div class="row wrap">
  <label><span>Type</span><select value={sys.magic.type} disabled={busy} onchange={(ev) => send([{ op: "setMagic", value: sys.magic.value, type: ev.currentTarget.value, tradition: sys.magic.tradition, totem: sys.magic.totem }])}>
    <option value="none">Mundane</option><option value="full_magician">Full magician</option><option value="physical_adept">Physical adept</option><option value="shamanic_adept">Shamanic adept</option><option value="magical_adept">Magical adept</option></select></label>
  <label><span>Tradition</span><select value={sys.magic.tradition} disabled={busy} onchange={(ev) => send([{ op: "setMagic", value: sys.magic.value, type: sys.magic.type, tradition: ev.currentTarget.value, totem: ev.currentTarget.value === "shamanic" ? sys.magic.totem : "" }])}>
    <option value="none">None</option><option value="hermetic">Hermetic</option><option value="shamanic">Shamanic</option></select></label>
  {#if sys.magic.tradition === "shamanic"}
    <label><span>Totem</span><select value={sys.magic.totem} disabled={busy} onchange={(ev) => send([{ op: "setMagic", value: sys.magic.value, type: sys.magic.type, tradition: "shamanic", totem: ev.currentTarget.value }])}>
      <option value="">None</option>{#each Object.entries(TABLES.totems) as [k, t] (k)}<option value={k}>{label(t.label)}</option>{/each}</select></label>
  {/if}
  <label><span>Magic</span><input type="number" min="0" max="99" value={sys.magic.value} disabled={busy} onchange={(ev) => send([{ op: "setMagic", value: num(ev), type: sys.magic.type, tradition: sys.magic.tradition, totem: sys.magic.totem }])}></label>
</div>

<h2>Professional and Threat Ratings</h2>
<div class="row wrap">
  <label><span>Professional Rating (p.187)</span><select value={sys.professionalRating} disabled={busy} onchange={(ev) => send([{ op: "setProfessionalRating", rating: int(ev.currentTarget.value) }])}>
    {#each [1, 2, 3, 4] as r (r)}<option value={r}>{r} · {PR_NAME[r]}</option>{/each}</select></label>
  <label><span>Threat Rating</span><input type="number" min="0" max="20" value={sys.threatRating} disabled={busy} onchange={(ev) => send([{ op: "setThreatRating", rating: num(ev) }])}></label>
</div>
<p class="muted">{#if view.prRange}The book prints {view.prRange[0]}–{view.prRange[1]} for this NPC: pick one. Until then, the low end:
  <button type="button" class="quiet" disabled={busy} onclick={() => send([{ op: "setProfessionalRating", rating: sys.professionalRating }])}>Keep {sys.professionalRating}</button>{/if}
  {#if view.professional}{PR_NAME[sys.professionalRating]}: {view.professional.withdraw ? WITHDRAW[view.professional.withdraw] : "fights to the end"}{#if view.professional.withdraw}; the gamemaster may call a Willpower (4) Test to stay{/if}.{/if}</p>
{#if sys.threatRating > 0}<p class="notice" role="status">Threat Rating {sys.threatRating}: these dice don't refresh and can be used for several tests in a Combat Phase; p.187 says this NPC then uses no Dice Pools. Foundry doesn't roll them for people: roll them by hand (the export says so too).</p>{/if}
<div class="row wrap">
  <label><span>From a difficulty (p.68)</span><select bind:value={difficulty} onchange={() => { tnChoice = ""; }}>
    {#each SKILL_SUCCESS_TABLE as r (r.key)}<option value={r.key}>{DIFFICULTY[r.key]} ({r.tn.join("–")}{r.open ? "+" : ""})</option>{/each}</select></label>
  {#if row.tn.length > 1 || row.open}<label><span>Target number</span><input type="number" min={row.tn[0]} max={row.open ? 20 : row.tn.at(-1)} bind:value={tnChoice} placeholder={String(row.tn[0])}></label>{/if}
  <button type="button" class="quiet" disabled={busy || fromDifficulty == null} onclick={() => send([{ op: "setThreatRating", rating: fromDifficulty }])}>Use {fromDifficulty ?? "–"}</button>
  <label><span>Or the team's total Team Karma (p.190)</span><input type="number" min="0" bind:value={teamKarma}></label>
  <button type="button" class="quiet" disabled={busy || teamKarma === "" || threatFromTeamKarma(teamKarma) > 20} onclick={() => send([{ op: "setThreatRating", rating: threatFromTeamKarma(teamKarma) }])}>Use {teamKarma === "" ? "–" : threatFromTeamKarma(teamKarma)}</button>
  {#if teamKarma !== "" && threatFromTeamKarma(teamKarma) > 20}<p class="muted small">{threatFromTeamKarma(teamKarma)} is above this builder's limit of 20: type a Threat Rating instead.</p>{/if}
</div>

<h2>Experience (p.187)</h2>
<p class="muted">+10% for every two years, up to 10 years; then +10% for every four years beyond 10. Each value is rounded to the nearest (R22). Applied once; the values are then yours to edit.</p>
<div class="row wrap">
  <label><span>Years of experience</span><input type="number" min="1" max="60" bind:value={years}></label>
  <label class="check"><input type="checkbox" bind:checked={xpAttrs}> Attributes</label>
  <label class="check"><input type="checkbox" bind:checked={xpSkills}> Skills</label>
  <label class="check"><input type="checkbox" bind:checked={xpRes}> Resources (nuyen)</label>
</div>
{#if preview}
  <p>+{preview.pct}%{#if !preview.changes.length}: nothing changes.{/if}</p>
  {#if preview.changes.length}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="scroll-x" role="region" aria-label="Experience preview" tabindex="0"><table><caption>What +{preview.pct}% changes</caption><thead><tr><th scope="col">Value</th><th scope="col">Now</th><th scope="col">After</th></tr></thead>
      <tbody>{#each preview.changes as c (c.what + (c.itemId ?? ""))}<tr><th scope="row">{c.what}</th><td>{c.what === "nuyen" ? nuyen(c.from) : c.from}</td><td>{c.what === "nuyen" ? nuyen(c.to) : c.to}</td></tr>{/each}</tbody></table></div>
    <button disabled={busy || (!xpAttrs && !xpSkills && !xpRes)} onclick={() => send([{ op: "applyExperience", years: int(years), attributes: xpAttrs, skills: xpSkills, resources: xpRes }]).then(() => { years = ""; })}>Apply</button>
  {/if}
{/if}
{#if body.experience?.length}<p class="muted small">Applied: {body.experience.map(x => `${x.years} years (+${x.pct}%, ${x.targets.join(", ")})`).join("; ")}.</p>{/if}

<h2>Skills</h2>
{#if skills.length}
  <ul class="list">
    {#each skills as s (s._id)}
      <li><span class="name">{s.name}</span>
        <label><span class="sr-only">Rating of {s.name}</span><input type="number" min="0" max="99" value={s.system.rating} disabled={busy} onchange={(ev) => send([{ op: "setItemRating", itemId: s._id, rating: num(ev) }])}></label>
        <button type="button" class="quiet" disabled={busy} onclick={() => send([{ op: "removeItem", itemId: s._id }])} aria-label={`Remove ${s.name}`}>Remove</button></li>
    {/each}
  </ul>
{:else}<p class="muted">No skills yet.</p>{/if}
<form class="row wrap" onsubmit={(ev) => { ev.preventDefault(); send([{ op: "addCustomSkill", name: skillName.trim(), category: skillCat, attribute: skillAttr, rating: int(skillRating) }]).then(() => { skillName = ""; }); }}>
  <label class="grow"><span>A skill the catalog lacks</span><input bind:value={skillName} maxlength="80" placeholder="Rumormill" required></label>
  <label><span>Category</span><select bind:value={skillCat}><option value="active">Active</option><option value="build_repair">Build/Repair</option><option value="knowledge">Knowledge</option><option value="language">Language</option><option value="special">Special</option></select></label>
  <label><span>Linked attribute</span><select bind:value={skillAttr}>{#each NPC_ATTRS as a (a)}<option value={a}>{TITLE[a]}</option>{/each}</select></label>
  <label><span>Rating</span><input type="number" min="0" max="99" bind:value={skillRating} required></label>
  <button disabled={busy || !skillName.trim()}>Add skill</button>
</form>

<h2>Gear, weapons, ware and magic</h2>
{#if gear.length}
  <ul class="list">
    {#each gear as i (i._id)}
      <li><span class="name">{i.name}</span><span class="meta">{i.type}</span>
        {#if typeof i.system?.rating === "number"}<label><span class="sr-only">Rating of {i.name}</span><input type="number" min="0" max="99" value={i.system.rating} disabled={busy} onchange={(ev) => send([{ op: "setItemRating", itemId: i._id, rating: num(ev) }])}></label>{/if}
        {#if i.type === "armor" || i.type === "weapon"}<label class="check"><input type="checkbox" checked={!!i.system?.equipped} disabled={busy} onchange={(ev) => send([{ op: "setEquipped", itemId: i._id, equipped: ev.currentTarget.checked }])}> {i.type === "armor" ? "Worn" : "Equipped"}</label>{/if}
        <button type="button" class="quiet" disabled={busy} onclick={() => send([{ op: "removeItem", itemId: i._id }])} aria-label={`Remove ${i.name}`}>Remove</button></li>
    {/each}
  </ul>
{:else}<p class="muted">Nothing carried.</p>{/if}
<form class="row wrap" onsubmit={search}>
  <label class="grow"><span>Find in the catalog (any book)</span><input bind:value={q} maxlength="64" placeholder="Ares Predator"></label>
  <button class="quiet">Search</button>
</form>
{#if hits.length}
  <form class="row wrap" onsubmit={(ev) => { ev.preventDefault(); send([{ op: "addItem", catalogId: pick }]); }}>
    <label class="grow"><span>Add</span><select bind:value={pick}>{#each hits as e (e.id)}<option value={e.id}>{e.name} ({e.type}{e.listBook && e.listBook !== "sr2" ? `, ${e.listBook}` : ""})</option>{/each}</select></label>
    <button disabled={busy || !pick}>Add</button>
  </form>
{/if}

<h2>Name and notes</h2>
<form class="stack wide" onsubmit={(ev) => { ev.preventDefault(); send([{ op: "setName", name: name.trim() }, { op: "setNotes", notes }]); }}>
  <label><span>Name</span><input bind:value={name} maxlength="120" required></label>
  <label><span>Notes (added to the Foundry biography)</span><textarea bind:value={notes} maxlength="20000"></textarea></label>
  <div class="row"><button disabled={busy || !name.trim() || (name === body.name && notes === body.notes)}>Save</button></div>
</form>

<h2>Export</h2>
<p><a class="button quiet" href={`/api/documents/${server.document.id}/foundry`} download>{body.name} for Foundry</a></p>
<p class="muted small">In Foundry: create an Actor of type NPC, right-click it, choose <strong>Import Data</strong> and pick the file.</p>

<details><summary>Delete this NPC</summary>
  <p class="muted">It goes to the trash (restorable for 30 days).</p>
  <button class="danger" disabled={busy} onclick={remove}>Delete</button>
</details>
