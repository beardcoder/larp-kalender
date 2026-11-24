/** Helpers for route handlers: JSON responses, ETag caching, query filters. */

import type { z } from "zod";
import { getApp } from "./app.ts";
import { eventStats, today, type EventFilter } from "./events.ts";

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers });

const list = (v: string | null): string[] | undefined => (v?.trim() ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);

export function filterFromQuery(q: URLSearchParams): EventFilter {
  return {
    from: q.get("from") || undefined,
    to: q.get("to") || undefined,
    includePast: q.get("past") === "1" || q.get("past") === "true",
    genres: list(q.get("genre") ?? q.get("genres")),
    types: list(q.get("type") ?? q.get("types")),
    countries: list(q.get("country")),
    registration: list(q.get("registration")),
    ids: list(q.get("ids"))?.map(Number).filter(Number.isInteger),
    q: q.get("q") || undefined,
  };
}

/** Weak ETag over the event data version, the date and the query: feeds and API answer 304 when nothing changed. */
export function cached(request: Request, body: () => string | object, headers: Record<string, string>, extra = ""): Response {
  const s = eventStats(getApp().db);
  const raw = `${s.lastUpdate}|${s.total}|${today()}|${new URL(request.url).search}|${extra}`;
  const etag = `W/"${new Bun.CryptoHasher("sha1").update(raw).digest("hex").slice(0, 20)}"`;
  const h = { etag, "cache-control": "public, max-age=0, must-revalidate", ...headers };
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: h });
  const b = body();
  return new Response(typeof b === "string" ? b : JSON.stringify(b), { headers: h });
}

export const zodMessage = (err: z.ZodError) => err.issues.map((i) => `${i.path.join(".") || "Eingabe"}: ${i.message}`).join("; ");

/** Client address of a route handler request (last X-Forwarded-For entry, set by the proxy). */
export const ipOf = (request: Request) => request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "local";

/** Public base URL for a route handler request. */
export function baseOf(request: Request): string {
  const { publicUrl } = getApp().cfg;
  if (publicUrl) return publicUrl;
  const url = new URL(request.url);
  return `${request.headers.get("x-forwarded-proto") ?? url.protocol.slice(0, -1)}://${request.headers.get("x-forwarded-host") ?? url.host}`;
}
