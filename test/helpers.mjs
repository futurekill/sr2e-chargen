import { createContext } from "../server/db/index.mjs";
import { active } from "../server/auth/passwords.mjs";

/** A fresh in-memory app context with a clock the test moves. Hashing is turned down so suites stay quick. */
export async function testContext() {
  active.memory = 8192; active.passes = 1;
  const clock = { t: 1_800_000_000_000 };
  const ctx = await createContext("sqlite://:memory:", { now: () => clock.t });
  return { ctx, clock, advance: (ms) => { clock.t += ms; } };
}
export const PW = "a perfectly fine password";
