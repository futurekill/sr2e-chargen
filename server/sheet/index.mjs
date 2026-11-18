/**
 * Printing a sheet on the server (docs/PLAN-sheet.md draft 3): each render in a separate child process with a V8 heap
 * limit and a wall-clock kill, ONE at a time for the whole server, at most MAX_WAITING queued (else "busy"). A failed
 * or killed render is an error, never a partial PDF.
 */
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Refused } from "../auth/accounts.mjs";

const WORKER = fileURLToPath(new URL("./worker.mjs", import.meta.url));
export const LIMITS = { heapMb: 256, timeoutMs: 20000, maxWaiting: 4 };
let running = Promise.resolve(), waiting = 0;

function renderOnce(body, opts) {
  return new Promise((resolve, reject) => {
    const child = fork(WORKER, [], { execArgv: [`--max-old-space-size=${LIMITS.heapMb}`], serialization: "advanced", stdio: ["ignore", "ignore", "pipe", "ipc"] });
    let settled = false;
    const finish = (fn, v) => { if (!settled) { settled = true; clearTimeout(timer); fn(v); } };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish(reject, new Refused("The sheet took too long to draw.", 503, "sheet-timeout")); }, LIMITS.timeoutMs);
    child.stderr.resume();
    child.once("message", (m) => {
      if (m?.error) finish(reject, new Refused(m.error, m.user ? 422 : 500, m.user ? "sheet-unprintable" : "sheet-failed"));
      else if (m?.pdf) finish(resolve, Buffer.from(m.pdf));
      else finish(reject, new Refused("The sheet couldn't be drawn.", 500, "sheet-failed"));
    });
    child.once("exit", (code) => finish(reject, new Refused("The sheet couldn't be drawn.", 500, `sheet-exit-${code}`)));
    child.once("error", () => finish(reject, new Refused("The sheet couldn't be drawn.", 500, "sheet-failed")));
    child.send({ body, paper: opts.paper, font: opts.font });
  });
}

/** Queue a render: one at a time, a short line, else busy. */
export function renderSheetPdf(body, opts) {
  if (waiting >= LIMITS.maxWaiting) return Promise.reject(new Refused("The printer is busy. Try again in a moment.", 503, "busy"));
  waiting++;
  const job = running.then(() => renderOnce(body, opts));
  running = job.catch(() => {}).finally(() => { waiting--; });
  return job;
}
