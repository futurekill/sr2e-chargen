<script>
  import { get } from "../lib/api.js";
  let manifest = $state(null), error = $state(""), q = $state(""), type = $state("");
  let off = $state([]);                       // books switched OFF (the core book can't be)
  let results = $state([]), total = $state(0), busy = $state(false), open = $state(null), detail = $state(null);
  const CORE = "sr2", PAGE = 50;
  const books = $derived(manifest ? [...manifest.books].sort((a, b) => (a.key === CORE ? -1 : b.key === CORE ? 1 : a.title.localeCompare(b.title))) : []);
  const bookOf = $derived(Object.fromEntries(books.map(b => [b.key, b])));
  const allOn = $derived(off.length === 0);
  const TYPE_NAMES = { adept_power: "Adept powers", ammo: "Ammunition", armor: "Armor", bioware: "Bioware", character: "Archetypes", contact: "Contacts",
    cyberware: "Cyberware", focus: "Foci", gear: "Gear", lifestyle: "Lifestyles", program: "Programs", quality: "Edges & Flaws", race: "Metatypes",
    skill: "Skills", spell: "Spells", tradition: "Traditions", vehicle: "Vehicles", vehicle_mod: "Vehicle modifications", weapon: "Weapons" };
  const typeName = (t) => TYPE_NAMES[t] ?? t;
  const nuyen = (n) => (n == null ? "" : `${n.toLocaleString("en-US")}¥`);
  let seq = 0;

  function query(offset) {
    const p = new URLSearchParams();
    for (const b of books) if (!off.includes(b.key)) p.append("book", b.key);
    if (type) p.append("type", type);
    if (q.trim()) p.set("q", q.trim().slice(0, 64));
    p.set("offset", String(offset)); p.set("limit", String(PAGE));
    return `/api/catalog/entries?${p}`;
  }
  /** Run the search; a slower, older answer never overwrites a newer one. */
  async function search(more = false) {
    const mine = ++seq;
    busy = true;
    try {
      const page = await get(query(more ? results.length : 0));
      if (mine !== seq) return;
      results = more ? [...results, ...page.entries] : page.entries; total = page.total; error = "";
    } catch (err) { if (mine === seq) error = err.message; }
    if (mine === seq) busy = false;
  }
  async function show(id) {
    if (open === id) { open = null; detail = null; return; }
    open = id; detail = null;
    try { const d = await get(`/api/catalog/entries/${encodeURIComponent(id)}`); if (open === id) detail = d; }
    catch (err) { error = err.message; }
  }
  function toggle(key) { off = off.includes(key) ? off.filter(k => k !== key) : [...off, key]; search(); }
  function toggleAll() { off = allOn ? books.filter(b => b.key !== CORE).map(b => b.key) : []; search(); }
  let timer;
  function typed() { clearTimeout(timer); timer = setTimeout(() => search(), 200); }
  /** The stats worth a line in the detail view: plain values only (no nested rules data). */
  const stats = (system) => Object.entries(system ?? {}).filter(([k, v]) => k !== "citation" && (typeof v === "number" || (typeof v === "string" && v) || typeof v === "boolean"));

  (async () => {
    try { manifest = await get("/api/catalog"); await search(); }
    catch (err) { error = err.code === "no-catalog" ? "This node has no catalog loaded yet. Whoever runs it needs to build one." : err.message; }
  })();
</script>

<h1>The catalog</h1>
<p class="howto"><a href={"/help/catalog"}>How this works</a></p>
<p class="muted">Everything a runner can buy, learn or be. Each entry says where it comes from.</p>
{#if error}<p class="notice bad" role="alert">{error}</p>{/if}

{#if manifest}
  <div class="filters">
    <label class="grow"><span>Search</span><input bind:value={q} oninput={typed} maxlength="64" placeholder="Name or category" type="search"></label>
    <label><span>Kind</span>
      <select bind:value={type} onchange={() => search()}>
        <option value="">Everything</option>
        {#each manifest.types as t (t.type)}<option value={t.type}>{typeName(t.type)} ({t.count})</option>{/each}
      </select>
    </label>
  </div>

  <fieldset class="books">
    <legend>Books</legend>
    <label class="row"><input class="check" type="checkbox" checked={allOn} onchange={toggleAll}><span><strong>All</strong></span></label>
    {#each books as b (b.key)}
      <label class="row" title={b.title}>
        <input class="check" type="checkbox" checked={!off.includes(b.key)} disabled={b.key === CORE} onchange={() => toggle(b.key)}>
        <span>{b.abbr} <span class="muted">({b.count})</span>{#if b.key === CORE} <span class="muted">— always on</span>{/if}</span>
      </label>
    {/each}
  </fieldset>

  <p class="muted" role="status" aria-live="polite">{busy && !results.length ? "Searching…" : `${total.toLocaleString("en-US")} ${total === 1 ? "entry" : "entries"}`}</p>
  <ul class="list">
    {#each results as e (e.id)}
      <li class="entry">
        <button class="plain name" aria-expanded={open === e.id} onclick={() => show(e.id)}>{e.name}</button>
        <span class="meta">{typeName(e.type)}{e.category?.length ? ` · ${e.category.join(" › ")}` : ""}{e.cost != null ? ` · ${nuyen(e.cost)}` : ""}</span>
        {#if e.citation}
          <span class="cite"><abbr title={bookOf[e.citation.book]?.title ?? e.citation.book}>{bookOf[e.citation.book]?.abbr ?? e.citation.book}</abbr>{e.citation.page ? ` p.${e.citation.page}` : ""}</span>
        {/if}
        {#if open === e.id}
          <div class="detail">
            {#if !detail}<p class="muted prompt">Loading…</p>
            {:else}
              {#each Object.entries(detail.text) as [field, t] (field)}<p class="booktext">{t.value}</p>{/each}
              <dl>
                {#each stats(detail.system) as [k, v] (k)}<div><dt>{k}</dt><dd>{v}</dd></div>{/each}
              </dl>
              {#if detail.items?.length}<p class="muted">Comes with: {detail.items.map(i => i.name).join(", ")}</p>{/if}
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  {#if results.length < total}<p><button class="quiet" disabled={busy} onclick={() => search(true)}>{busy ? "Loading…" : `Show more (${(total - results.length).toLocaleString("en-US")} left)`}</button></p>{/if}
  {#if !busy && manifest && total === 0}<p class="muted">Nothing matches. Try fewer words, or switch more books on.</p>{/if}
{/if}
