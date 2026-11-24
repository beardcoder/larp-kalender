import { describe, expect, test } from "bun:test";
import { openDb } from "../lib/server/db.ts";
import { renderCsv, renderIcs } from "../lib/server/feeds.ts";
import { createEvent, eventCreateSchema, findDuplicates, listPublicEvents, today, addDays, updateEvent } from "../lib/server/events.ts";

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
