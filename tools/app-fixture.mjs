/**
 * The seeded app both the accessibility scan and the help screenshots run (docs/PLAN-a11y.md 1,
 * docs/PLAN-help-footer.md 1): the real app on 127.0.0.1 only, a temporary in-memory SQLite database, the real catalog,
 * credentials made in memory for this run (never written anywhere). `prefs`: the seeded user's preferences.
 */
import { randomUUID, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { join } from "node:path";
import { createContext } from "../server/db/index.mjs";
import { buildApp } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import { loadCatalog, entryOf } from "../server/catalog.mjs";
import * as A from "../server/auth/accounts.mjs";
import * as L from "../server/library.mjs";
import { active } from "../server/auth/passwords.mjs";
import { blankDesign } from "../shared/rules.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const freePort = () => new Promise((res) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });

/* ── The app and its data ─────────────────────────────────────────────────────────────────────────────────────── */
export async function startApp({ prefs = null } = {}) {
  active.memory = 8192; active.passes = 1;   // quick hashing: these credentials live only for this run
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const ctx = await createContext("sqlite://:memory:", { now: () => Date.now() });
  const catalog = loadCatalog(join(ROOT, "catalog"));
  const app = await buildApp({ ctx, config: loadConfig({ NODE_ENV: "production", BASE_URL: origin }), logger: false, catalog });
  await app.listen({ port, host: "127.0.0.1" });
  const password = randomBytes(18).toString("base64url");
  const admin = await A.redeem(ctx, { secret: (await A.bootstrap(ctx)).secret, username: "Scanner", password });
  const uid = admin.user.id, key = () => randomUUID(), lookup = (id) => entryOf(catalog, id);
  if (prefs) await ctx.db.updateTable("users").set({ prefs: JSON.stringify(prefs) }).where("id", "=", uid).execute();
  const docs = {};
  docs.draft = (await L.createDraft(ctx, uid, { name: "Run notes", notes: "Meet at the Ork Underground." }, key())).document.id;
  // A character in creation, a shaman (the totem select shows).
  let c = await L.createCharacter(ctx, uid, { name: "Whisper Two" }, key());
  c = await L.applyOps(ctx, uid, c.document.id, { revision: c.document.revision, ops: [{ op: "setPriority", category: "magic", letter: "A" }, { op: "setMagic", type: "full_magician" }, { op: "setTradition", tradition: "shamanic" }] }, key(), lookup);
  docs.creating = c.document.id;
  // A finished character (an archetype imported from Foundry).
  const razor = [...catalog.npcs.values()].find(r => r.source.type === "character" && /Razor/.test(r.source.name)).source;
  docs.finished = (await L.importCharacter(ctx, uid, structuredClone(razor), key(), catalog.manifest.pins.find(p => p.id === "sr2e")?.version)).document.id;
  // Vehicles: a catalog one, and designs that bring up every conditional Workshop control (r2 #1, r3 #1, r4).
  const americar = catalog.index.find(({ e }) => e.type === "vehicle" && e.book === "sr2" && e.name === "Ford Americar").e.id;
  docs.vehicle = (await L.createVehicle(ctx, uid, { catalogId: americar, name: "Getaway" }, key(), lookup, catalog.design)).document.id;
  // A vehicle with firmpoints and a mounted weapon (the help's mounts picture): the Harley Scorpion (SR2 p.251).
  const scorpion = catalog.index.find(({ e }) => e.type === "vehicle" && e.book === "sr2" && e.name === "Harley Scorpion").e.id;
  const smg = catalog.index.find(({ e }) => e.type === "weapon" && e.book === "sr2" && e.name === "Uzi III").e.id;
  const sv = await L.createVehicle(ctx, uid, { catalogId: scorpion, name: "Scorpion" }, key(), lookup, catalog.design);
  docs.mounts = (await L.applyOps(ctx, uid, sv.document.id, { revision: 1, ops: [{ op: "mountWeapon", catalogId: smg, kind: "firmpoint" }] }, key(), lookup, "", [], catalog.design)).document.id;
  const design = async (name, d, ops = []) => {
    const v = await L.createVehicle(ctx, uid, { design: true, name }, key(), lookup, catalog.design);
    const r = await L.applyOps(ctx, uid, v.document.id, { revision: v.document.revision, ops: [{ op: "setDesign", design: { ...blankDesign(), ...d } }, ...ops] }, key(), lookup, "", [], catalog.design);
    return r.document.id;
  };
  docs.sedan = await design("Sedan", { chassisKey: "sedan", powerPlantKey: "gasoline-cars-sedan", amenities: { level: "basic", occupants: 2 } },
    [{ op: "addDesignMod", catalogId: "sr2e-rigger-2.r2-vehicle-mods.1536f4089f7e6eac", rating: 1 }]);   // drive-by-wire: its split shows
  // A clean, finished design for the help's Workshop picture: a sedan with only its chassis and plant.
  docs.cleanDesign = await design("Shadow Sedan", { chassisKey: "sedan", powerPlantKey: "gasoline-cars-sedan" });
  docs.boat = await design("Water Scooter", { chassisKey: "waterScooter", powerPlantKey: "gasoline-motorboats-skiff-and-water-scooter" });
  docs.plane = await design("Ultralight", { chassisKey: "ultralight", powerPlantKey: "electric-fixed-wing-ultralight" });
  docs.blankDesign = (await L.createVehicle(ctx, uid, { design: true, name: "Blank design" }, key(), lookup, catalog.design)).document.id;
  // NPCs: a contact with a printed range, and a shaman archetype.
  const npcId = (name) => [...catalog.npcs].find(([, r]) => r.source.name.startsWith(name))[0];
  docs.npc = (await L.createNpc(ctx, uid, { catalogId: npcId("Bounty Hunter"), name: "Bounty Hunter" }, key(), (id) => catalog.npcs.get(id))).document.id;
  docs.shamanNpc = (await L.createNpc(ctx, uid, { catalogId: npcId("Whisper"), name: "Whisper NPC" }, key(), (id) => catalog.npcs.get(id))).document.id;
  // Something in the trash.
  const gone = await L.createDraft(ctx, uid, { name: "Old notes" }, key());
  await L.deleteDocument(ctx, uid, gone.document.id, { revision: 1 }, key());
  return { app, ctx, origin, cookie: { name: "sid", value: admin.sessionSecret }, docs, login: { username: "Scanner", password } };
}

