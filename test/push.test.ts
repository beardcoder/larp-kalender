import { describe, expect, test } from "bun:test";
import { openDb } from "../src/db.ts";
import { Push, type Payload } from "../src/push.ts";
import { addDays, createEvent, getEvent, today, updateEvent } from "../src/repo/events.ts";
import { toPublicEvent } from "../src/repo/events.ts";
import { reminderFor } from "../src/shared/reminders.ts";

function setup() {
  const db = openDb(":memory:");
  const sent: { endpoint: string; payload: Payload }[] = [];
  const push = new Push(db, "test@example.org", async (sub, payload) => {
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  });
  const subscribe = (endpoint: string, extra: Partial<Parameters<Push["subscribe"]>[0]> = {}) =>
    push.subscribe({
      subscription: { endpoint: `https://fcm.googleapis.com/fcm/send/${endpoint}`, keys: { p256dh: "x", auth: "y" } },
      notifyNew: true,
      notifyUpdates: true,
      reminders: true,
      genres: [],
      favorites: [],
      ...extra,
    });
  return { db, push, sent, subscribe };
}

const start = addDays(today(), 30);

describe("push notifications", () => {
  test("new events are batched into one message per device", async () => {
    const { db, push, sent, subscribe } = setup();
    subscribe("all");
    subscribe("scifi-only", { genres: ["scifi"] });
    createEvent(db, { title: "Fantasy-Con", startDate: start, genres: ["fantasy"] }, { userId: null, source: "mcp" });
    createEvent(db, { title: "Taverne", startDate: start, genres: ["fantasy"] }, { userId: null, source: "mcp" });
    createEvent(db, { title: "Entwurf", startDate: start, status: "draft" }, { userId: null, source: "suggestion" });
    const result = await push.announce();
    expect(result.newEvents).toBe(2);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.payload.title).toBe("2 neue Veranstaltungen");
    // Nothing is sent twice.
    expect((await push.announce()).sent).toBe(0);
  });

  test("relevant changes are pushed; bookmarks always, others by genre", async () => {
    const { db, push, sent, subscribe } = setup();
    const e = createEvent(db, { title: "Schlacht", startDate: start, genres: ["fantasy"], registrationStatus: "soon" }, { userId: null, source: "mcp" });
    await push.announce(); // marks as announced (no subscribers yet)
    subscribe("fav", { favorites: [e.id], genres: ["scifi"], notifyUpdates: false });
    subscribe("fantasy-fan", { genres: ["fantasy"] });
    subscribe("scifi-fan", { genres: ["scifi"] });

    const before = toPublicEvent(getEvent(db, e.id)!);
    const after = toPublicEvent(updateEvent(db, e.id, { registrationStatus: "open", registrationUrl: "https://example.org/a" }, { userId: null })!);
    expect(push.recordChanges(before, after)).toBe(true);
    // Text-only edits are not worth a notification.
    const textOnly = toPublicEvent(updateEvent(db, e.id, { summary: "Neuer Text" }, { userId: null })!);
    expect(push.recordChanges(after, textOnly)).toBe(false);

    await push.announce();
    const byDevice = Object.fromEntries(sent.map((s) => [s.endpoint.split("/").pop(), s.payload]));
    expect(Object.keys(byDevice).sort()).toEqual(["fantasy-fan", "fav"]);
    expect(byDevice.fav!.title).toBe("Merkliste: Schlacht");
    expect(byDevice["fantasy-fan"]!.body).toBe("Anmeldung jetzt offen, Anmeldelink ergänzt");
  });

  test("cancellation is announced as a change", async () => {
    const { db, push, sent, subscribe } = setup();
    const e = createEvent(db, { title: "Winterquartier", startDate: start }, { userId: null, source: "manual" });
    await push.announce();
    subscribe("a");
    const before = toPublicEvent(getEvent(db, e.id)!);
    const after = toPublicEvent(updateEvent(db, e.id, { status: "cancelled" }, { userId: null })!);
    push.recordChanges(before, after);
    await push.announce();
    expect(sent[0]!.payload).toMatchObject({ title: "Update: Winterquartier", body: "Abgesagt" });
  });

  test("activity feed lists announced new events and changes, newest first", async () => {
    const { db, push } = setup();
    const e = createEvent(db, { title: "Grenzland", startDate: start, registrationStatus: "soon" }, { userId: null, source: "manual" });
    createEvent(db, { title: "Entwurf", startDate: start, status: "draft" }, { userId: null, source: "suggestion" });
    expect(push.activity()).toHaveLength(0); // nothing announced yet
    const v1 = push.activityVersion();
    await push.announce();
    expect(push.activity().map((i) => i.id)).toEqual([`new-${e.id}`]);

    const before = toPublicEvent(getEvent(db, e.id)!);
    const after = toPublicEvent(updateEvent(db, e.id, { registrationStatus: "open" }, { userId: null })!);
    push.recordChanges(before, after);
    expect(push.activity()).toHaveLength(1); // pending changes appear once they are announced
    await new Promise((r) => setTimeout(r, 5));
    await push.announce();
    const items = push.activity();
    expect(items.map((i) => i.kind)).toEqual(["change", "new"]);
    expect(items[0]).toMatchObject({ eventId: e.id, title: "Grenzland", text: "Anmeldung jetzt offen" });
    expect(push.activityVersion()).not.toBe(v1);
  });
});

describe("reminders", () => {
  const base = toPublicEvent(
    createEvent(openDb(":memory:"), { title: "Lager", startDate: addDays(today(), 5), city: "Kassel" }, { userId: null, source: "manual" }),
  );
  test("start reminder within a week", () => {
    expect(reminderFor(base, today())).toMatchObject({ kind: "start", title: "In 5 Tagen: Lager", body: "Kassel" });
  });
  test("deadline reminder wins while registration is open", () => {
    const e = { ...base, registrationStatus: "open" as const, registrationDeadline: addDays(today(), 1) };
    expect(reminderFor(e, today())).toMatchObject({ kind: "deadline", title: "Anmeldeschluss in 1 Tag" });
  });
  test("no reminder for cancelled events", () => {
    expect(reminderFor({ ...base, status: "cancelled" }, today())).toBeNull();
  });
});
