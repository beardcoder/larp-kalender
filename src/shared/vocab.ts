/** Controlled vocabularies shared by server, MCP tools and frontend. Keys are English, labels German. */

export const GENRES = {
  fantasy: "Fantasy",
  endzeit: "Endzeit",
  scifi: "Science-Fiction",
  horror: "Horror & Mystery",
  historical: "Historisch",
  urban: "Vampire & Urban Fantasy",
  steampunk: "Steampunk",
  pirates: "Piraten",
  western: "Western",
  modern: "Modern & Zeitgenössisch",
  other: "Sonstiges",
} as const;

export const EVENT_TYPES = {
  con: "Con",
  tavern: "Taverne",
  day: "Tages-LARP",
  chamber: "Kammerspiel",
  battle: "Großveranstaltung",
  ambience: "Ambiente-Con",
  youth: "Kinder & Jugend",
  workshop: "Workshop & Bastelcon",
  market: "Markt & Fest",
  other: "Sonstiges",
} as const;

export const REGISTRATION_STATUS = {
  open: "Anmeldung offen",
  soon: "Anmeldung bald",
  waitlist: "Warteliste",
  sold_out: "Ausgebucht",
  closed: "Anmeldung geschlossen",
  unknown: "Anmeldestatus unbekannt",
} as const;

export const EVENT_STATUS = {
  published: "Veröffentlicht",
  draft: "Entwurf",
  cancelled: "Abgesagt",
} as const;

export const COUNTRIES = {
  DE: "Deutschland",
  AT: "Österreich",
  CH: "Schweiz",
  NL: "Niederlande",
  BE: "Belgien",
  LU: "Luxemburg",
  DK: "Dänemark",
  PL: "Polen",
  CZ: "Tschechien",
  FR: "Frankreich",
  GB: "Vereinigtes Königreich",
  SE: "Schweden",
} as const;

export const USER_ROLES = { admin: "Administrator", editor: "Redaktion", member: "Mitglied" } as const;

/** Roles with access to the admin backend, API tokens and MCP. */
export const STAFF_ROLES: readonly string[] = ["admin", "editor"];

export type Genre = keyof typeof GENRES;
export type EventType = keyof typeof EVENT_TYPES;
export type RegistrationStatus = keyof typeof REGISTRATION_STATUS;
export type EventStatus = keyof typeof EVENT_STATUS;
export type UserRole = keyof typeof USER_ROLES;

export const keys = <T extends object>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
