/**
 * The HTTP app (docs/PLAN-M3.md §4, §7). `buildApp({ ctx, config })` returns a Fastify instance; nothing listens here.
 * Every state-changing request needs the right Origin; with a session, also its CSRF token. Inputs are validated by
 * JSON Schema; errors never echo input; API answers are never cached.
 */
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { findSession, csrfOk, ABSOLUTE_MS } from "./auth/sessions.mjs";
import { dummyHash } from "./auth/passwords.mjs";
import authRoutes from "./routes/auth.mjs";
import adminRoutes from "./routes/admin.mjs";
import documentRoutes from "./routes/documents.mjs";

export const REDACT = ["req.headers.cookie", "req.headers.authorization", 'req.headers["x-csrf-token"]', 'res.headers["set-cookie"]'];
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const fail = (reply, status, error, code) => reply.code(status).send({ error, code });

export async function buildApp({ ctx, config, logger }) {
  const app = Fastify({
    logger: logger ?? { level: config.logLevel, redact: REDACT },
    trustProxy: config.trustProxy,
    bodyLimit: 16 * 1024,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, allErrors: false } }
  });
  // Only JSON bodies: a cross-site form (text/plain, urlencoded, multipart) can't post anything here.
  app.removeContentTypeParser("text/plain");
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: { useDefaults: false, directives: { "default-src": ["'self'"], "script-src": ["'self'"], "style-src": ["'self'"],
      "img-src": ["'self'", "data:", "blob:"], "font-src": ["'self'"], "connect-src": ["'self'"], "object-src": ["'none'"],
      "frame-ancestors": ["'none'"], "base-uri": ["'none'"], "form-action": ["'self'"] } },
    hsts: config.secureCookie ? { maxAge: 31536000, includeSubDomains: false } : false,
    referrerPolicy: { policy: "no-referrer" },
    frameguard: { action: "deny" }
  });
  await app.register(rateLimit, { global: false });

  // Every registered route, for the tests that walk them (authorization can't be skipped by a new route).
  const routes = [];
  app.addHook("onRoute", (r) => { for (const m of [].concat(r.method)) if (m !== "HEAD") routes.push({ method: m, url: r.url }); });
  app.decorate("routeList", routes);
  app.decorate("ctx", ctx);
  app.decorate("config", config);
  app.decorateRequest("session", null);
  app.decorateRequest("ctx", null);   // the request's context: the app's, plus the acting session for writeTx to re-check
  await dummyHash();                  // made before the first login, so an unknown handle costs the same from request one

  app.addHook("onRequest", async (req, reply) => {
    if (req.url.startsWith("/api/")) reply.header("cache-control", "no-store");
    if (MUTATING.has(req.method) && req.headers.origin !== config.origin) return fail(reply, 403, "Wrong origin.", "origin");
  });

  /** preHandler: a live session, and on a state-changing request its CSRF token. */
  app.decorate("needSession", async (req, reply) => {
    const session = await findSession(ctx, req.cookies?.[config.cookieName]);
    if (!session) return fail(reply, 401, "Sign in first, chummer.", "no-session");
    if (MUTATING.has(req.method) && !csrfOk(session, req.headers["x-csrf-token"])) return fail(reply, 403, "Stale page — reload and try again.", "csrf");
    req.session = session;
    req.ctx = { ...ctx, session: { id: session.sessionId } };
  });
  app.decorate("needAdmin", async (req, reply) => {
    if (req.session?.user.role !== "admin") return fail(reply, 403, "Admins only.", "not-admin");
    req.ctx = { ...req.ctx, session: { ...req.ctx.session, role: "admin" } };
  });
  app.decorate("setSessionCookie", (reply, secret) => reply.setCookie(config.cookieName, secret,
    { httpOnly: true, secure: config.secureCookie, sameSite: "lax", path: "/", maxAge: ABSOLUTE_MS / 1000 }));
  app.decorate("clearSessionCookie", (reply) => reply.clearCookie(config.cookieName, { httpOnly: true, secure: config.secureCookie, sameSite: "lax", path: "/" }));

  app.setErrorHandler((err, req, reply) => {
    if (err.validation) return fail(reply, 400, "That request doesn't scan.", "invalid");
    const status = err.statusCode ?? 500;
    if (status >= 500 && status !== 503) { req.log.error({ err }, "request failed"); return fail(reply, 500, "Something fried on our end.", "server"); }
    // Our own refusals carry a message written for people; anything else from the framework gets a generic one.
    const ours = typeof err.code === "string" && !err.code.startsWith("FST_");
    return fail(reply, status, ours || status === 429 ? err.message : "That request doesn't scan.", ours ? err.code : status === 429 ? "slow-down" : "invalid");
  });
  // The built client (dist/client): hashed assets cached for good, every other GET gets the app shell (its router
  // decides), the API keeps its JSON 404.
  const clientDir = fileURLToPath(new URL("../dist/client/", import.meta.url));
  const hasClient = existsSync(clientDir);
  if (hasClient) await app.register(fastifyStatic, { root: clientDir, wildcard: false, index: false,
    setHeaders: (reply, path) => reply.header("cache-control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache") });
  app.setNotFoundHandler((req, reply) => {
    if (hasClient && req.method === "GET" && !req.url.startsWith("/api/") && !req.url.startsWith("/assets/")) return reply.header("cache-control", "no-cache").sendFile("index.html");
    return fail(reply, 404, "Nothing here.", "not-found");
  });

  app.get("/healthz", async () => ({ ok: true }));
  await app.register(authRoutes, { prefix: "/api" });
  await app.register(adminRoutes, { prefix: "/api/admin" });
  await app.register(documentRoutes, { prefix: "/api/documents" });
  return app;
}
