/** Configuration from the environment only (docs/PLAN-M3.md §2). */
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const baseUrl = env.BASE_URL ?? (production ? null : "http://localhost:3000");
  if (!baseUrl) throw new Error("BASE_URL is required in production (e.g. https://hoichummer.example)");
  const base = new URL(baseUrl);
  const local = base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.protocol !== "https:" && !local) throw new Error("BASE_URL must be https (plain http only on localhost)");
  return {
    production,
    baseUrl: base.origin,
    origin: base.origin,
    secureCookie: base.protocol === "https:",
    cookieName: base.protocol === "https:" ? "__Host-sid" : "sid",
    databaseUrl: env.DATABASE_URL ?? "sqlite:///data/chargen.db",
    port: Number(env.PORT) || 3000,
    host: env.HOST ?? "0.0.0.0",
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY.split(",").map(s => s.trim()) : false,
    logLevel: env.LOG_LEVEL ?? "info"
  };
}
