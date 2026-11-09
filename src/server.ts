/** HTTP server: public API, feeds, admin API, OAuth, MCP endpoint and the static PWA. */

import { Elysia } from "elysia";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { existsSync, readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { z } from "zod";
import type { Config } from "./config.ts";
import { renderCsv, renderIcs, renderRss } from "./feeds.ts";
import { PlaceSearch } from "./geocode.ts";
import { DEFAULT_DESCRIPTION, eventMeta, renderShell, type PageMeta } from "./html.ts";
import { createMcpServer } from "./mcp.ts";
import {
  authorizationServerMetadata,
  configureOAuth,
  handleAuthorizeGet,
  handleAuthorizePost,
  handleRegister,
  handleRevoke,
  handleToken,
  listConnections,
  protectedResourceMetadata,
  revokeConnection,
  wwwAuthenticate,
} from "./oauth.ts";
import { subscriptionSchema } from "./push.ts";
import {
  countEvents,
  eventCreateSchema,
  eventStats,
  eventUpdateSchema,
  EventValidationError,
  listAdminEvents,
  listPublicEvents,
  toPublicEvent,
  today,
  type EventFilter,
} from "./repo/events.ts";
import {
  bearerUser,
  cleanupExpired,
  createApiToken,
  createSession,
  createUser,
  deleteApiToken,
  deleteSession,
  deleteUser,
  getUser,
  listApiTokens,
  listUsers,
  SESSION_DAYS,
  sessionUser,
  updateUser,
  verifyLogin,
} from "./repo/users.ts";
import type { App } from "./service.ts";
import type { User } from "./shared/types.ts";
import { EVENT_STATUS, EVENT_TYPES, GENRES, REGISTRATION_STATUS, COUNTRIES, STAFF_ROLES, USER_ROLES, keys } from "./shared/vocab.ts";
import { feedToken, getFavorites, setFavorites, userIdByFeedToken } from "./repo/account.ts";
import pkg from "../package.json" with { type: "json" };

const SESSION_COOKIE = "lk_session";
const startedAt = Date.now();

/* ---------- small helpers ---------- */

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const list = (v: unknown): string[] | undefined => {
  if (typeof v !== "string" || !v.trim()) return undefined;
  return v.split(",").map((s) => s.trim()).filter(Boolean);
};

/** Simple fixed-window rate limiter (in memory). */
class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}
  allow(key: string): boolean {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.reset < now) {
      // Evict only expired windows, so a flood of new keys cannot reset active lockouts.
      if (this.hits.size > 5000) for (const [k, v] of this.hits) if (v.reset < now) this.hits.delete(k);
      this.hits.set(key, { n: 1, reset: now + this.windowMs });
      return true;
    }
    entry.n++;
    return entry.n <= this.max;
  }
}

function filterFromQuery(q: Record<string, string | undefined>): EventFilter {
  return {
    from: q.from || undefined,
    to: q.to || undefined,
    includePast: q.past === "1" || q.past === "true",
    genres: list(q.genre ?? q.genres),
    types: list(q.type ?? q.types),
    countries: list(q.country),
    registration: list(q.registration),
    ids: list(q.ids)?.map(Number).filter(Number.isInteger),
    q: q.q || undefined,
  };
}

const zodMessage = (err: z.ZodError) =>
  err.issues.map((i) => `${i.path.join(".") || "Eingabe"}: ${i.message}`).join("; ");

/* ---------- server ---------- */

export function startServer(app: App, cfg: Config) {
  const db = app.db;
  configureOAuth(cfg.oauthRedirectHosts);
  const loginLimiter = new RateLimiter(10, 15 * 60_000);
  const suggestLimiter = new RateLimiter(5, 60 * 60_000);
  const registerLimiter = new RateLimiter(20, 60 * 60_000);
  const pushLimiter = new RateLimiter(30, 60 * 60_000);
  const pushTestLimiter = new RateLimiter(5, 60 * 60_000);
  const placeLimiter = new RateLimiter(60, 60 * 60_000);
  const places = new PlaceSearch(cfg.contactEmail);
  const clientIp = new WeakMap<Request, string>();
  const ipOf = (req: Request) => clientIp.get(req) ?? "unknown";

  const isProd = process.env.NODE_ENV === "production";
  const templates = new Map<string, string>();
  function template(name: "index.html" | "admin.html"): string {
    if (isProd && templates.has(name)) return templates.get(name)!;
    const path = join(cfg.publicDir, name);
    const html = existsSync(path)
      ? readFileSync(path, "utf8")
      : `<!doctype html><html lang="de"><head><meta charset="utf-8"><!--meta--></head><body><p>Frontend nicht gebaut. Bitte <code>bun run build:client</code> ausführen.</p></body></html>`;
    templates.set(name, html);
    return html;
  }

  function baseUrl(request: Request): string {
    if (cfg.publicUrl) return cfg.publicUrl;
    const url = new URL(request.url);
    const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    return `${proto}://${request.headers.get("x-forwarded-host") ?? url.host}`;
  }

  function sessionToken(request: Request): string | undefined {
    return parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
  }

  function sessionCookie(token: string, maxAge = SESSION_DAYS * 86_400): string {
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${cfg.secureCookies ? "; Secure" : ""}`;
  }

  /** Resolves the acting user from a Bearer token or the session cookie (cookie requests need the CSRF header). */
  function authenticate(request: Request): { user: User | null; csrfFailed?: boolean } {
    const auth = request.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) return { user: bearerUser(db, auth.slice(7).trim()) };
    const user = sessionUser(db, sessionToken(request));
    if (user && request.method !== "GET" && request.headers.get("x-requested-with") !== "larp-kalender")
      return { user: null, csrfFailed: true };
    return { user };
  }

  function html(page: "index.html" | "admin.html", meta: PageMeta, preload?: unknown): Response {
    return new Response(renderShell(template(page), meta, cfg.allowIndexing, preload), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
    });
  }

  function etagFor(request: Request, extra = ""): string {
    const s = eventStats(db);
    const raw = `${s.lastUpdate}|${s.total}|${today()}|${new URL(request.url).search}|${extra}`;
    return `W/"${new Bun.CryptoHasher("sha1").update(raw).digest("hex").slice(0, 20)}"`;
  }

  function cached(request: Request, body: () => string | object, headers: Record<string, string>, extra = ""): Response {
    const etag = etagFor(request, extra);
    const h = { etag, "cache-control": "public, max-age=0, must-revalidate", ...headers };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: h });
    const b = body();
    return new Response(typeof b === "string" ? b : JSON.stringify(b), h ? { headers: h } : undefined);
  }

  function staticFile(rel: string, request: Request, cache: string): Response | null {
    const safe = normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
    if (safe.includes("..")) return null;
    const path = join(cfg.publicDir, safe);
    if (!existsSync(path)) return null;
    const accept = request.headers.get("accept-encoding") ?? "";
    for (const [enc, ext] of [
      ["br", ".br"],
      ["gzip", ".gz"],
    ] as const) {
      if (accept.includes(enc) && existsSync(path + ext)) {
        const file = Bun.file(path);
        return new Response(Bun.file(path + ext), {
          headers: { "content-type": file.type, "content-encoding": enc, vary: "accept-encoding", "cache-control": cache },
        });
      }
    }
    return new Response(Bun.file(path), { headers: { "cache-control": cache } });
  }

  async function handleMcp(request: Request, user: User): Promise<Response> {
    const server = createMcpServer(app, user, baseUrl(request));
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    if (request.method !== "GET") {
      await transport.close();
      await server.close();
    }
    return response;
  }

  const meta = (request: Request, title = "LARP-Kalender", description = DEFAULT_DESCRIPTION): PageMeta => ({
    title,
    description,
    url: baseUrl(request) + new URL(request.url).pathname,
    defaultImage: `${baseUrl(request)}/icons/og-image.png`,
  });

  /* ---------- admin API ---------- */

  const userCreateSchema = z.object({
    email: z.string().trim().email(),
    name: z.string().trim().min(2).max(100),
    password: z.string().min(10, "Passwort: mindestens 10 Zeichen").max(200),
    role: z.enum(keys(USER_ROLES)).default("editor"),
  });
  const userUpdateSchema = z.object({
    email: z.string().trim().email().optional(),
    name: z.string().trim().min(2).max(100).optional(),
    password: z.string().min(10, "Passwort: mindestens 10 Zeichen").max(200).optional(),
    role: z.enum(keys(USER_ROLES)).optional(),
    disabled: z.boolean().optional(),
  });

  function forbidden(user: User | null, set: { status?: number | string }) {
    if (user?.role === "admin") return null;
    set.status = 403;
    return { error: "Nur für Administratoren." };
  }

  const adminApi = new Elysia({ prefix: "/api/admin" })
    .post("/login", async ({ request, body, set }) => {
      if (!loginLimiter.allow(ipOf(request))) {
        set.status = 429;
        return { error: "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen." };
      }
      const { email, password } = (body ?? {}) as { email?: string; password?: string };
      const user = await verifyLogin(db, String(email ?? ""), String(password ?? ""));
      if (!user) {
        set.status = 401;
        return { error: "E-Mail oder Passwort ist falsch." };
      }
      if (!STAFF_ROLES.includes(user.role)) {
        set.status = 403;
        return { error: "Dieses Konto hat keinen Zugang zur Redaktion." };
      }
      set.headers["set-cookie"] = sessionCookie(createSession(db, user.id));
      return { user };
    })
    .post("/logout", ({ request, set }) => {
      const token = sessionToken(request);
      if (token) deleteSession(db, token);
      set.headers["set-cookie"] = sessionCookie("", 0);
      return { ok: true };
    })
    .resolve(({ request }) => authenticate(request))
    .onBeforeHandle(({ user, csrfFailed, set }) => {
      if (!user) {
        set.status = csrfFailed ? 403 : 401;
        return { error: csrfFailed ? "CSRF-Prüfung fehlgeschlagen." : "Nicht angemeldet." };
      }
      // Members use the public app only; the backend, tokens and MCP are for staff.
      if (!STAFF_ROLES.includes(user.role)) {
        set.status = 403;
        return { error: "Dieses Konto hat keinen Zugang zur Redaktion." };
      }
    })
    .get("/me", ({ user }) => ({ user }))
    .put("/me", async ({ user, body, set }) => {
      const b = (body ?? {}) as { name?: string; password?: string; currentPassword?: string };
      if (b.password) {
        if (!(await verifyLogin(db, user!.email, b.currentPassword ?? ""))) {
          set.status = 400;
          return { error: "Das aktuelle Passwort ist falsch." };
        }
        if (b.password.length < 10) {
          set.status = 400;
          return { error: "Passwort: mindestens 10 Zeichen" };
        }
      }
      return { user: await updateUser(db, user!.id, { name: b.name || undefined, password: b.password || undefined }) };
    })
    .get("/meta", () => ({
      stats: eventStats(db),
      pushSubscribers: app.push.count(),
      version: pkg.version,
      vocab: { genres: GENRES, eventTypes: EVENT_TYPES, registrationStatus: REGISTRATION_STATUS, status: EVENT_STATUS, countries: COUNTRIES, roles: USER_ROLES },
    }))
    .get("/events", ({ query }) => {
      const q = query as Record<string, string | undefined>;
      const f: EventFilter = {
        ...filterFromQuery(q),
        includePast: q.past === "1",
        statuses: list(q.status),
        order: q.past === "1" ? "desc" : "asc",
        limit: Number(q.limit ?? 500),
        offset: Number(q.offset ?? 0),
      };
      return { events: listAdminEvents(db, f), total: countEvents(db, f) };
    })
    .post("/events", ({ user, body, set }) => {
      const b = (body ?? {}) as Record<string, unknown>;
      const parsed = eventCreateSchema.safeParse(b);
      if (!parsed.success) {
        set.status = 400;
        return { error: zodMessage(parsed.error) };
      }
      try {
        const result = app.createEvent(parsed.data, user, "manual", b.allowDuplicate === true);
        if (!result.created) {
          set.status = 409;
          return { error: "Möglicherweise schon eingetragen.", duplicates: result.duplicates };
        }
        set.status = 201;
        return { event: result.event };
      } catch (e) {
        set.status = e instanceof EventValidationError ? 400 : 500;
        return { error: (e as Error).message };
      }
    })
    .get("/events/:id", ({ params, set }) => {
      const e = app.getEvent(Number(params.id));
      if (!e) set.status = 404;
      return e ? { event: e } : { error: "Nicht gefunden." };
    })
    .put("/events/:id", ({ user, params, body, set }) => {
      const parsed = eventUpdateSchema.safeParse(body ?? {});
      if (!parsed.success) {
        set.status = 400;
        return { error: zodMessage(parsed.error) };
      }
      try {
        const e = app.updateEvent(Number(params.id), parsed.data, user, (body as { markChecked?: boolean })?.markChecked === true);
        if (!e) set.status = 404;
        return e ? { event: e } : { error: "Nicht gefunden." };
      } catch (e) {
        set.status = e instanceof EventValidationError ? 400 : 500;
        return { error: (e as Error).message };
      }
    })
    .delete("/events/:id", ({ params, set }) => {
      if (!app.deleteEvent(Number(params.id))) set.status = 404;
      return { ok: true };
    })
    .get("/tokens", ({ user }) => ({ tokens: listApiTokens(db, user!.id), connections: listConnections(db, user!.id) }))
    .post("/tokens", ({ user, body, set }) => {
      const name = String((body as { name?: string })?.name ?? "").trim();
      if (name.length < 2) {
        set.status = 400;
        return { error: "Bitte einen Namen angeben." };
      }
      return createApiToken(db, user!.id, name.slice(0, 80));
    })
    .delete("/tokens/:id", ({ user, params }) => ({ ok: deleteApiToken(db, user!.id, Number(params.id)) }))
    .delete("/connections/:clientId", ({ user, params }) => {
      revokeConnection(db, user!.id, params.clientId);
      return { ok: true };
    })
    // User management: administrators only.
    .get("/users", ({ user, set }) => forbidden(user, set) ?? { users: listUsers(db) })
    .post("/users", async ({ user, body, set }) => {
      const denied = forbidden(user, set);
      if (denied) return denied;
      const parsed = userCreateSchema.safeParse(body ?? {});
      if (!parsed.success) {
        set.status = 400;
        return { error: zodMessage(parsed.error) };
      }
      try {
        set.status = 201;
        return { user: await createUser(db, parsed.data) };
      } catch {
        set.status = 409;
        return { error: "Diese E-Mail-Adresse wird bereits verwendet." };
      }
    })
    .put("/users/:id", async ({ user, params, body, set }) => {
      const denied = forbidden(user, set);
      if (denied) return denied;
      const parsed = userUpdateSchema.safeParse(body ?? {});
      if (!parsed.success) {
        set.status = 400;
        return { error: zodMessage(parsed.error) };
      }
      const id = Number(params.id);
      if (id === user!.id && ((parsed.data.role && parsed.data.role !== "admin") || parsed.data.disabled)) {
        set.status = 400;
        return { error: "Du kannst dir selbst keine Adminrechte entziehen." };
      }
      const updated = await updateUser(db, id, parsed.data).catch(() => null);
      if (!updated) set.status = 400;
      return updated ? { user: updated } : { error: "Speichern fehlgeschlagen (E-Mail schon vergeben?)." };
    })
    .delete("/users/:id", ({ user, params, set }) => {
      const denied = forbidden(user, set);
      if (denied) return denied;
      const id = Number(params.id);
      if (id === user!.id || !getUser(db, id)) {
        set.status = 400;
        return { error: "Dieser Benutzer kann nicht gelöscht werden." };
      }
      deleteUser(db, id);
      return { ok: true };
    });

  /* ---------- public API ---------- */

  const suggestionSchema = eventCreateSchema
    .pick({
      title: true,
      startDate: true,
      endDate: true,
      city: true,
      postalCode: true,
      country: true,
      venue: true,
      organizer: true,
      websiteUrl: true,
      registrationUrl: true,
      genres: true,
      eventType: true,
      summary: true,
      priceText: true,
    })
    .extend({ submitter: z.string().trim().max(200).optional(), website: z.string().optional() });

  const publicApi = new Elysia({ prefix: "/api" })
    .get("/events", ({ request, query }) =>
      cached(request, () => ({ events: listPublicEvents(db, filterFromQuery(query as Record<string, string>)), today: today() }), {
        "content-type": "application/json",
      }),
    )
    .get("/events/:id", ({ params, set }) => {
      const e = app.getEvent(params.id);
      if (!e || e.status === "draft") {
        set.status = 404;
        return { error: "Nicht gefunden." };
      }
      return { event: toPublicEvent(e) };
    })
    .get("/meta", () => ({
      genres: GENRES,
      eventTypes: EVENT_TYPES,
      registrationStatus: REGISTRATION_STATUS,
      countries: COUNTRIES,
      stats: eventStats(db),
      vapidPublicKey: app.push.publicKey,
      today: today(),
    }))
    .post("/suggestions", ({ request, body, set }) => {
      if (!suggestLimiter.allow(ipOf(request))) {
        set.status = 429;
        return { error: "Zu viele Vorschläge in kurzer Zeit. Bitte später erneut versuchen." };
      }
      const parsed = suggestionSchema.safeParse(body ?? {});
      if (!parsed.success) {
        set.status = 400;
        return { error: zodMessage(parsed.error) };
      }
      const { submitter, website, ...data } = parsed.data;
      // Honeypot field: bots fill in "website", humans never see it.
      if (website) return { ok: true };
      try {
        app.createEvent(
          { ...data, status: "draft", notesInternal: `Vorschlag über das Formular${submitter ? ` von ${submitter}` : ""}.` },
          null,
          "suggestion",
          true,
        );
        set.status = 201;
        return { ok: true };
      } catch (e) {
        set.status = 400;
        return { error: (e as Error).message };
      }
    })
    // Place search for the radius filter (PLZ or town -> coordinates).
    .get("/places", async ({ request, query, set }) => {
      const q = String((query as Record<string, string>).q ?? "");
      if (q.trim().length < 2) return { places: [] };
      if (!placeLimiter.allow(ipOf(request))) {
        set.status = 429;
        return { error: "Zu viele Suchanfragen. Bitte später erneut versuchen." };
      }
      try {
        return { places: await places.search(q) };
      } catch (err) {
        console.warn("[places]", (err as Error).message);
        set.status = 502;
        return { error: "Ortssuche gerade nicht erreichbar." };
      }
    })
    // Recent new events and changes for the in-app notification center.
    .get("/notifications", ({ request }) =>
      cached(request, () => ({ items: app.push.activity(), today: today() }), { "content-type": "application/json" }, app.push.activityVersion()),
    )
    .get("/push/key", () => ({ publicKey: app.push.publicKey }))
    .post("/push/subscribe", ({ request, body, set }) => {
      if (!pushLimiter.allow(ipOf(request))) {
        set.status = 429;
        return { error: "Zu viele Anfragen." };
      }
      const parsed = subscriptionSchema.safeParse(body ?? {});
      if (!parsed.success) {
        set.status = 400;
        return { error: zodMessage(parsed.error) };
      }
      if (!app.push.subscribe(parsed.data)) {
        set.status = 503;
        return { error: "Benachrichtigungen sind gerade nicht verfügbar." };
      }
      return { ok: true };
    })
    .post("/push/unsubscribe", ({ body }) => {
      const endpoint = (body as { endpoint?: string })?.endpoint;
      if (endpoint) app.push.unsubscribe(endpoint);
      return { ok: true };
    })
    .post("/push/test", async ({ request, body }) => {
      if (!pushTestLimiter.allow(ipOf(request))) return { ok: false };
      const endpoint = (body as { endpoint?: string })?.endpoint;
      return { ok: endpoint ? await app.push.test(endpoint) : false };
    });

  /* ---------- account API (frontend login for all roles) ---------- */

  const registerSchema = z.object({
    email: z.string().trim().email("Bitte eine gültige E-Mail-Adresse angeben."),
    name: z.string().trim().min(2, "Name: mindestens 2 Zeichen").max(60),
    password: z.string().min(10, "Passwort: mindestens 10 Zeichen").max(200),
    website: z.string().optional(),
  });
  const signupLimiter = new RateLimiter(5, 60 * 60_000);

  const account = (user: User) => ({ user, favorites: getFavorites(db, user.id), feedToken: feedToken(db, user.id), staff: STAFF_ROLES.includes(user.role) });

  // All mutating account requests need the custom header (blocks cross-site form posts).
  const csrfGuard = ({ request, set }: { request: Request; set: { status?: number | string } }) => {
    if (request.method !== "GET" && request.headers.get("x-requested-with") !== "larp-kalender") {
      set.status = 403;
      return { error: "CSRF-Prüfung fehlgeschlagen." };
    }
  };

  const accountPublicApi = new Elysia({ prefix: "/api/account" })
    .onBeforeHandle(csrfGuard)
    .get("/me", ({ request }) => {
      const user = sessionUser(db, sessionToken(request));
      return user ? account(user) : { user: null };
    })
    .post("/login", async ({ request, body, set }) => {
      if (!loginLimiter.allow(ipOf(request))) {
        set.status = 429;
        return { error: "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen." };
      }
      const { email, password } = (body ?? {}) as { email?: string; password?: string };
      const user = await verifyLogin(db, String(email ?? ""), String(password ?? ""));
      if (!user) {
        set.status = 401;
        return { error: "E-Mail oder Passwort ist falsch." };
      }
      set.headers["set-cookie"] = sessionCookie(createSession(db, user.id));
      return account(user);
    })
    .post("/register", async ({ request, body, set }) => {
      if (!signupLimiter.allow(ipOf(request))) {
        set.status = 429;
        return { error: "Zu viele Registrierungen. Bitte später erneut versuchen." };
      }
      const parsed = registerSchema.safeParse(body ?? {});
      if (!parsed.success) {
        set.status = 400;
        return { error: zodMessage(parsed.error) };
      }
      if (parsed.data.website) return { user: null }; // honeypot
      try {
        const user = await createUser(db, { email: parsed.data.email, name: parsed.data.name, password: parsed.data.password, role: "member" });
        set.headers["set-cookie"] = sessionCookie(createSession(db, user.id));
        set.status = 201;
        return account(user);
      } catch {
        set.status = 409;
        return { error: "Für diese E-Mail-Adresse gibt es schon ein Konto. Melde dich an." };
      }
    })
    .post("/logout", ({ request, set }) => {
      const token = sessionToken(request);
      if (token) deleteSession(db, token);
      set.headers["set-cookie"] = sessionCookie("", 0);
      return { ok: true };
    });

  const accountApi = new Elysia({ prefix: "/api/account" })
    .onBeforeHandle(csrfGuard)
    .resolve(({ request }) => ({ user: sessionUser(db, sessionToken(request)) }))
    .onBeforeHandle(({ user, set }) => {
      if (!user) {
        set.status = 401;
        return { error: "Nicht angemeldet." };
      }
    })
    .put("/favorites", ({ user, body }) => {
      const ids = Array.isArray((body as { ids?: unknown })?.ids) ? ((body as { ids: unknown[] }).ids.map(Number) as number[]) : [];
      return { favorites: setFavorites(db, user!.id, ids) };
    })
    .post("/feed-token", ({ user }) => ({ feedToken: feedToken(db, user!.id, true) }))
    .put("/me", async ({ user, body, set }) => {
      const b = (body ?? {}) as { name?: string; password?: string; currentPassword?: string };
      if (b.password) {
        if (b.password.length < 10) {
          set.status = 400;
          return { error: "Passwort: mindestens 10 Zeichen" };
        }
        if (!(await verifyLogin(db, user!.email, b.currentPassword ?? ""))) {
          set.status = 400;
          return { error: "Das aktuelle Passwort ist falsch." };
        }
      }
      const name = b.name?.trim();
      if (name !== undefined && (name.length < 2 || name.length > 60)) {
        set.status = 400;
        return { error: "Name: 2 bis 60 Zeichen" };
      }
      const updated = await updateUser(db, user!.id, { name: name || undefined, password: b.password || undefined });
      // A password change ends all sessions; keep this device signed in.
      if (b.password) set.headers["set-cookie"] = sessionCookie(createSession(db, user!.id));
      return account(updated!);
    })
    .delete("/me", async ({ user, body, set }) => {
      if (STAFF_ROLES.includes(user!.role)) {
        set.status = 400;
        return { error: "Redaktionskonten werden im Backend verwaltet." };
      }
      if (!(await verifyLogin(db, user!.email, String((body as { password?: string })?.password ?? "")))) {
        set.status = 400;
        return { error: "Das Passwort ist falsch." };
      }
      deleteUser(db, user!.id);
      set.headers["set-cookie"] = sessionCookie("", 0);
      return { ok: true };
    });

  /* ---------- main app ---------- */

  const web = new Elysia()
    .onError(({ code, error, set }) => {
      if (code === "NOT_FOUND") {
        set.status = 404;
        return { error: "Nicht gefunden." };
      }
      if (code === "PARSE") {
        set.status = 400;
        return { error: "Ungültige Anfrage." };
      }
      console.error("[http]", error);
      set.status = 500;
      return { error: "Interner Fehler." };
    })
    .get("/health", () => ({ ok: true, version: pkg.version, uptime: Math.round((Date.now() - startedAt) / 1000), memoryMb: Math.round(process.memoryUsage().rss / 1048576) }))
    .get(
      "/robots.txt",
      () =>
        new Response(cfg.allowIndexing ? "User-agent: *\nAllow: /\nDisallow: /admin\n" : "User-agent: *\nDisallow: /\n", {
          headers: { "content-type": "text/plain" },
        }),
    )
    // OAuth 2.1 for MCP clients
    .get("/.well-known/oauth-protected-resource", ({ request }) => protectedResourceMetadata(baseUrl(request)))
    .get("/.well-known/oauth-protected-resource/mcp", ({ request }) => protectedResourceMetadata(baseUrl(request)))
    .get("/.well-known/oauth-authorization-server", ({ request }) => authorizationServerMetadata(baseUrl(request)))
    .get("/.well-known/oauth-authorization-server/mcp", ({ request }) => authorizationServerMetadata(baseUrl(request)))
    .get("/.well-known/openid-configuration", ({ request }) => authorizationServerMetadata(baseUrl(request)))
    .post("/oauth/register", ({ request }) =>
      registerLimiter.allow(ipOf(request))
        ? handleRegister(db, request)
        : new Response(JSON.stringify({ error: "slow_down", error_description: "Too many registrations." }), {
            status: 429,
            headers: { "content-type": "application/json" },
          }),
    )
    .get("/oauth/authorize", ({ request }) => handleAuthorizeGet(db, request, sessionToken(request)))
    .post("/oauth/authorize", async ({ request }) => {
      let cookie: string | null = null;
      const res = await handleAuthorizePost(
        db,
        request,
        sessionToken(request),
        (t) => (cookie = sessionCookie(t)),
        () => loginLimiter.allow(ipOf(request)),
      );
      if (cookie) res.headers.append("set-cookie", cookie);
      return res;
    })
    .post("/oauth/token", ({ request }) => handleToken(db, request))
    .post("/oauth/revoke", ({ request }) => handleRevoke(db, request))
    // MCP (Streamable HTTP, stateless)
    .all("/mcp", ({ request }) => {
      const auth = request.headers.get("authorization");
      const user = auth?.startsWith("Bearer ") ? bearerUser(db, auth.slice(7).trim()) : null;
      if (!user)
        return new Response(JSON.stringify({ error: "unauthorized", error_description: "Bearer token required." }), {
          status: 401,
          headers: { "content-type": "application/json", "www-authenticate": wwwAuthenticate(baseUrl(request)) },
        });
      if (!STAFF_ROLES.includes(user.role))
        return new Response(JSON.stringify({ error: "forbidden", error_description: "Only editors and administrators can use MCP." }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      return handleMcp(request, user);
    })
    // Feeds & exports
    .get("/kalender.ics", ({ request, query }) => {
      const q = query as Record<string, string>;
      const f = filterFromQuery(q);
      // Subscriptions keep recently past events so they do not vanish from calendars right away.
      if (!f.from && !f.includePast) f.from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
      // Private bookmark feed of a member account (updates automatically when bookmarks change).
      if (q.feed) {
        const userId = userIdByFeedToken(db, q.feed);
        f.ids = userId ? getFavorites(db, userId) : [];
        if (!f.ids.length) f.ids = [-1];
      }
      const name = q.name?.slice(0, 60) || (f.ids ? "LARP – Meine Merkliste" : "LARP-Kalender");
      return cached(
        request,
        () => renderIcs(listPublicEvents(db, f), { base: baseUrl(request), name, deadlines: q.deadlines === "1" }),
        { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'inline; filename="larp-kalender.ics"' },
      );
    })
    .get("/termin/:slug/kalender.ics", ({ request, params, set }) => {
      const e = app.getEvent(params.slug);
      if (!e || e.status === "draft") {
        set.status = 404;
        return "Nicht gefunden.";
      }
      return new Response(renderIcs([toPublicEvent(e)], { base: baseUrl(request), name: e.title, deadlines: true }), {
        headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${e.slug}.ics"` },
      });
    })
    .get("/veranstaltungen.csv", ({ request, query }) => {
      const q = query as Record<string, string>;
      return cached(
        request,
        () => renderCsv(listPublicEvents(db, filterFromQuery(q)), baseUrl(request), q.sep === "," ? "," : ";"),
        { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="larp-veranstaltungen-${today()}.csv"` },
      );
    })
    .get("/feed.xml", ({ request }) =>
      cached(
        request,
        () => {
          const events = listPublicEvents(db, { statuses: ["published"], limit: 2000 })
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, 50);
          return renderRss(events, baseUrl(request));
        },
        { "content-type": "application/rss+xml; charset=utf-8" },
      ),
    )
    .use(publicApi)
    .use(accountPublicApi)
    .use(accountApi)
    .use(adminApi)
    // Static assets
    .get("/assets/*", ({ request, params }) => staticFile(`assets/${params["*"]}`, request, "public, max-age=31536000, immutable") ?? notFound())
    .get("/icons/*", ({ request, params }) => staticFile(`icons/${params["*"]}`, request, "public, max-age=604800") ?? notFound())
    .get("/sw.js", ({ request }) => {
      const res = staticFile("sw.js", request, "no-cache");
      if (res) res.headers.set("service-worker-allowed", "/");
      return res ?? notFound();
    })
    .get("/manifest.webmanifest", ({ request }) => {
      const res = staticFile("manifest.webmanifest", request, "public, max-age=86400");
      res?.headers.set("content-type", "application/manifest+json");
      return res ?? notFound();
    })
    .get("/favicon.ico", ({ request }) => staticFile("icons/favicon.ico", request, "public, max-age=604800") ?? notFound())
    // Pages
    .get("/termin/:slug", ({ request, params }) => {
      const e = app.getEvent(params.slug);
      if (!e || e.status === "draft") return html("index.html", meta(request, "Nicht gefunden – LARP-Kalender"));
      return html("index.html", eventMeta(toPublicEvent(e), baseUrl(request)), { event: toPublicEvent(e) });
    })
    .get("/admin", ({ request }) => html("admin.html", meta(request, "Redaktion – LARP-Kalender")))
    .get("/admin/*", ({ request }) => html("admin.html", meta(request, "Redaktion – LARP-Kalender")))
    .get("/*", ({ request }) => {
      const path = new URL(request.url).pathname;
      if (/\.[a-z0-9]{2,5}$/i.test(path)) return notFound();
      return html("index.html", meta(request));
    });

  function notFound() {
    return new Response("Nicht gefunden", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const COMPRESSIBLE = /^(application\/(json|rss\+xml|manifest\+json)|text\/(html|calendar|csv|plain|css|javascript))/;

  async function finalize(request: Request, original: Response): Promise<Response> {
    // Copy so that headers are mutable (e.g. Response.redirect() has immutable headers).
    const res = new Response(original.body, { status: original.status, statusText: original.statusText, headers: original.headers });
    const h = res.headers;
    h.set("x-robots-tag", cfg.allowIndexing ? "all" : "noindex, nofollow, noarchive");
    h.set("x-content-type-options", "nosniff");
    h.set("referrer-policy", "strict-origin-when-cross-origin");
    const url = new URL(request.url);
    if ((h.get("content-type") ?? "").startsWith("text/html")) {
      h.set("x-frame-options", "DENY");
      h.set("permissions-policy", "camera=(), microphone=(), geolocation=(self)");
    }
    // Feeds and the public API may be read from other origins (calendar tools, widgets).
    if (url.pathname.startsWith("/api/events") || url.pathname.endsWith(".ics") || url.pathname.startsWith("/.well-known/"))
      h.set("access-control-allow-origin", "*");
    const type = h.get("content-type") ?? "";
    if (
      res.status === 200 &&
      !h.has("content-encoding") &&
      COMPRESSIBLE.test(type) &&
      (request.headers.get("accept-encoding") ?? "").includes("gzip") &&
      url.pathname !== "/mcp"
    ) {
      const body = new Uint8Array(await res.arrayBuffer());
      if (body.length < 1024) return new Response(body, { status: res.status, headers: h });
      h.set("content-encoding", "gzip");
      h.set("vary", "accept-encoding");
      h.delete("content-length");
      return new Response(Bun.gzipSync(body, { level: 6 }), { status: res.status, headers: h });
    }
    return res;
  }

  const server = Bun.serve({
    hostname: cfg.host,
    port: cfg.port,
    idleTimeout: 60,
    maxRequestBodySize: 2 * 1024 * 1024,
    async fetch(request, srv) {
      // The reverse proxy (Traefik) appends the real client address as the last entry.
      const ip = request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || srv.requestIP(request)?.address || "unknown";
      clientIp.set(request, ip);
      const res = await web.handle(request);
      return finalize(request, res);
    },
  });

  setInterval(() => cleanupExpired(db), 6 * 3600_000);
  console.log(`[http] larp-kalender ${pkg.version} listening on http://${cfg.host}:${server.port}`);
  return server;
}
