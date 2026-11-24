"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { Icon } from "@/components/Icon.tsx";
import { toast } from "@/components/Toasts.tsx";
import { formatDateRange } from "@/lib/shared/format.ts";
import type { AdminLarpEvent } from "@/lib/shared/types.ts";
import { COUNTRIES, EVENT_STATUS, EVENT_TYPES, GENRES, REGISTRATION_STATUS } from "@/lib/shared/vocab.ts";
import { deleteEvent, saveEvent } from "../../../actions.ts";

const SOURCE: Record<string, string> = { mcp: "KI (MCP)", suggestion: "Vorschlagsformular", api: "API", manual: "Backend" };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "–");

/** Form values as strings: from the last submission (kept after errors) or from the saved event. */
function initialValues(e: AdminLarpEvent | null): Record<string, string> {
  const base: object = e ?? { eventType: "con", registrationStatus: "unknown", status: "published", country: "DE" };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) out[k] = v === null || v === undefined ? "" : Array.isArray(v) ? v.join(", ") : String(v);
  out.genres = (e?.genres ?? []).join(",");
  return out;
}

export function EventForm({ event, created }: { event: AdminLarpEvent | null; created?: boolean }) {
  const [state, action, pending] = useActionState(saveEvent, null);
  const v = state?.values ?? initialValues(event);
  const genres = v.genres ? v.genres.split(",") : [];

  useEffect(() => {
    if (created) toast("Veranstaltung angelegt");
  }, [created]);
  useEffect(() => {
    if (state?.ok) toast("Gespeichert");
  }, [state]);

  const field = (name: string, label: string, o: { type?: string; required?: boolean; placeholder?: string; wide?: boolean; step?: string } = {}) => (
    <label className={o.wide ? "wide" : ""}>
      {label}
      {o.required ? " *" : ""}
      <input name={name} type={o.type ?? "text"} required={o.required} placeholder={o.placeholder} step={o.step} defaultValue={v[name] ?? ""} key={`${name}:${v[name]}`} />
    </label>
  );
  const select = (name: string, label: string, options: Record<string, string>) => (
    <label>
      {label}
      <select name={name} defaultValue={v[name]} key={`${name}:${v[name]}`}>
        {Object.entries(options).map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  const area = (name: string, label: string, rows: number, maxLength?: number) => (
    <label className="wide">
      {label}
      <textarea name={name} rows={rows} maxLength={maxLength} defaultValue={v[name] ?? ""} key={`${name}:${v[name]}`} />
    </label>
  );

  return (
    <section className="view admin-form">
      <header className="view-head admin-head">
        <div>
          <Link className="back-link" href="/admin">
            <Icon name="back" size={16} /> Alle Veranstaltungen
          </Link>
          <h1 className="view-title">{event ? event.title : "Neue Veranstaltung"}</h1>
          {event ? (
            <p className="view-lead">
              Angelegt {fmt(event.createdAt)}
              {event.createdByName ? ` von ${event.createdByName}` : ""} über {SOURCE[event.source] ?? event.source} · geändert {fmt(event.updatedAt)}
              {event.lastCheckedAt ? ` · geprüft ${fmt(event.lastCheckedAt)}` : ""}
            </p>
          ) : null}
        </div>
        {event && event.status !== "draft" ? (
          <Link className="btn ghost small" href={`/termin/${event.slug}`} target="_blank">
            Ansehen <Icon name="external" size={16} />
          </Link>
        ) : null}
      </header>

      <form className="form admin-grid" action={action} id="event-form">
        {event ? <input type="hidden" name="id" value={event.id} /> : null}
        {/* Enter in a field submits with the first submit button: make that plain "save". */}
        <button className="sr-only" name="intent" value="save" tabIndex={-1} aria-hidden="true" />

        {event?.status === "draft" ? (
          <div className="notice">
            <p>
              <strong>Entwurf.</strong> {event.notesInternal ?? "Noch nicht öffentlich sichtbar."}
            </p>
            <button className="btn accent small" name="intent" value="publish" disabled={pending}>
              Prüfen und veröffentlichen
            </button>
          </div>
        ) : null}

        {state?.duplicates?.length ? (
          <div className="notice notice-warn" role="alert">
            <p>
              <strong>Möglicherweise schon eingetragen:</strong>
            </p>
            <ul>
              {state.duplicates.map((d) => (
                <li key={d.event.id}>
                  <Link href={`/admin/veranstaltung/${d.event.id}`}>{d.event.title}</Link> – {formatDateRange(d.event.startDate, d.event.endDate)} ({d.reason})
                </li>
              ))}
            </ul>
            <button className="btn small" name="intent" value="duplicate">
              Trotzdem anlegen
            </button>
          </div>
        ) : null}

        <fieldset className="panel">
          <legend>Grunddaten</legend>
          {field("title", "Titel", { required: true, wide: true })}
          {area("summary", "Kurzbeschreibung (1–2 Sätze)", 2, 300)}
          {area("description", "Beschreibung", 6)}
          {select("eventType", "Art", EVENT_TYPES)}
          {field("organizer", "Veranstalter")}
          <div className="wide">
            <span className="label">Genres</span>
            <div className="chips wrap">
              {Object.entries(GENRES).map(([k, l]) => (
                <label key={`${k}:${genres.includes(k)}`} className={`chip genre-${k}`}>
                  <input type="checkbox" name="genres" value={k} defaultChecked={genres.includes(k)} className="sr-only" />
                  {l}
                </label>
              ))}
            </div>
          </div>
          {field("tags", "Schlagworte (kommagetrennt)", { wide: true, placeholder: "Anfängerfreundlich, Zelten, Vollverpflegung" })}
        </fieldset>

        <fieldset className="panel">
          <legend>Termin</legend>
          {field("startDate", "Erster Tag", { type: "date", required: true })}
          {field("endDate", "Letzter Tag", { type: "date" })}
          {field("startTime", "Beginn (Uhrzeit)", { type: "time" })}
          {field("endTime", "Ende (Uhrzeit)", { type: "time" })}
        </fieldset>

        <fieldset className="panel">
          <legend>Anmeldung</legend>
          {field("registrationUrl", "Anmeldelink", { type: "url", wide: true, placeholder: "https://" })}
          {select("registrationStatus", "Status", REGISTRATION_STATUS)}
          {field("registrationOpens", "Anmeldung öffnet", { type: "date" })}
          {field("registrationDeadline", "Anmeldeschluss", { type: "date" })}
          {field("priceText", "Preise (Text)", { placeholder: "SC 140 €, NSC 60 €" })}
          {field("priceMin", "Preis ab (€)", { type: "number", step: "0.01" })}
          {field("priceMax", "Preis bis (€)", { type: "number", step: "0.01" })}
        </fieldset>

        <fieldset className="panel">
          <legend>Ort</legend>
          {field("venue", "Veranstaltungsort", { wide: true })}
          {field("street", "Straße")}
          {field("postalCode", "PLZ")}
          {field("city", "Ort")}
          {field("region", "Bundesland / Region")}
          {select("country", "Land", COUNTRIES)}
          {field("lat", "Breitengrad", { type: "number", step: "any", placeholder: "wird automatisch ermittelt" })}
          {field("lng", "Längengrad", { type: "number", step: "any", placeholder: "wird automatisch ermittelt" })}
        </fieldset>

        <fieldset className="panel">
          <legend>Weitere Angaben</legend>
          {field("websiteUrl", "Website", { type: "url", placeholder: "https://" })}
          {field("contactEmail", "Kontakt-E-Mail", { type: "email" })}
          {field("imageUrl", "Bild-URL", { type: "url", placeholder: "https://" })}
          {field("minAge", "Mindestalter", { type: "number" })}
          {field("capacity", "Max. Teilnehmende", { type: "number" })}
        </fieldset>

        <fieldset className="panel">
          <legend>Intern</legend>
          {select("status", "Sichtbarkeit", EVENT_STATUS)}
          {field("sourceUrl", "Quelle", { type: "url", placeholder: "Wo stehen die Infos?" })}
          {area("notesInternal", "Notizen (nicht öffentlich)", 3)}
        </fieldset>

        {state?.error ? (
          <p className="error" role="alert">
            {state.error}
          </p>
        ) : null}

        <div className="form-bar">
          {event ? (
            <button type="submit" form="delete-form" className="btn ghost danger">
              Löschen
            </button>
          ) : null}
          <span className="spacer" />
          {event ? (
            <button className="btn ghost" name="intent" value="check" disabled={pending}>
              <Icon name="check" size={18} /> Speichern & als geprüft markieren
            </button>
          ) : null}
          <button className="btn primary" name="intent" value="save" disabled={pending}>
            {pending ? "Speichert …" : "Speichern"}
          </button>
        </div>
      </form>

      {event ? (
        <form id="delete-form" action={deleteEvent} onSubmit={(e) => confirm(`„${event.title}“ endgültig löschen?`) || e.preventDefault()}>
          <input type="hidden" name="id" value={event.id} />
        </form>
      ) : null}
    </section>
  );
}
