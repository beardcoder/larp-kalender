/** Fills a local development database with fictional demo events. Never run against production. */

import { loadConfig } from "../src/config.ts";
import { openDb } from "../src/db.ts";
import { addDays, createEvent, today, type EventCreateInput } from "../src/repo/events.ts";

const cfg = loadConfig();
if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
const db = openDb(cfg.dataDir);
const t = today();
const d = (n: number) => addDays(t, n);

const demo: EventCreateInput[] = [
  { title: "Die Krone von Nebelstein", startDate: d(9), endDate: d(12), genres: ["fantasy"], eventType: "con", city: "Bad Wildungen", region: "Hessen", postalCode: "34537", venue: "Zeltlager am Edersee", registrationStatus: "open", registrationUrl: "https://example.org/nebelstein/anmeldung", registrationDeadline: d(4), priceText: "SC 145 €, NSC 70 €", minAge: 18, organizer: "Bund der Nebelwanderer e. V.", summary: "Vier Tage Intrigen um den verwaisten Thron – Spielerfraktionen, Hofstaat und ein Turnier im Morgengrauen.", lat: 51.12, lng: 9.12 },
  { title: "Ödland: Staubfieber", startDate: d(16), endDate: d(18), genres: ["endzeit"], eventType: "con", city: "Jüterbog", region: "Brandenburg", registrationStatus: "waitlist", registrationUrl: "https://example.org/staubfieber", priceText: "ab 95 €", organizer: "Wasteland Crew Ost", summary: "Endzeit auf einem alten Truppenübungsplatz. Handel, Hunger, Funkstille.", lat: 51.99, lng: 13.07 },
  { title: "Tavernenabend „Zum Grünen Kessel“", startDate: d(5), genres: ["fantasy", "historical"], eventType: "tavern", startTime: "18:00", endTime: "23:30", city: "Köln", region: "Nordrhein-Westfalen", registrationStatus: "open", registrationUrl: "https://example.org/kessel", priceText: "15 € inkl. Eintopf", summary: "Gewandet ankommen, Geschichten tauschen, Barden lauschen. Ideal für den Einstieg.", tags: ["Anfängerfreundlich"], lat: 50.94, lng: 6.96 },
  { title: "Sternenfall-Station", startDate: d(31), endDate: d(33), genres: ["scifi"], eventType: "con", city: "Hamburg", region: "Hamburg", registrationStatus: "soon", registrationOpens: d(7), priceText: "189 €", summary: "Eine Forschungsstation am Rand des kartierten Raums. Black-Box-Elemente, Lichtdesign, Soundscape.", lat: 53.55, lng: 9.99 },
  { title: "Das Haus am Moorweg", startDate: d(23), endDate: d(24), genres: ["horror"], eventType: "chamber", city: "Lüneburg", region: "Niedersachsen", registrationStatus: "sold_out", registrationUrl: "https://example.org/moorweg", minAge: 18, capacity: 24, summary: "Kammerspiel für 24 Personen, 1920er Jahre, ein Erbe und zu viele Türen.", lat: 53.25, lng: 10.41 },
  { title: "Schlacht um die Weidenfurt", startDate: d(58), endDate: d(63), genres: ["fantasy"], eventType: "battle", city: "Diemelstadt", region: "Hessen", registrationStatus: "open", registrationUrl: "https://example.org/weidenfurt", priceText: "SC 120 €, Lager-Pauschalen", summary: "Großveranstaltung mit Lagerleben, Feldschlachten und Diplomatie zwischen sieben Reichen.", lat: 51.48, lng: 8.98 },
  { title: "Nachtschatten – Domäne Wien", startDate: d(12), genres: ["urban"], eventType: "day", startTime: "19:00", city: "Wien", country: "AT", registrationStatus: "open", registrationUrl: "https://example.org/domaene-wien", priceText: "25 €", summary: "Abendspiel im Elysium: Kainiten, Kerzenlicht, Kalkül.", lat: 48.21, lng: 16.37 },
  { title: "Zahnrad & Zylinder", startDate: d(40), endDate: d(42), genres: ["steampunk"], eventType: "ambience", city: "Dresden", region: "Sachsen", registrationStatus: "unknown", websiteUrl: "https://example.org/zahnrad", summary: "Weltausstellung im Dampfzeitalter – Erfinder, Salons und ein verschwundener Automat.", lat: 51.05, lng: 13.74 },
  { title: "Bastelcon Rüstung & Requisite", startDate: d(19), endDate: d(20), genres: ["other"], eventType: "workshop", city: "Kassel", region: "Hessen", registrationStatus: "open", registrationUrl: "https://example.org/bastelcon", priceText: "40 € inkl. Material", tags: ["Workshop", "Lederarbeit"], lat: 51.31, lng: 9.48 },
  { title: "Kinder-LARP: Die Drachenschule", startDate: d(26), genres: ["fantasy"], eventType: "youth", city: "Freiburg", region: "Baden-Württemberg", registrationStatus: "open", registrationUrl: "https://example.org/drachenschule", priceText: "20 €", minAge: 8, summary: "Ein Tag Abenteuer für 8- bis 13-Jährige mit Spielleitung und Elterncafé.", lat: 47.99, lng: 7.84 },
  { title: "Piratenbucht von Sankt Elmo", startDate: d(75), endDate: d(78), genres: ["pirates"], eventType: "con", city: "Lemmer", country: "NL", registrationStatus: "soon", registrationOpens: d(20), summary: "Schiffe, Schätze und Schmuggel an der Küste.", lat: 52.84, lng: 5.71 },
  { title: "Winterquartier", startDate: d(45), endDate: d(47), genres: ["historical"], eventType: "con", city: "Coburg", region: "Bayern", status: "cancelled", registrationStatus: "closed", summary: "Leider abgesagt.", lat: 50.26, lng: 10.96 },
];

for (const e of demo) createEvent(db, e, { userId: null, source: "manual" });
console.log(`Seeded ${demo.length} demo events into ${cfg.dataDir}`);
