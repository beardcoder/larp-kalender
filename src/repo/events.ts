/** Event persistence: validation schema, queries, duplicate detection. */

import type { Database } from "bun:sqlite";
import { z } from "zod";
import type { AdminLarpEvent, LarpEvent } from "../shared/types.ts";
import { EVENT_STATUS, EVENT_TYPES, GENRES, REGISTRATION_STATUS, keys } from "../shared/vocab.ts";
import { nowIso } from "../db.ts";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format YYYY-MM-DD");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Uhrzeit im Format HH:MM");
const url = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "Nur http(s)-Links");
const text = (max: number) => z.string().trim().max(max);

/** Coerces empty strings to null so that HTML forms and AI clients can clear fields. */
const nullable = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" ? null : v), schema.nullable().optional());

export const eventFields = {
  title: text(200).min(3).describe("Event name as published by the organizer."),
  summary: nullable(text(300)).describe("One or two sentence teaser in German."),
  description: nullable(text(10000)).describe("Longer description in German (plain text, line breaks allowed)."),
  startDate: date.describe("First day, YYYY-MM-DD."),
  endDate: nullable(date).describe("Last day, YYYY-MM-DD. Defaults to startDate."),
  startTime: nullable(time).describe("Start time HH:MM (local time Europe/Berlin), if known."),
  endTime: nullable(time).describe("End time HH:MM, if known."),
  genres: z.array(z.enum(keys(GENRES))).max(5).optional().describe(`Genres: ${Object.keys(GENRES).join(", ")}.`),
  eventType: z.enum(keys(EVENT_TYPES)).optional().describe(`Event type: ${Object.keys(EVENT_TYPES).join(", ")}.`),
  tags: z.array(text(40).min(1)).max(15).optional().describe("Free tags, e.g. 'Anfängerfreundlich', 'Zelten', 'Vollverpflegung'."),
  organizer: nullable(text(200)).describe("Organizing group or association."),
  venue: nullable(text(200)).describe("Name of the location, e.g. 'Burg Bilstein'."),
  street: nullable(text(200)),
  postalCode: nullable(text(12)),
  city: nullable(text(120)),
  region: nullable(text(120)).describe("State / Bundesland, e.g. 'Nordrhein-Westfalen'."),
  country: z
    .string()
    .trim()
    .length(2)
    .transform((c) => c.toUpperCase())
    .optional()
    .describe("ISO 3166-1 alpha-2 country code, default DE."),
  lat: nullable(z.number().min(-90).max(90)),
  lng: nullable(z.number().min(-180).max(180)),
  websiteUrl: nullable(url).describe("Official event website."),
  registrationUrl: nullable(url).describe("Direct link where players register / buy tickets. Most important field."),
  registrationOpens: nullable(date).describe("Date registration opens, if not yet open."),
  registrationDeadline: nullable(date).describe("Last day to register."),
  registrationStatus: z
    .enum(keys(REGISTRATION_STATUS))
    .optional()
    .describe(`Registration state: ${Object.keys(REGISTRATION_STATUS).join(", ")}.`),
  priceText: nullable(text(200)).describe("Human readable prices, e.g. 'SC 140 €, NSC 60 €'."),
  priceMin: nullable(z.number().min(0)).describe("Lowest price in EUR."),
  priceMax: nullable(z.number().min(0)).describe("Highest price in EUR."),
  minAge: nullable(z.number().int().min(0).max(99)).describe("Minimum age."),
  capacity: nullable(z.number().int().min(0)).describe("Maximum number of participants."),
  imageUrl: nullable(url).describe("Banner or logo image URL."),
  contactEmail: nullable(z.string().trim().email()),
  status: z.enum(keys(EVENT_STATUS)).optional().describe("published (default), draft or cancelled."),
  sourceUrl: nullable(url).describe("Where the information was found."),
  notesInternal: nullable(text(5000)).describe("Internal notes, never shown publicly."),
};

export const eventCreateSchema = z.object(eventFields);
export const eventUpdateSchema = z.object(eventFields).partial();
export type EventCreateInput = z.infer<typeof eventCreateSchema>;
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;

interface EventRow {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  description: string | null;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  genres: string;
  event_type: string;
  tags: string;
  organizer: string | null;
  venue: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  region: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
  website_url: string | null;
  registration_url: string | null;
  registration_opens: string | null;
  registration_deadline: string | null;
  registration_status: string;
  price_text: string | null;
  price_min: number | null;
  price_max: number | null;
  min_age: number | null;
  capacity: number | null;
  image_url: string | null;
  contact_email: string | null;
  status: string;
  source: string;
  source_url: string | null;
  notes_internal: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
  last_checked_at: string | null;
  announced_at: string | null;
  created_by_name?: string | null;
}

/** camelCase API field -> snake_case column. */
const COLUMN: Record<string, string> = {
  title: "title",
  summary: "summary",
  description: "description",
  startDate: "start_date",
  endDate: "end_date",
  startTime: "start_time",
  endTime: "end_time",
  genres: "genres",
  eventType: "event_type",
  tags: "tags",
  organizer: "organizer",
  venue: "venue",
  street: "street",
  postalCode: "postal_code",
  city: "city",
  region: "region",
  country: "country",
  lat: "lat",
  lng: "lng",
  websiteUrl: "website_url",
  registrationUrl: "registration_url",
  registrationOpens: "registration_opens",
  registrationDeadline: "registration_deadline",
  registrationStatus: "registration_status",
  priceText: "price_text",
  priceMin: "price_min",
  priceMax: "price_max",
  minAge: "min_age",
  capacity: "capacity",
  imageUrl: "image_url",
  contactEmail: "contact_email",
  status: "status",
  sourceUrl: "source_url",
  notesInternal: "notes_internal",
};

function toPublic(r: EventRow): LarpEvent {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    description: r.description,
    startDate: r.start_date,
    endDate: r.end_date,
    startTime: r.start_time,
    endTime: r.end_time,
    genres: JSON.parse(r.genres),
    eventType: r.event_type as LarpEvent["eventType"],
    tags: JSON.parse(r.tags),
    organizer: r.organizer,
    venue: r.venue,
    street: r.street,
    postalCode: r.postal_code,
    city: r.city,
    region: r.region,
    country: r.country,
    lat: r.lat,
    lng: r.lng,
    websiteUrl: r.website_url,
    registrationUrl: r.registration_url,
    registrationOpens: r.registration_opens,
    registrationDeadline: r.registration_deadline,
    registrationStatus: r.registration_status as LarpEvent["registrationStatus"],
    priceText: r.price_text,
    priceMin: r.price_min,
    priceMax: r.price_max,
    minAge: r.min_age,
    capacity: r.capacity,
    imageUrl: r.image_url,
    contactEmail: r.contact_email,
    status: r.status as LarpEvent["status"],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastCheckedAt: r.last_checked_at,
  };
}

function toAdmin(r: EventRow): AdminLarpEvent {
  return {
    ...toPublic(r),
    source: r.source,
    sourceUrl: r.source_url,
    notesInternal: r.notes_internal,
    createdBy: r.created_by,
    updatedBy: r.updated_by,
    createdByName: r.created_by_name ?? null,
  };
}

export function today(): string {
  // Calendar dates are interpreted in German local time.
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function uniqueSlug(db: Database, title: string, startDate: string, excludeId?: number): string {
  const year = startDate.slice(0, 4);
  let base = slugify(title) || "veranstaltung";
  if (!base.includes(year)) base = `${base}-${year}`;
  let slug = base;
  for (let i = 2; ; i++) {
    const hit = db.query("SELECT id FROM events WHERE slug = ?").get(slug) as { id: number } | null;
    if (!hit || hit.id === excludeId) return slug;
    slug = `${base}-${i}`;
  }
}

export interface EventFilter {
  /** Only events ending on/after this date. Defaults to today unless includePast. */
  from?: string;
  /** Only events starting on/before this date. */
  to?: string;
  includePast?: boolean;
  statuses?: string[];
  genres?: string[];
  types?: string[];
  countries?: string[];
  registration?: string[];
  q?: string;
  ids?: number[];
  updatedSince?: string;
  limit?: number;
  offset?: number;
  order?: "asc" | "desc";
}

function buildWhere(f: EventFilter): { sql: string; params: (string | number)[] } {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const inList = (col: string, values: (string | number)[]) => {
    where.push(`${col} IN (${values.map(() => "?").join(",")})`);
    params.push(...values);
  };
  const from = f.from ?? (f.includePast ? undefined : today());
  if (from) {
    where.push("e.end_date >= ?");
    params.push(from);
  }
  if (f.to) {
    where.push("e.start_date <= ?");
    params.push(f.to);
  }
  if (f.statuses?.length) inList("e.status", f.statuses);
  if (f.types?.length) inList("e.event_type", f.types);
  if (f.countries?.length) inList("e.country", f.countries);
  if (f.registration?.length) inList("e.registration_status", f.registration);
  if (f.ids?.length) inList("e.id", f.ids);
  if (f.genres?.length) {
    where.push(`EXISTS (SELECT 1 FROM json_each(e.genres) g WHERE g.value IN (${f.genres.map(() => "?").join(",")}))`);
    params.push(...f.genres);
  }
  if (f.updatedSince) {
    where.push("e.updated_at >= ?");
    params.push(f.updatedSince);
  }
  if (f.q?.trim()) {
    for (const term of f.q.trim().split(/\s+/).slice(0, 6)) {
      where.push(
        "(e.title LIKE ? OR e.summary LIKE ? OR e.organizer LIKE ? OR e.city LIKE ? OR e.venue LIKE ? OR e.region LIKE ? OR e.tags LIKE ?)",
      );
      const like = `%${term.replace(/[%_]/g, "")}%`;
      params.push(like, like, like, like, like, like, like);
    }
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

const SELECT = `SELECT e.*, u.name AS created_by_name FROM events e LEFT JOIN users u ON u.id = e.created_by`;

function queryRows(db: Database, f: EventFilter): EventRow[] {
  const { sql, params } = buildWhere(f);
  const order = f.order === "desc" ? "DESC" : "ASC";
  const limit = Math.min(Math.max(f.limit ?? 1000, 1), 5000);
  return db
    .query(`${SELECT} ${sql} ORDER BY e.start_date ${order}, e.start_time ${order}, e.title LIMIT ? OFFSET ?`)
    .all(...params, limit, f.offset ?? 0) as EventRow[];
}

export function countEvents(db: Database, f: EventFilter): number {
  const { sql, params } = buildWhere(f);
  return (db.query(`SELECT COUNT(*) AS n FROM events e ${sql}`).get(...params) as { n: number }).n;
}

export const listPublicEvents = (db: Database, f: EventFilter): LarpEvent[] =>
  queryRows(db, { ...f, statuses: f.statuses?.length ? f.statuses : ["published", "cancelled"] }).map(toPublic);

export const listAdminEvents = (db: Database, f: EventFilter): AdminLarpEvent[] => queryRows(db, f).map(toAdmin);

export function getEvent(db: Database, idOrSlug: number | string): AdminLarpEvent | null {
  const isId = typeof idOrSlug === "number" || /^\d+$/.test(idOrSlug);
  const row = db
    .query(`${SELECT} WHERE ${isId ? "e.id" : "e.slug"} = ?`)
    .get(isId ? Number(idOrSlug) : idOrSlug) as EventRow | null;
  return row ? toAdmin(row) : null;
}

export function toPublicEvent(e: AdminLarpEvent): LarpEvent {
  const { source: _s, sourceUrl: _su, notesInternal: _n, createdBy: _cb, updatedBy: _ub, createdByName: _cbn, ...pub } = e;
  return pub;
}

function serialize(key: string, value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (key === "genres" || key === "tags") return JSON.stringify([...new Set(value as string[])]);
  return value as string | number;
}

export class EventValidationError extends Error {}

function checkDates(startDate: string, endDate: string | null | undefined): void {
  if (endDate && endDate < startDate) throw new EventValidationError("endDate liegt vor startDate.");
  if (Number.isNaN(Date.parse(startDate))) throw new EventValidationError("startDate ist kein gültiges Datum.");
}

export function createEvent(
  db: Database,
  input: EventCreateInput,
  opts: { userId: number | null; source: "manual" | "mcp" | "api" | "suggestion" },
): AdminLarpEvent {
  checkDates(input.startDate, input.endDate);
  const now = nowIso();
  const values: Record<string, string | number | null> = {
    slug: uniqueSlug(db, input.title, input.startDate),
    end_date: input.endDate ?? input.startDate,
    genres: "[]",
    tags: "[]",
    event_type: "con",
    country: "DE",
    registration_status: input.registrationUrl ? "open" : "unknown",
    status: "published",
    source: opts.source,
    created_by: opts.userId,
    updated_by: opts.userId,
    created_at: now,
    updated_at: now,
    last_checked_at: opts.source === "mcp" ? now : null,
  };
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || !COLUMN[key]) continue;
    if (key === "endDate" && !value) continue;
    values[COLUMN[key]] = serialize(key, value);
  }
  const cols = Object.keys(values);
  const result = db
    .query(`INSERT INTO events (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`)
    .run(...cols.map((c) => values[c]!));
  return getEvent(db, Number(result.lastInsertRowid))!;
}

export function updateEvent(
  db: Database,
  id: number,
  patch: EventUpdateInput,
  opts: { userId: number | null; checked?: boolean },
): AdminLarpEvent | null {
  const current = getEvent(db, id);
  if (!current) return null;
  const startDate = patch.startDate ?? current.startDate;
  let endDate = patch.endDate === null ? startDate : (patch.endDate ?? current.endDate);
  if (endDate < startDate && patch.startDate && !patch.endDate) endDate = startDate;
  checkDates(startDate, endDate);

  const values: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || !COLUMN[key]) continue;
    values[COLUMN[key]] = serialize(key, value);
  }
  values.end_date = endDate;
  if (patch.title && patch.title !== current.title) values.slug = uniqueSlug(db, patch.title, startDate, id);
  // An event that becomes public again should be announced to push subscribers.
  if (patch.status === "published" && current.status === "draft") values.announced_at = null;
  values.updated_by = opts.userId;
  values.updated_at = nowIso();
  if (opts.checked) values.last_checked_at = values.updated_at;

  const cols = Object.keys(values);
  db.query(`UPDATE events SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`).run(
    ...cols.map((c) => values[c]!),
    id,
  );
  return getEvent(db, id);
}

export function deleteEvent(db: Database, id: number): boolean {
  return db.query("DELETE FROM events WHERE id = ?").run(id).changes > 0;
}

/* ---------- duplicate detection ---------- */

export function normalizeUrl(u: string | null | undefined): string | null {
  if (!u) return null;
  try {
    const parsed = new URL(u);
    for (const p of [...parsed.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/.test(p)) parsed.searchParams.delete(p);
    const path = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.hostname.replace(/^www\./, "")}${path}${parsed.search}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

const STOP = new Set(["der", "die", "das", "und", "the", "of", "a", "an", "ein", "eine", "larp", "con", "teil", "part"]);

function titleTokens(title: string): Set<string> {
  return new Set(
    slugify(title)
      .split("-")
      .filter((t) => t.length > 1 && !STOP.has(t) && !/^\d{4}$/.test(t)),
  );
}

function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
}

export interface DuplicateCandidate {
  event: AdminLarpEvent;
  reason: string;
}

/**
 * Finds existing events that probably describe the same happening: same registration/website URL with
 * overlapping dates, or a very similar title within a week.
 */
export function findDuplicates(
  db: Database,
  input: { title: string; startDate: string; endDate?: string | null; registrationUrl?: string | null; websiteUrl?: string | null },
  excludeId?: number,
): DuplicateCandidate[] {
  const from = addDays(input.startDate, -10);
  const to = addDays(input.endDate || input.startDate, 10);
  const nearby = listAdminEvents(db, { from, to, limit: 500 });
  const tokens = titleTokens(input.title);
  const urls = [normalizeUrl(input.registrationUrl), normalizeUrl(input.websiteUrl)].filter(Boolean);
  const result: DuplicateCandidate[] = [];
  for (const e of nearby) {
    if (e.id === excludeId) continue;
    const eUrls = [normalizeUrl(e.registrationUrl), normalizeUrl(e.websiteUrl)].filter(Boolean);
    const dayDiff = Math.abs(Date.parse(e.startDate) - Date.parse(input.startDate)) / 86_400_000;
    const sim = similarity(tokens, titleTokens(e.title));
    if (urls.some((u) => eUrls.includes(u)) && dayDiff <= 3) result.push({ event: e, reason: "gleicher Link" });
    else if (sim >= 0.75 && dayDiff <= 7) result.push({ event: e, reason: `ähnlicher Titel (${Math.round(sim * 100)} %)` });
    else if (e.startDate === input.startDate && sim >= 0.5) result.push({ event: e, reason: "gleiches Datum, ähnlicher Titel" });
  }
  return result;
}

export function eventStats(db: Database) {
  const t = today();
  const one = (sql: string, ...p: string[]) => (db.query(sql).get(...p) as { n: number }).n;
  return {
    upcoming: one("SELECT COUNT(*) n FROM events WHERE status = 'published' AND end_date >= ?", t),
    openRegistration: one(
      "SELECT COUNT(*) n FROM events WHERE status = 'published' AND end_date >= ? AND registration_status = 'open'",
      t,
    ),
    drafts: one("SELECT COUNT(*) n FROM events WHERE status = 'draft'"),
    past: one("SELECT COUNT(*) n FROM events WHERE end_date < ?", t),
    total: one("SELECT COUNT(*) n FROM events"),
    lastUpdate: (db.query("SELECT MAX(updated_at) m FROM events").get() as { m: string | null }).m,
  };
}
