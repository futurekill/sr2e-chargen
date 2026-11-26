/**
 * The Garage (docs/PLAN-garage.md): a vehicle as its own library document. Pure and shared by the server (the
 * authority) and the client (the preview), like the character reducer in creation.mjs.
 *
 * Body: `{ schema, schemaVersion, name, notes, catalogId, nextItem, actor }`. `actor` is the Foundry vehicle actor
 * source from the catalog, the ONE authority: its `items` hold the mounted weapons (`flags.sr2e.mount`) and the cargo
 * (`flags.sr2e.cargo`), each with its own id from `nextItem`. Rules: core book p.251–253 (sr2e module/rules/vehicle-mounts.mjs).
 */
import { Refusal } from "./creation.mjs";
import { mountKindFor, mountPointsOf, mountedWeaponCost, LAUNCHER_MUNITIONS } from "./rules.mjs";

export const VEHICLE_SCHEMA = "sr2e-chargen-vehicle", VEHICLE_SCHEMA_VERSION = 1;
export const MAX_VEHICLE_ITEMS = 30;
const CORE = "sr2";

/** The operations a vehicle document takes (field types as the character's OPS, for the route schema). */
export const VEHICLE_OPS = {
  setName: { name: "string" },
  setNotes: { notes: "string" },
  mountWeapon: { catalogId: "string", kind: "string" },
  unmountWeapon: { itemId: "string" },
  addGear: { catalogId: "string", quantity: "integer" },
  removeGear: { itemId: "string" }
};

function cleanName(name) {
  const n = String(name ?? "").replace(/\s+/g, " ").trim();
  if (!n || n.length > 120) throw new Refusal("A vehicle's name is 1 to 120 characters.");
  return n;
}
/** A catalog id is `package.pack.documentId`; the system's mount tables key on the document id (core pack only). */
const docIdOf = (catalogId) => (String(catalogId ?? "").startsWith("sr2e.") ? String(catalogId).split(".").pop() : "");
const itemKey = (n) => `gv${String(n).padStart(14, "0")}`;   // 16 characters, as Foundry's ids; fixed width keeps order

/** A new vehicle from a catalog vehicle entry (core book only, as at creation; sourcebooks come with a book toggle). */
export function newVehicle(entry, name) {
  if (!entry || entry.type !== "vehicle") throw new Refusal("That isn't a vehicle in the catalog.");
  if (entry.book !== CORE) throw new Refusal("Only the core book's vehicles for now.", 264);
  if (!entry.actorSource) throw new Refusal("This vehicle's full data isn't available on this server.");
  const actor = structuredClone(entry.actorSource);
  const n = cleanName(name || entry.name);
  actor.name = n;
  actor.items = Array.isArray(actor.items) ? actor.items : [];
  return { schema: VEHICLE_SCHEMA, schemaVersion: VEHICLE_SCHEMA_VERSION, name: n, notes: "", catalogId: entry.id, nextItem: 1, actor };
}

const mounted = (body, kind) => body.actor.items.filter(i => i.flags?.sr2e?.mount === kind);
const ours = (body, itemId, what) => {
  const i = typeof itemId === "string" ? body.actor.items.find(x => x._id === itemId && x.flags?.sr2e?.[what]) : null;
  if (!i) throw new Refusal(what === "mount" ? "No such mounted weapon on this vehicle." : "No such cargo on this vehicle.");
  return i;
};
const listPrice = (e) => Number(e?.system?.cost);

/** Mount points free and used: `{ hardpoint: { total, used }, firmpoint: { total, used }, upTo, pointCost, page }`. */
export function mountsOf(body) {
  const p = mountPointsOf(docIdOf(body.catalogId));
  return { hardpoint: { total: p.hardpoints, used: mounted(body, "hardpoint").length },
    firmpoint: { total: p.firmpoints, used: mounted(body, "firmpoint").length }, upTo: p.upTo, pointCost: p.pointCost, page: p.page };
}

/** Apply one operation: the next body, or a `Refusal`. `lookup(catalogId)` gives a catalog entry. */
export function applyVehicleOp(body, op, lookup = () => null) {
  if (!op || typeof op !== "object" || !Object.hasOwn(VEHICLE_OPS, op.op)) throw new Refusal("Unknown operation.");
  const b = structuredClone(body);
  const add = (item) => {
    if (b.actor.items.length >= MAX_VEHICLE_ITEMS) throw new Refusal(`A vehicle holds at most ${MAX_VEHICLE_ITEMS} weapons and items here.`);
    let n = b.nextItem ?? 1;
    while (b.actor.items.some(i => i._id === itemKey(n))) n++;
    b.actor.items.push({ ...item, _id: itemKey(n) });
    b.nextItem = n + 1;
  };
  const snapshot = (e, flags) => ({ name: e.name, type: e.type, img: e.img ?? null, system: structuredClone(e.system ?? {}),
    flags: { sr2e: { catalogId: e.id, ...flags } }, ...(e.uuid ? { _stats: { compendiumSource: e.uuid } } : {}) });
  switch (op.op) {
    case "setName": b.name = b.actor.name = cleanName(op.name); break;
    case "setNotes":
      if (typeof op.notes !== "string" || op.notes.length > 20000) throw new Refusal("Notes are at most 20,000 characters.");
      b.notes = op.notes; break;
    case "mountWeapon": {   // p.251: a hardpoint takes a heavy weapon, a firmpoint a smaller firearm; bought separately
      const e = lookup(op.catalogId);
      if (!e || e.type !== "weapon") throw new Refusal("That isn't a weapon in the catalog.");
      if (e.book !== CORE) throw new Refusal("Only the core book's weapons for now.", 251);
      const kind = mountKindFor({ id: docIdOf(e.id), weaponType: e.system?.weaponType });
      if (!kind) throw new Refusal(`${e.name} doesn't go on a vehicle mount: a hardpoint takes a heavy weapon, a firmpoint a smaller firearm.`, 251);
      if (op.kind !== kind) throw new Refusal(`${e.name} goes on a ${kind}, not a ${op.kind}.`, 251);
      if (!(listPrice(e) > 0)) throw new Refusal(`${e.name} has no list price, so its mounting can't be priced.`, 251);
      const m = mountsOf(b)[kind];
      if (m.used >= m.total) throw new Refusal(m.total ? `Every ${kind} on this vehicle is taken (${m.total}).` : `This vehicle has no ${kind}s.`, 251);
      add(snapshot(e, { mount: kind }));
      break;
    }
    case "unmountWeapon": { const i = ours(b, op.itemId, "mount"); b.actor.items = b.actor.items.filter(x => x !== i); break; }
    case "addGear": {   // cargo: gear, or the launcher's missiles and rockets (p.255). No capacity rule in the core book.
      const e = lookup(op.catalogId);
      const munition = e && Object.hasOwn(LAUNCHER_MUNITIONS, docIdOf(e.id));
      if (!e || (e.type !== "gear" && !munition)) throw new Refusal("That isn't gear (or launcher ammunition) in the catalog.");
      if (e.book !== CORE) throw new Refusal("Only the core book's gear for now.");
      if (!Number.isInteger(op.quantity) || op.quantity < 1 || op.quantity > 99) throw new Refusal("A quantity is 1 to 99.");
      if (!(listPrice(e) > 0)) throw new Refusal(`${e.name} has no fixed list price, so it can't be priced as cargo.`);
      add(snapshot(e, { cargo: true, quantity: op.quantity }));
      break;
    }
    case "removeGear": { const i = ours(b, op.itemId, "cargo"); b.actor.items = b.actor.items.filter(x => x !== i); break; }
  }
  return b;
}

/**
 * What the vehicle costs as it stands (docs/PLAN-garage.md 6): its list price (p.264; 0 = "Restricted", no price),
 * the Scorpion's price per firmpoint fitted (p.251), each mounted weapon at twice its list price ("Adaptation … doubles
 * its cost", p.251) and each cargo item at list price × its quantity. `{ total, vehicle, points, weapons, cargo }`.
 */
export function vehiclePrice(body) {
  const vehicle = Number(body.actor.system?.cost) || 0;
  const m = mountsOf(body);
  const points = m.pointCost * (m.firmpoint.used + m.hardpoint.used);
  const weapons = body.actor.items.filter(i => i.flags?.sr2e?.mount).reduce((t, i) => t + mountedWeaponCost(i.system?.cost), 0);
  const cargo = body.actor.items.filter(i => i.flags?.sr2e?.cargo).reduce((t, i) => t + (Number(i.system?.cost) || 0) * (i.flags.sr2e.quantity ?? 1), 0);
  return { total: vehicle + points + weapons + cargo, vehicle, points, weapons, cargo };
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The Foundry vehicle actor this document describes: its name, its notes added to `system.notes`, its items. */
export function vehicleActor(body) {
  const a = structuredClone(body.actor);
  a.name = body.name;
  if (a.prototypeToken) a.prototypeToken = { ...a.prototypeToken, name: body.name };   // the token follows a rename (r1 #8)
  const extra = String(body.notes ?? "").split(/\n{2,}/).map(p => p.trim()).filter(Boolean).map(p => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  if (extra) a.system = { ...a.system, notes: `${a.system?.notes ?? ""}${extra}` };
  return a;
}
