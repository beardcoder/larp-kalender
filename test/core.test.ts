import { describe, expect, test } from "bun:test";
import { loadConfig } from "../src/config.ts";
import { openDb } from "../src/db.ts";
import { renderCsv, renderIcs } from "../src/feeds.ts";
import { createEvent, eventCreateSchema, findDuplicates, listPublicEvents, today, addDays, updateEvent } from "../src/repo/events.ts";
import { startServer } from "../src/server.ts";
import { App } from "../src/service.ts";
import { createApiToken, createUser } from "../src/repo/users.ts";

const fresh = () => openDb(":memory:");

describe("events", () => {
  test("creates with defaults and unique slugs", () => {
    const db = fresh();
    const a = createEvent(db, { title: "Drachenfest", startDate: "2027-07-28" }, { userId: null, source: "manual" });
    const b = createEvent(db, { title: "Drachenfest", startDate: "2027-07-28" }, { userId: null, source: "manual" });
    expect(a.slug).toBe("drachenfest-2027");
    expect(b.slug).toBe("drachenfest-2027-2");
    expect(a.endDate).toBe("2027-07-28");
    expect(a.registrationStatus).toBe("unknown");
  });

  test("rejects end before start", () => {
    const db = fresh();
    expect(() => createEvent(db, { title: "Falsch", startDate: "2027-07-28", endDate: "2027-07-20" }, { userId: null, source: "manual" })).toThrow();
  });

  test("schema coerces empty strings to null", () => {
    const parsed = eventCreateSchema.parse({ title: "Test-Con", startDate: "2027-01-01", websiteUrl: "" });
    expect(parsed.websiteUrl).toBeNull();
  });

  test("finds duplicates by link and by similar title", () => {
    const db = fresh();
    createEvent(db, { title: "Conquest of Mythodea 2027", startDate: "2027-08-04", endDate: "2027-08-08", registrationUrl: "https://www.example.org/conquest/" }, { userId: null, source: "manual" });
    expect(findDuplicates(db, { title: "Irgendwas", startDate: "2027-08-05", registrationUrl: "https://example.org/conquest?utm_source=x" })).toHaveLength(1);
    expect(findDuplicates(db, { title: "Conquest of Mythodea", startDate: "2027-08-03" })).toHaveLength(1);
    expect(findDuplicates(db, { title: "Völlig anderes Treffen", startDate: "2027-08-04" })).toHaveLength(0);
  });

  test("filters by genre and hides drafts publicly", () => {
    const db = fresh();
    const start = addDays(today(), 5);
    createEvent(db, { title: "Fantasy-Con", startDate: start, genres: ["fantasy"] }, { userId: null, source: "manual" });
    createEvent(db, { title: "Endzeit-Con", startDate: start, genres: ["endzeit"] }, { userId: null, source: "manual" });
    createEvent(db, { title: "Geheim", startDate: start, status: "draft" }, { userId: null, source: "suggestion" });
    expect(listPublicEvents(db, {}).map((e) => e.title).sort()).toEqual(["Endzeit-Con", "Fantasy-Con"]);
    expect(listPublicEvents(db, { genres: ["endzeit"] }).map((e) => e.title)).toEqual(["Endzeit-Con"]);
  });

  test("update keeps end date consistent", () => {
    const db = fresh();
    const e = createEvent(db, { title: "Verschoben", startDate: "2027-05-01" }, { userId: null, source: "manual" });
    const u = updateEvent(db, e.id, { startDate: "2027-05-10" }, { userId: null });
    expect(u?.endDate).toBe("2027-05-10");
  });
});

describe("feeds", () => {
  const db = fresh();
  const e = createEvent(
    db,
    { title: "Lange Nacht, mit Komma; und Semikolon – sehr langer Titel für das Falten von Zeilen im Kalender", startDate: "2027-03-01", endDate: "2027-03-03", priceText: "=SUMME(A1)" },
    { userId: null, source: "manual" },
  );

  test("ics is escaped, folded and uses exclusive all-day end", () => {
    const ics = renderIcs([e], { base: "https://larp.example.org", name: "Test" });
    expect(ics).toContain("DTSTART;VALUE=DATE:20270301");
    expect(ics).toContain("DTEND;VALUE=DATE:20270304");
    expect(ics).toContain("Komma\\; und"); // escaped
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  test("csv neutralizes formulas and has BOM", () => {
    const csv = renderCsv([e], "https://larp.example.org");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("'=SUMME(A1)");
  });
});

describe("http", async () => {
  const cfg = { ...loadConfig({}), port: 0, dataDir: ":memory:", geocode: false, publicUrl: "http://test.local" };
  const db = openDb(":memory:");
  const app = new App(db, cfg);
  const server = startServer(app, cfg);
  const base = `http://127.0.0.1:${server.port}`;
  const user = await createUser(db, { email: "a@b.de", name: "Tester", password: "passwort-123", role: "admin" });
  const { token } = createApiToken(db, user.id, "test");

  test("noindex header and robots.txt", async () => {
    const res = await fetch(`${base}/robots.txt`);
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(await res.text()).toContain("Disallow: /");
  });

  test("mcp requires auth and advertises OAuth metadata", async () => {
    const res = await fetch(`${base}/mcp`, { method: "POST" });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("oauth-protected-resource");
    const meta = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
  });

  test("mcp create_event with bearer token", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "create_event", arguments: { title: "MCP-Testcon", startDate: addDays(today(), 30), registrationUrl: "https://example.org/a" } },
      }),
    });
    const body = await res.json();
    expect(body.result.content[0].text).toContain("Created #");
    const list = await (await fetch(`${base}/api/events`)).json();
    expect(list.events.map((e: { title: string }) => e.title)).toContain("MCP-Testcon");
  });

  test("admin API rejects cookie requests without CSRF header", async () => {
    const login = await fetch(`${base}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.de", password: "passwort-123" }),
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const denied = await fetch(`${base}/api/admin/events`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "X-Con", startDate: "2027-01-01" }),
    });
    expect(denied.status).toBe(403);
    const ok = await fetch(`${base}/api/admin/events`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json", "x-requested-with": "larp-kalender" },
      body: JSON.stringify({ title: "X-Con", startDate: "2027-01-01" }),
    });
    expect(ok.status).toBe(201);
  });
});
