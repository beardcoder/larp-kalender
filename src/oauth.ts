/**
 * Minimal OAuth 2.1 authorization server for MCP clients (claude.ai, ChatGPT connectors):
 * RFC 8414 metadata, RFC 9728 protected resource metadata, RFC 7591 dynamic client registration,
 * authorization code flow with mandatory PKCE (S256) and refresh tokens.
 */

import type { Database } from "bun:sqlite";
import { nowIso } from "./db.ts";
import { escapeHtml } from "./html.ts";
import { createSession, randomToken, sessionUser, sha256, verifyLogin } from "./repo/users.ts";
import type { User } from "./shared/types.ts";

const ACCESS_TTL_S = 7 * 86_400;
const REFRESH_TTL_S = 365 * 86_400;
const CODE_TTL_S = 300;
export const SCOPE = "events";

interface ClientRow {
  client_id: string;
  name: string;
  redirect_uris: string;
  secret_hash: string | null;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...headers },
  });

const redirectTo = (location: string) => new Response(null, { status: 302, headers: { location, "cache-control": "no-store" } });

const oauthError = (error: string, description: string, status = 400) =>
  json({ error, error_description: description }, status);

export function protectedResourceMetadata(base: string) {
  return {
    resource: `${base}/mcp`,
    authorization_servers: [base],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "LARP-Kalender",
  };
}

export function authorizationServerMetadata(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    scopes_supported: [SCOPE],
  };
}

export function wwwAuthenticate(base: string): string {
  return `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp", scope="${SCOPE}"`;
}

function validRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    // Native apps may use private-use URI schemes (e.g. claude://, cursor://).
    return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !["javascript:", "data:", "file:"].includes(u.protocol);
  } catch {
    return false;
  }
}

export async function handleRegister(db: Database, request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return oauthError("invalid_client_metadata", "Request body must be JSON.");
  }
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u) => typeof u === "string") : [];
  if (!redirectUris.length || !redirectUris.every(validRedirectUri))
    return oauthError("invalid_redirect_uri", "redirect_uris must be https (or http on localhost).");
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 100) : "MCP-Client";
  const authMethod = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  const clientId = randomToken("mcp_", 16);
  let clientSecret: string | undefined;
  if (authMethod === "client_secret_post" || authMethod === "client_secret_basic") clientSecret = randomToken("", 32);
  db.query("INSERT INTO oauth_clients (client_id, name, redirect_uris, secret_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
    clientId,
    name,
    JSON.stringify(redirectUris),
    clientSecret ? sha256(clientSecret) : null,
    nowIso(),
  );
  return json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
      client_name: name,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: clientSecret ? authMethod : "none",
      scope: SCOPE,
    },
    201,
  );
}

const getClient = (db: Database, clientId: string) =>
  db.query("SELECT * FROM oauth_clients WHERE client_id = ?").get(clientId) as ClientRow | null;

interface AuthorizeParams {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  state: string;
  scope: string;
  resource: string;
  response_type: string;
}

function readParams(source: URLSearchParams | FormData): AuthorizeParams {
  const g = (k: string) => {
    const v = source.get(k);
    return typeof v === "string" ? v : "";
  };
  return {
    client_id: g("client_id"),
    redirect_uri: g("redirect_uri"),
    code_challenge: g("code_challenge"),
    code_challenge_method: g("code_challenge_method") || "S256",
    state: g("state"),
    scope: g("scope"),
    resource: g("resource"),
    response_type: g("response_type"),
  };
}

/** Validates the request; returns an error page/redirect or the client. */
function checkAuthorize(db: Database, p: AuthorizeParams): { client: ClientRow } | { error: Response } {
  const client = p.client_id ? getClient(db, p.client_id) : null;
  if (!client) return { error: page("Unbekannte Anwendung", "<p>Diese Anwendung ist nicht registriert. Verbinde sie bitte neu.</p>", 400) };
  if (!JSON.parse(client.redirect_uris).includes(p.redirect_uri))
    return { error: page("Ungültige Weiterleitung", "<p>Die Weiterleitungsadresse passt nicht zur Anwendung.</p>", 400) };
  const fail = (error: string, desc: string) => {
    const u = new URL(p.redirect_uri);
    u.searchParams.set("error", error);
    u.searchParams.set("error_description", desc);
    if (p.state) u.searchParams.set("state", p.state);
    return { error: redirectTo(u.toString()) };
  };
  if (p.response_type !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.");
  if (!p.code_challenge || p.code_challenge_method !== "S256") return fail("invalid_request", "PKCE with S256 is required.");
  return { client };
}

export function handleAuthorizeGet(db: Database, request: Request, sessionToken: string | undefined): Response {
  const p = readParams(new URL(request.url).searchParams);
  const check = checkAuthorize(db, p);
  if ("error" in check) return check.error;
  return consentPage(check.client, p, sessionUser(db, sessionToken));
}

export async function handleAuthorizePost(
  db: Database,
  request: Request,
  sessionToken: string | undefined,
  setSession: (token: string) => void,
): Promise<Response> {
  const form = await request.formData();
  const p = readParams(form);
  const check = checkAuthorize(db, p);
  if ("error" in check) return check.error;
  const redirect = new URL(p.redirect_uri);
  if (p.state) redirect.searchParams.set("state", p.state);

  if (form.get("action") === "deny") {
    redirect.searchParams.set("error", "access_denied");
    return redirectTo(redirect.toString());
  }

  let user = sessionUser(db, sessionToken);
  if (!user) {
    user = await verifyLogin(db, String(form.get("email") ?? ""), String(form.get("password") ?? ""));
    if (!user) return consentPage(check.client, p, null, "E-Mail oder Passwort ist falsch.");
    setSession(createSession(db, user.id));
  }

  const code = randomToken("", 32);
  db.query(
    `INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    sha256(code),
    p.client_id,
    user.id,
    p.redirect_uri,
    p.code_challenge,
    SCOPE,
    p.resource || null,
    new Date(Date.now() + CODE_TTL_S * 1000).toISOString(),
  );
  redirect.searchParams.set("code", code);
  return redirectTo(redirect.toString());
}

function issueTokens(db: Database, clientId: string, userId: number, refreshToken?: string) {
  const access = randomToken("lka_", 32);
  const now = Date.now();
  db.query(
    "INSERT INTO oauth_tokens (token_hash, kind, client_id, user_id, scope, created_at, expires_at) VALUES (?, 'access', ?, ?, ?, ?, ?)",
  ).run(sha256(access), clientId, userId, SCOPE, nowIso(), new Date(now + ACCESS_TTL_S * 1000).toISOString());
  let refresh = refreshToken;
  if (!refresh) {
    refresh = randomToken("lkr_", 32);
    db.query(
      "INSERT INTO oauth_tokens (token_hash, kind, client_id, user_id, scope, created_at, expires_at) VALUES (?, 'refresh', ?, ?, ?, ?, ?)",
    ).run(sha256(refresh), clientId, userId, SCOPE, nowIso(), new Date(now + REFRESH_TTL_S * 1000).toISOString());
  } else {
    // Sliding expiry: scheduled jobs that refresh regularly never lose access.
    db.query("UPDATE oauth_tokens SET expires_at = ?, last_used_at = ? WHERE token_hash = ?").run(
      new Date(now + REFRESH_TTL_S * 1000).toISOString(),
      nowIso(),
      sha256(refresh),
    );
  }
  return json({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: SCOPE });
}

async function readTokenRequest(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  const out: Record<string, string> = {};
  if (type.includes("application/json")) {
    for (const [k, v] of Object.entries((await request.json()) as Record<string, unknown>)) out[k] = String(v);
  } else {
    for (const [k, v] of new URLSearchParams(await request.text())) out[k] = v;
  }
  const basic = request.headers.get("authorization");
  if (basic?.startsWith("Basic ")) {
    const [id, secret] = Buffer.from(basic.slice(6), "base64").toString().split(":");
    if (id) out.client_id ??= decodeURIComponent(id);
    if (secret) out.client_secret ??= decodeURIComponent(secret);
  }
  return out;
}

function pkceS256(verifier: string): string {
  return new Bun.CryptoHasher("sha256").update(verifier).digest("base64url");
}

export async function handleToken(db: Database, request: Request): Promise<Response> {
  let body: Record<string, string>;
  try {
    body = await readTokenRequest(request);
  } catch {
    return oauthError("invalid_request", "Malformed request body.");
  }
  const client = body.client_id ? getClient(db, body.client_id) : null;
  if (!client) return oauthError("invalid_client", "Unknown client.", 401);
  if (client.secret_hash && sha256(body.client_secret ?? "") !== client.secret_hash)
    return oauthError("invalid_client", "Invalid client secret.", 401);

  if (body.grant_type === "authorization_code") {
    const row = db
      .query("SELECT * FROM oauth_codes WHERE code_hash = ? AND client_id = ? AND expires_at > ?")
      .get(sha256(body.code ?? ""), client.client_id, nowIso()) as
      | { user_id: number; redirect_uri: string; code_challenge: string }
      | null;
    db.query("DELETE FROM oauth_codes WHERE code_hash = ?").run(sha256(body.code ?? ""));
    if (!row) return oauthError("invalid_grant", "Authorization code is invalid or expired.");
    if (body.redirect_uri && body.redirect_uri !== row.redirect_uri) return oauthError("invalid_grant", "redirect_uri mismatch.");
    if (!body.code_verifier || pkceS256(body.code_verifier) !== row.code_challenge)
      return oauthError("invalid_grant", "PKCE verification failed.");
    return issueTokens(db, client.client_id, row.user_id);
  }

  if (body.grant_type === "refresh_token") {
    const row = db
      .query(
        `SELECT t.user_id FROM oauth_tokens t JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.kind = 'refresh' AND t.client_id = ? AND t.expires_at > ? AND u.disabled = 0`,
      )
      .get(sha256(body.refresh_token ?? ""), client.client_id, nowIso()) as { user_id: number } | null;
    if (!row) return oauthError("invalid_grant", "Refresh token is invalid or expired.");
    return issueTokens(db, client.client_id, row.user_id, body.refresh_token);
  }

  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

export async function handleRevoke(db: Database, request: Request): Promise<Response> {
  const body = await readTokenRequest(request).catch(() => ({}) as Record<string, string>);
  if (body.token) db.query("DELETE FROM oauth_tokens WHERE token_hash = ?").run(sha256(body.token));
  return new Response(null, { status: 200 });
}

/** OAuth connections of a user, for the admin backend. */
export function listConnections(db: Database, userId: number) {
  return db
    .query(
      `SELECT c.client_id AS clientId, c.name, MIN(t.created_at) AS createdAt, MAX(t.last_used_at) AS lastUsedAt
       FROM oauth_tokens t JOIN oauth_clients c ON c.client_id = t.client_id
       WHERE t.user_id = ? GROUP BY c.client_id ORDER BY lastUsedAt DESC`,
    )
    .all(userId) as { clientId: string; name: string; createdAt: string; lastUsedAt: string | null }[];
}

export function revokeConnection(db: Database, userId: number, clientId: string): void {
  db.query("DELETE FROM oauth_tokens WHERE user_id = ? AND client_id = ?").run(userId, clientId);
}

/* ---------- consent page ---------- */

function consentPage(client: ClientRow, p: AuthorizeParams, user: User | null, error?: string): Response {
  const hidden = Object.entries(p)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v)}">`)
    .join("");
  const host = (() => {
    try {
      return new URL(p.redirect_uri).host;
    } catch {
      return p.redirect_uri;
    }
  })();
  const login = user
    ? `<p class="who">Angemeldet als <strong>${escapeHtml(user.name)}</strong> (${escapeHtml(user.email)})</p>`
    : `<label>E-Mail<input name="email" type="email" autocomplete="username" required autofocus></label>
       <label>Passwort<input name="password" type="password" autocomplete="current-password" required></label>`;
  const body = `
    <p><strong>${escapeHtml(client.name)}</strong> möchte auf den LARP-Kalender zugreifen und darf dann in deinem Namen
    Veranstaltungen lesen, eintragen und bearbeiten.</p>
    <p class="muted">Weiterleitung an ${escapeHtml(host)}</p>
    ${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ""}
    <form method="post" action="/oauth/authorize">
      ${hidden}
      ${login}
      <div class="actions">
        <button type="submit" name="action" value="allow" class="primary">Zugriff erlauben</button>
        <button type="submit" name="action" value="deny" formnovalidate>Ablehnen</button>
      </div>
    </form>`;
  return page("Zugriff erlauben", body, error ? 401 : 200);
}

export function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${escapeHtml(title)} · LARP-Kalender</title>
<style>
:root{color-scheme:dark;--bg:#0f1a16;--panel:#17251f;--ink:#e8e4d6;--muted:#9fa99f;--wax:#b8293d;--line:#2b3b33}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);
font:16px/1.5 system-ui,sans-serif;padding:16px}main{width:100%;max-width:420px;background:var(--panel);border:1px solid var(--line);
border-radius:18px;padding:28px}h1{font:600 1.6rem/1.2 Georgia,serif;margin:0 0 16px}label{display:grid;gap:6px;margin:14px 0;font-size:.9rem;color:var(--muted)}
input{font:inherit;padding:12px;border-radius:10px;border:1px solid var(--line);background:var(--bg);color:var(--ink)}
input:focus-visible,button:focus-visible{outline:2px solid #d9b45a;outline-offset:2px}
.actions{display:flex;gap:10px;margin-top:20px}button{font:inherit;font-weight:600;padding:12px 18px;border-radius:999px;border:1px solid var(--line);
background:transparent;color:var(--ink);cursor:pointer}button.primary{background:var(--wax);border-color:var(--wax);color:#fff;flex:1}
.muted,.who{color:var(--muted);font-size:.9rem}.error{color:#ff9aa6}
</style></head><body><main><h1>${escapeHtml(title)}</h1>${body}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "frame-ancestors 'none'" },
  });
}
