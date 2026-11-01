/** MCP server: tools for AI assistants (Claude, ChatGPT) to research, add and maintain LARP events. */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { eventFields, eventStats, findDuplicates, listAdminEvents, today, type EventCreateInput } from "./repo/events.ts";
import type { App } from "./service.ts";
import type { AdminLarpEvent, User } from "./shared/types.ts";
import { EVENT_STATUS, EVENT_TYPES, GENRES, REGISTRATION_STATUS, keys } from "./shared/vocab.ts";
import pkg from "../package.json" with { type: "json" };

const vocab = (o: Record<string, string>) =>
  Object.entries(o)
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");

const INSTRUCTIONS = `LARP-Kalender: a curated calendar of LARP (live action role-playing) events, mainly in Germany and
neighbouring countries. Players use it to find events and register, so every entry should carry a working
registration link (registrationUrl).

Workflow for adding events (e.g. a scheduled research run):
1. Call list_events for the relevant date range to see what is already in the calendar.
2. Research events on organizer websites, larpkalender/larp-portal sites, social media.
3. For each event call create_event. It refuses likely duplicates and returns the existing entry instead;
   then call update_event on that id if something changed (registration status, dates, prices, link). Use
   create_events to add several events in one call.
4. Write title as published, summary/description in German, dates as YYYY-MM-DD. Never invent data: leave
   unknown fields empty. Always set sourceUrl to the page you used.

Vocabularies:
- genres: ${vocab(GENRES)}
- eventType: ${vocab(EVENT_TYPES)}
- registrationStatus: ${vocab(REGISTRATION_STATUS)}
- status: ${vocab(EVENT_STATUS)}`;

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const error = (t: string) => ({ content: [{ type: "text" as const, text: t }], isError: true });

function line(e: AdminLarpEvent): string {
  const date = e.startDate === e.endDate ? e.startDate : `${e.startDate}..${e.endDate}`;
  const place = [e.city, e.country !== "DE" ? e.country : ""].filter(Boolean).join(", ");
  return `#${e.id} | ${date} | ${e.title} | ${place || "-"} | ${e.registrationStatus}${e.status !== "published" ? ` | ${e.status}` : ""} | ${e.registrationUrl ?? "no registration link"}`;
}

/** Full event view for the assistant, without empty fields. */
function details(e: AdminLarpEvent, base: string): string {
  const clean = Object.fromEntries(
    Object.entries({ ...e, publicUrl: `${base}/termin/${e.slug}` }).filter(
      ([, v]) => v !== null && v !== "" && !(Array.isArray(v) && !v.length),
    ),
  );
  return JSON.stringify(clean, null, 2);
}

export function createMcpServer(app: App, user: User, base: string): McpServer {
  const server = new McpServer({ name: "larp-kalender", version: pkg.version }, { instructions: INSTRUCTIONS });
  const db = app.db;

  server.registerTool(
    "list_events",
    {
      title: "List events",
      description:
        "List events in the calendar as compact lines '#id | dates | title | city | registrationStatus | registrationUrl'. " +
        "Use it before adding events to know what already exists. Defaults: upcoming events, all statuses.",
      inputSchema: {
        from: z.string().optional().describe("Only events ending on/after this date (YYYY-MM-DD). Default: today."),
        to: z.string().optional().describe("Only events starting on/before this date (YYYY-MM-DD)."),
        query: z.string().optional().describe("Text search in title, summary, organizer, city, venue, tags."),
        genres: z.array(z.enum(keys(GENRES))).optional(),
        status: z.enum(["published", "draft", "cancelled", "all"]).optional().describe("Default: all."),
        include_past: z.boolean().optional().describe("Include events that already ended."),
        limit: z.number().int().min(1).max(1000).optional().describe("Default 300."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ from, to, query, genres, status, include_past, limit }) => {
      const events = listAdminEvents(db, {
        from: include_past ? from : (from ?? today()),
        to,
        q: query,
        genres,
        includePast: include_past,
        statuses: status && status !== "all" ? [status] : undefined,
        limit: limit ?? 300,
      });
      if (!events.length) return text("No matching events.");
      return text(`${events.length} event(s):\n${events.map(line).join("\n")}`);
    },
  );

  server.registerTool(
    "get_event",
    {
      title: "Get event",
      description: "Full details of one event by numeric id or slug.",
      inputSchema: { id: z.union([z.number().int(), z.string()]).describe("Event id or slug.") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const e = app.getEvent(id);
      return e ? text(details(e, base)) : error(`Event ${id} not found.`);
    },
  );

  server.registerTool(
    "find_duplicates",
    {
      title: "Find duplicates",
      description: "Check whether an event is already in the calendar (matching link or similar title within a week).",
      inputSchema: {
        title: z.string().min(2),
        startDate: z.string().describe("YYYY-MM-DD"),
        endDate: z.string().optional(),
        registrationUrl: z.string().optional(),
        websiteUrl: z.string().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      const hits = findDuplicates(db, input);
      return text(hits.length ? hits.map((h) => `${line(h.event)}  (${h.reason})`).join("\n") : "No duplicates found.");
    },
  );

  const createSchema = {
    ...eventFields,
    allowDuplicate: z
      .boolean()
      .optional()
      .describe("Create even if a similar event exists (only for genuinely different events, e.g. a second run)."),
  };

  const createOne = (input: EventCreateInput & { allowDuplicate?: boolean }) => {
    const { allowDuplicate, ...data } = input;
    return app.createEvent(data, user, "mcp", allowDuplicate);
  };

  server.registerTool(
    "create_event",
    {
      title: "Create event",
      description:
        "Add an event to the calendar. Required: title, startDate. Strongly recommended: registrationUrl, " +
        "registrationStatus, city, genres, eventType, summary, sourceUrl. Refuses likely duplicates and returns them.",
      inputSchema: createSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (input) => {
      try {
        const result = createOne(input);
        if (!result.created)
          return text(
            `Not created – the event seems to exist already:\n${result.duplicates.map((d) => `${line(d.event)}  (${d.reason})`).join("\n")}\n` +
              "Use update_event with that id to change it, or pass allowDuplicate=true if it is really a different event.",
          );
        return text(`Created #${result.event.id}: ${base}/termin/${result.event.slug}\n${line(result.event)}`);
      } catch (e) {
        return error(`Could not create event: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "create_events",
    {
      title: "Create several events",
      description: "Add up to 25 events in one call. Each one is checked for duplicates like create_event.",
      inputSchema: { events: z.array(z.object(createSchema)).min(1).max(25) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ events }) => {
      const out: string[] = [];
      for (const input of events) {
        try {
          const result = createOne(input);
          out.push(
            result.created
              ? `CREATED ${line(result.event)}`
              : `SKIPPED "${input.title}" – exists: ${result.duplicates.map((d) => `#${d.event.id} (${d.reason})`).join(", ")}`,
          );
        } catch (e) {
          out.push(`ERROR "${input.title}": ${(e as Error).message}`);
        }
      }
      return text(out.join("\n"));
    },
  );

  server.registerTool(
    "update_event",
    {
      title: "Update event",
      description:
        "Change fields of an existing event. Only pass the fields to change; pass null to clear a field. " +
        "Marks the event as checked today. Use status='cancelled' for cancelled events instead of deleting them.",
      inputSchema: { id: z.number().int().describe("Event id."), ...Object.fromEntries(Object.entries(eventFields).map(([k, v]) => [k, v.optional()])) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ id, ...patch }) => {
      try {
        const e = app.updateEvent(id as number, patch as never, user, true);
        return e ? text(`Updated ${line(e)}`) : error(`Event ${id} not found.`);
      } catch (e) {
        return error(`Could not update event: ${(e as Error).message}`);
      }
    },
  );

  server.registerTool(
    "delete_event",
    {
      title: "Delete event",
      description: "Permanently delete an event (e.g. spam or a duplicate). For cancelled events use update_event with status='cancelled'.",
      inputSchema: { id: z.number().int() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ id }) => (app.deleteEvent(id) ? text(`Deleted #${id}.`) : error(`Event ${id} not found.`)),
  );

  server.registerTool(
    "calendar_info",
    {
      title: "Calendar info",
      description: "Statistics, vocabularies and public links (website, iCal subscription, CSV export).",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      text(
        JSON.stringify(
          {
            stats: eventStats(db),
            today: today(),
            links: { website: base, ical: `${base}/kalender.ics`, csv: `${base}/veranstaltungen.csv`, rss: `${base}/feed.xml` },
            genres: GENRES,
            eventTypes: EVENT_TYPES,
            registrationStatus: REGISTRATION_STATUS,
            connectedAs: user.name,
          },
          null,
          2,
        ),
      ),
  );

  // ChatGPT deep research / company knowledge compatibility: generic search + fetch tools.
  server.registerTool(
    "search",
    {
      title: "Search events",
      description: "Search the LARP calendar. Returns ids for the fetch tool.",
      inputSchema: { query: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query }) => {
      const events = listAdminEvents(db, { q: query, statuses: ["published", "cancelled"], limit: 20 });
      const results = events.map((e) => ({ id: String(e.id), title: `${e.title} (${e.startDate})`, url: `${base}/termin/${e.slug}` }));
      return text(JSON.stringify({ results }));
    },
  );

  server.registerTool(
    "fetch",
    {
      title: "Fetch event",
      description: "Fetch a full event by id from search results.",
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ id }) => {
      const e = app.getEvent(id);
      if (!e) return error(`Event ${id} not found.`);
      return text(
        JSON.stringify({
          id: String(e.id),
          title: e.title,
          text: details(e, base),
          url: `${base}/termin/${e.slug}`,
          metadata: { startDate: e.startDate, endDate: e.endDate, registrationUrl: e.registrationUrl ?? "" },
        }),
      );
    },
  );

  return server;
}
