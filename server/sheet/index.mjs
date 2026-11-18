/**
 * Printing a sheet on the server (docs/PLAN-sheet.md draft 3): each render in a separate child process with a V8 heap
 * limit and a wall-clock kill; ONE at a time for the whole server, at most MAX_WAITING more queued, and at most
 * PER_MINUTE renders a minute server-wide (else "busy"). A job's slot is released only after its process has EXITED,
 * so a killed render can never overlap the next one. A failed or killed render is an error, never a partial PDF.
 */
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Refused } from "../auth/accounts.mjs";

const WORKER = fileURLToPath(new URL("./worker.mjs", import.meta.url));
export const LIMITS = { heapMb: 256, timeoutMs: 20000, maxWaiting: 4, perMinute: 30 };
let running = Promise.resolve(), queued = 0;
const recent = [];   // start times of the last minute's renders (server-wide)

function runOnce(message) {
  return new Promise((resolve) => {
    const child = fork(WORKER, [], { execArgv: [`--max-old-space-size=${LIMITS.heapMb}`], serialization: "advanced", stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let outcome = null;
    const fail = (msg, status, code) => new Refused(msg, status, code);
    // A timeout wins over anything received before it: a worker still alive at the limit is a failed render.
    const timer = setTimeout(() => { outcome = { err: fail("The sheet took too long to draw.", 503, "sheet-timeout") }; child.kill("SIGKILL"); }, LIMITS.timeoutMs);
    child.stderr.resume();
    child.once("message", (m) => {
      outcome ??= m?.pdf ? { pdf: Buffer.from(m.pdf) } : m?.webp ? { portrait: { webp: Buffer.from(m.webp), sha256: m.sha256, maxRSS: m.maxRSS } }
        : typeof m?.fits === "boolean" ? { fit: { fits: m.fits, overflow: m.overflow ?? [], message: m.message ?? "" } }
        : { err: m?.error ? fail(m.error, m.status ?? (m.user ? 422 : 500), m.code ?? (m.user ? "sheet-unprintable" : "sheet-failed")) : fail("The sheet couldn't be drawn.", 500, "sheet-failed") };
    });
    child.once("error", () => { outcome ??= { err: fail("The sheet couldn't be drawn.", 500, "sheet-failed") }; });
    // Settle only once the process is gone and its streams closed ("close" also fires when it never spawned).
    child.once("close", () => { clearTimeout(timer); resolve(outcome ?? { err: fail("The sheet couldn't be drawn.", 500, "sheet-failed") }); });
    child.send(message);
  });
}

/** Queue a job: one runs, a short line waits, a server-wide rate; else busy. */
async function runQueued(message) {
  const now = Date.now();
  while (recent.length && recent[0] <= now - 60000) recent.shift();
  if (queued >= LIMITS.maxWaiting + 1 || recent.length >= LIMITS.perMinute) throw new Refused("The printer is busy. Try again in a moment.", 503, "busy");
  queued++;
  recent.push(now);
  const job = running.then(() => runOnce(message));
  running = job.finally(() => { queued--; });
  const result = await job;
  if (result.err) throw result.err;
  return result;
}
export async function renderSheetPdf(body, opts) {
  const r = await runQueued({ body, paper: opts.paper, font: opts.font, style: opts.style, card: opts.card ?? null, fitOnly: !!opts.fitOnly, portrait: opts.portrait ?? null });
  return opts.fitOnly ? r.fit : r.pdf;
}
/** Check and re-encode an uploaded portrait in the child (docs/PLAN-portrait.md). */
export async function processPortraitJob(input, mime) {
  return (await runQueued({ job: "portrait", input, mime })).portrait;
}
