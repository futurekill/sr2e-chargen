/**
 * The in-app help (docs/PLAN-help-footer.md 1): every feature, as DATA. Strings only; inline markup is `**bold**`
 * and `[text](/path)`, turned into tokens by help/markup.js and rendered with Svelte's escaping (never {@html}).
 * Each section: { id, title, intro, parts: [{ id, title, steps?: [], notes?: [] }], shots?: [{ file, alt, part }] }.
 * Page references are to the books (SR2 = the core book). Keep it in step with the app: a feature isn't done until
 * this says how to use it.
 */
export const SECTIONS = [
  {
    id: "getting-started", title: "Getting started",
    intro: "**Hoi, chummer!** builds and keeps Shadowrun, Second Edition characters, vehicles and NPCs, and hands them to Foundry VTT. It is invite only: the person who runs this node gives you a link.",
    parts: [
      { id: "invite", title: "Your invite", steps: [
        "Open the invite link you were given. It works **once** and for a limited time.",
        "Pick a **handle** (3–32 letters, digits, dot, dash or underscore) and a **password** of 12 characters or more, then **Create account**.",
        "Lost your password? Ask the node's admin for a **reset link**: it also works once. There is no email." ] },
      { id: "library", title: "The library", steps: [
        "The **Library** lists everything you have made: characters, vehicles, NPCs and drafts.",
        "To start something, type a name, choose its **Kind** and press **Start**. A vehicle asks for a model; an NPC can start from a book NPC.",
        "**Archive** hides a document from the main list without deleting it. **Deleted** documents stay restorable for 30 days.",
        "Characters, vehicles and NPCs save each change as you make it, with a **revision** for every save.",
        "Two things wait for a button: a **draft**'s text (**Save**) and a Workshop design's choices (**Save design**). Until you press it, the change is only on your screen." ] },
      { id: "problems", title: "Something wrong?", steps: [
        "Tell the person who runs this node (its admin). Say which page, what you did, and what happened; a screenshot helps.",
        "**What's new** at the foot of every page lists the latest changes to the app." ] },
      { id: "foundry-import", title: "Bringing a character from Foundry", steps: [
        "In Foundry, right-click a finished character and choose **Export Data**.",
        "In the Library, **Import a character from Foundry…** and pick the file. It arrives finished, ready for play." ] }
    ]
  },
  {
    id: "building-a-character", title: "Building a character",
    intro: "A character is built the core book's way, one step at a time (SR2 p.40–47). Each step is a **tab**; a number on a tab counts what is left there (red when something breaks a rule). The **Rules check** beside the tabs lists every problem with its page; select one to open its tab.",
    shots: [{ file: "steps.webp", alt: "A character's step tabs, Concept to Print, with counts on the steps that still need work, and the Rules check panel beside them listing budgets and problems.", part: "concept" }],
    parts: [
      { id: "concept", title: "Concept", steps: [
        "Name the character and write notes. Add a **portrait**: upload a JPEG, PNG or WebP (re-encoded, location data removed) or **Choose a premade one**.",
        "Tick the **Sourcebooks** your table uses (or **All**). The core book is always on. A book can be turned off once nothing on the character comes from it.",
        "With the Shadowrun Companion on, **Edges and Flaws** appear here; they must add up to 0." ] },
      { id: "priorities", title: "Priorities", steps: [
        "Give Race, Magic, Attributes, Skills and Resources one letter each, A to E (SR2 p.44). Picking a letter already in use swaps the two.",
        "With the Companion on you can use **Sum-to-10** or **Point-based** creation instead (Companion p.20–21)." ] },
      { id: "metatype", title: "Metatype", steps: [
        "Choose human, dwarf, elf, ork or troll. A metahuman needs Race A, or C with the GM's More Metahumans option (SR2 p.46).",
        "With the Companion on: metavariants and shapeshifters (Companion p.36–44).",
        "A metahuman may take an **allergy** here for extra points (SR2 p.46)." ] },
      { id: "magic", title: "Magic", steps: [
        "A full magician (hermetic, or shamanic with a totem) or a physical adept, as your Magic priority allows (SR2 p.45)." ] },
      { id: "attributes", title: "Attributes", steps: [
        "Spend your Attribute Points. Racial modifiers and maximums are applied for you (SR2 p.43–45)." ] },
      { id: "skills", title: "Skills", steps: [
        "Add skills from the book, or your own Knowledge, Language or Build/Repair skills, and set their points.",
        "Add a concentration and a specialization where you want them (SR2 p.70).",
        "Mark your native language free (Intelligence + 2; SR2 p.74)." ] },
      { id: "resources", title: "Resources", steps: [
        "Search the shop and **Add**: gear, weapons, armor, cyberware, spells, foci, contacts, a lifestyle, vehicles. Set quantity, rating and Force on each row.",
        "Gear is bought at list price, nothing above Rating 6 (SR2 p.46). Cyberware takes Essence.",
        "**From your garage**: **buy** a vehicle you built (its whole price) or **link** one (free; the sheet shows it as it stands).",
        "Two contacts are free; a gang, followers and a buddy cost extra (SR2 p.43–44)." ],
        notes: ["A shop row shows its book and page. An entry with special rules the app can't apply yet isn't offered."] },
      { id: "finish", title: "Finish", steps: [
        "When the Rules check is clean, **Finish**: unspent Resources become nuyen at 10:1, plus 3D6 × 1,000¥ rolled by the server (SR2 p.47).",
        "Creation then closes. The name, notes and table card can still change; play starts (see [After creation](/help/after-creation))." ] }
    ]
  },
  {
    id: "after-creation", title: "After creation (play)",
    intro: "A finished character gets three more steps: **Karma**, **Nuyen** and **Condition**. Every change goes into the history; **Undo** reverses the newest one.",
    parts: [
      { id: "karma", title: "Karma", steps: [
        "**Award Karma** after a run. One-tenth of Total Karma (rounded up) is the Karma Pool; the rest is Good Karma (SR2 p.190).",
        "**Raise** an attribute or a skill, add a concentration or specialization, or **learn** a skill (SR2 p.191). The cost is shown before you spend.",
        "The **History** lists every change, with who made it." ] },
      { id: "nuyen", title: "Nuyen", steps: [
        "**Record** money received or paid. The balance can't go below 0.",
        "**Buy**: the street price is shown (list × Street Index, SR2 p.184); enter the price you agreed. Cyberware bought now is a spare until surgery.",
        "**Sell**: how selling pays is the GM's setting — a refund, or a fence's 10–50% of list value (SR2 p.188).",
        "**Vehicles**: buy a core vehicle or a finished one from your garage, and sell vehicles bought in play." ] },
      { id: "condition", title: "Condition", steps: [
        "Mark **wounds**: Physical or Stun, a number of boxes, **Take damage** or **Heal** (SR2 p.111). The wound level and its modifiers are shown.",
        "**Use** ammunition from a box.",
        "**Surgery** installs a spare implant; enter the surgeon's successes (Cybertechnology p.53)." ] }
    ]
  },
  {
    id: "printing", title: "Printing and sharing",
    intro: "The **Print** tab of a character makes its PDFs and its text stat block.",
    shots: [{ file: "print.webp", alt: "The Print tab: Download for Foundry, the style, paper and font menus, the Print sheet and Stat block buttons, and the start of the table card's row choices.", part: "sheet" }],
    parts: [
      { id: "sheet", title: "The sheet", steps: [
        "Choose a **style** (Fohawk, Fohawk ink saver, Classic, Printout or Dossier), the **paper** (Letter or A4) and the **font**, then **Print sheet**.",
        "Nothing is ever cut off: long sections continue on more pages.",
        "The PDFs are tagged for screen readers: headings, tables with headers, the condition monitors read as boxes marked." ] },
      { id: "card", title: "The table card", steps: [
        "Tick the attacks, skills, cyberware, spells and powers that go on the one-page **card**, then **Print card**. The page says whether it fits and which rows run over." ] },
      { id: "stat-block", title: "The stat block", steps: [
        "**Stat block (Markdown)** gives the character as text, for a forum post or your notes." ] }
    ]
  },
  {
    id: "foundry", title: "Foundry VTT",
    intro: "Everything you build downloads as a Foundry actor file for the SR2E system. In Foundry, create an actor of the same type, right-click it, choose **Import Data** and pick the file.",
    parts: [
      { id: "characters", title: "Characters", steps: [
        "On a character's **Print** tab, **Download for Foundry** gives its actor with every item.",
        "Vehicles a character owns download one by one from its page.",
        "A finished Foundry character can come back in: see [Getting started](/help/getting-started#foundry-import)." ] },
      { id: "vehicles-npcs", title: "Vehicles and NPCs", steps: [
        "A garage vehicle downloads as a Vehicle actor; a Rigger 2 design opens in Foundry's Vehicle Workshop.",
        "An NPC downloads as an NPC actor, with the numbers the page shows." ] }
    ]
  },
  {
    id: "garage", title: "The garage (vehicles)",
    intro: "Vehicles are documents of their own. Build one, then buy it with a character or link it.",
    shots: [{ file: "mounts.webp", alt: "A garage vehicle's page: its stats, its hardpoints and firmpoints with a mounted weapon, and the cargo list.", part: "mounts" }],
    parts: [
      { id: "start", title: "Start one", steps: [
        "In the Library choose **Kind: Vehicle** and one of the core book's vehicles (SR2 p.264), or **Design from scratch** (see [the Workshop](/help/workshop))." ] },
      { id: "mounts", title: "Mounts and cargo", steps: [
        "A **hardpoint** takes a heavy weapon, a **firmpoint** a smaller firearm; an adapted weapon costs twice its list price (SR2 p.251–253).",
        "**Load** gear or launcher ammunition as cargo, with a quantity." ] },
      { id: "characters", title: "With characters", steps: [
        "At creation a character can **buy** a garage vehicle (its whole price; it keeps a copy) or **link** it (free).",
        "In play the Nuyen step buys and sells vehicles." ] }
    ]
  },
  {
    id: "workshop", title: "The Workshop (Rigger 2 design)",
    intro: "Design a vehicle from scratch by the Rigger 2 rules (R2 p.108–146), with the same engine as Foundry's Vehicle Workshop.",
    shots: [{ file: "workshop.webp", alt: "A designed vehicle's page: its stats, the Workshop summary with Design Points, Mark-Up and price, the Save design and Undo changes buttons, and the chassis menus.", part: "design" }],
    parts: [
      { id: "design", title: "The design", steps: [
        "Choose a **chassis** (p.109) and a **power plant** (p.112), then the design options (p.115–118).",
        "The summary shows the stats, Design Points, Mark-Up and price as you change things, and every problem that keeps it unfinished.",
        "Press **Save design** to keep the changes." ] },
      { id: "mods", title: "Modifications and weapons", steps: [
        "Add **modifications** (p.118–146) with their ratings; they save as you add them.",
        "Install a weapon mount (fixed, pintle, ring or turret), then put weapons on it. A pistol or rifle on a fixed mount or in a turret adds its Firearm Conversion Kit for you (p.131–135)." ],
        notes: ["A character can buy a design only when it is finished, with Rigger 2 (and each modification's book) turned on."] }
    ]
  },
  {
    id: "npcs", title: "NPCs",
    intro: "Non-player characters for the gamemaster, tailored to the story (SR2 p.187).",
    shots: [{ file: "npc.webp", alt: "An NPC's experience tool: years entered, the targets ticked, and the preview table of every value that will change.", part: "experience" }],
    parts: [
      { id: "start", title: "Start one", steps: [
        "In the Library choose **Kind: NPC** and start **Blank** or from one of the 22 book contacts (SR2 p.203–213) or 7 archetypes.",
        "An archetype keeps its numbers: its cyberware and powers become part of its stat block." ] },
      { id: "edit", title: "Edit it", steps: [
        "Change anything: attributes, Reaction modifier, Initiative dice, armor, Essence, Magic and totem, Body Index, nuyen.",
        "Add skills from the catalog or your own; add any catalog item from any book. Tick **Worn** on armor." ] },
      { id: "experience", title: "Experience", steps: [
        "Enter years of experience and choose Attributes, Skills or Resources: +10% for every two years up to 10, then every four years (SR2 p.187).",
        "The preview lists every value that changes; **Apply** once. Values round to the nearest (house ruling R22)." ] },
      { id: "ratings", title: "Threat and Professional Ratings", steps: [
        "**Professional Rating** 1–4 shows when the NPC withdraws from a fight. Where the book prints a range, pick one.",
        "**Threat Rating**: type it, or take it from a Skill Success Table difficulty (SR2 p.68) or the team's Karma (1 per 100). Foundry doesn't roll Threat dice for people: roll them by hand." ] }
    ]
  },
  {
    id: "drafts", title: "Drafts",
    intro: "A **draft** is a free-text note: run plans, contacts' phone numbers, ideas.",
    parts: [
      { id: "edit", title: "Write and keep", steps: [
        "Start one from the Library (**Kind: Draft**). Edit its name and notes and **Save**.",
        "**History** lists every saved revision; **Bring back** makes an old one current again, as a new revision.",
        "**Download JSON** gives the whole document." ] }
    ]
  },
  {
    id: "catalog", title: "The catalog",
    intro: "Every item the app knows, from the core book and the sourcebook modules, with its book and page.",
    parts: [
      { id: "search", title: "Search", steps: [
        "Search by name or category; narrow it by **Kind** and by **Books**. Open an entry to read its details.",
        "What a character can buy depends on its own sourcebook choices (the Concept step)." ] }
    ]
  },
  {
    id: "account", title: "Your account",
    intro: "Your look, your reading font, the banter, your password and your sessions.",
    shots: [{ file: "account.webp", alt: "The Account page over the Cyberpunk rain texture: the Theme and Background menus, the easy-to-read font and banter options, and the password form.", part: "look" }],
    parts: [
      { id: "look", title: "Look and reading", steps: [
        "**Theme**: Cyberpunk (the default), Terminal, Cybernoir or GeoCities retro. It follows you to other devices.",
        "**Background**: a quiet texture behind the page, three to choose from for each theme (or **None**). Each theme keeps its own choice.",
        "**Easy-to-read font** (Atkinson Hyperlegible) on the site and on printed sheets." ] },
      { id: "banter", title: "The Shadowland board", steps: [
        "At the foot of each page, regulars of a shadowrunner board talk about what you're doing. It's flavour, never on a sheet or an export.",
        "**Pause** shows the whole thread at once; **Hide banter** (or the Account option) turns it off. With your system's reduce-motion setting it never animates." ] },
      { id: "password", title: "Password and sessions", steps: [
        "Change your password (it signs you out everywhere), or **Jack out everywhere** to end every session." ] }
    ]
  },
  {
    id: "accessibility", title: "Accessibility",
    intro: "The app aims at WCAG 2.2 AA in every theme. It is checked automatically on every change; a manual screen-reader pass is part of each release.",
    parts: [
      { id: "works", title: "What works", steps: [
        "Everything by keyboard; a **Skip to content** link first on each page; each page announces its title.",
        "Screen-reader names on every control; errors tied to their fields; saves announced.",
        "200% zoom and phone widths without sideways scrolling; high-contrast mode; no motion when your system asks for less.",
        "The PDF sheets are tagged for screen readers." ] },
      { id: "report", title: "Report a problem", steps: [
        "Tell the node's admin (**Report a problem** at the foot of the page says how). Say which page, your browser and assistive technology, and what happened." ] }
    ]
  },
  {
    id: "admin", title: "For admins",
    intro: "The **Admin** page (admins only) and the command line run the node.",
    parts: [
      { id: "people", title: "People", steps: [
        "**New invite** makes a one-time link (user or admin role). Hand it over yourself: there is no email.",
        "Each user shows what they have made. **Reset link**, **Disable**/**Enable** and the **role** menu are there; the last admin can't be disabled or demoted." ] },
      { id: "rules", title: "Rules", steps: [
        "**Selling gear**: a refund of what was paid, or a fence (SR2 p.188), for every character on the node." ] },
      { id: "cli", title: "The command line and backups", steps: [
        "Everything else (bootstrap, maintenance, backups, restore) is in the repository's README: run `server/cli.mjs` in the container." ] }
    ]
  }
];

/** The section (and anchor) that explains where the user is (r2 #2): a page id, a document kind, a character tab. */
export function helpFor({ page = "", kind = "", tab = "", designed = false, signedIn = true } = {}) {
  if (!signedIn) return "/help/getting-started";
  if (kind === "character") {
    if (["karma", "nuyen", "condition"].includes(tab)) return `/help/after-creation#${tab}`;
    if (tab === "card") return "/help/printing";
    return `/help/building-a-character${tab ? `#${tab}` : ""}`;
  }
  if (kind === "vehicle") return designed ? "/help/workshop" : "/help/garage";
  if (kind === "npc") return "/help/npcs";
  if (kind === "draft") return "/help/drafts";
  return { library: "/help/getting-started#library", catalog: "/help/catalog", account: "/help/account", admin: "/help/admin" }[page] ?? "/help";
}
