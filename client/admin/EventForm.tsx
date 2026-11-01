import { useEffect, useState } from "preact/hooks";
import { formatDateRange } from "../../src/shared/format.ts";
import { navigate } from "../lib/router.ts";
import { Icon } from "../app/components.tsx";
import { toast } from "../app/toast.tsx";
import { api, ApiError, fmtDateTime, type AdminLarpEvent, type Meta } from "./api.ts";

type FormState = Record<string, string>;

const TEXT_FIELDS = [
  "title", "summary", "description", "startDate", "endDate", "startTime", "endTime", "eventType", "organizer", "venue", "street",
  "postalCode", "city", "region", "country", "lat", "lng", "websiteUrl", "registrationUrl", "registrationOpens", "registrationDeadline",
  "registrationStatus", "priceText", "priceMin", "priceMax", "minAge", "capacity", "imageUrl", "contactEmail", "status", "sourceUrl", "notesInternal",
] as const;
const NUMBER_FIELDS = new Set(["lat", "lng", "priceMin", "priceMax", "minAge", "capacity"]);

function toForm(e: Partial<AdminLarpEvent>): FormState {
  const f: FormState = {};
  for (const k of TEXT_FIELDS) {
    const v = (e as Record<string, unknown>)[k];
    f[k] = v === null || v === undefined ? "" : String(v);
  }
  f.tags = (e.tags ?? []).join(", ");
  return f;
}

function toPayload(f: FormState, genres: string[]): Record<string, unknown> {
  const p: Record<string, unknown> = { genres, tags: f.tags!.split(",").map((t) => t.trim()).filter(Boolean) };
  for (const k of TEXT_FIELDS) {
    const v = (f[k] ?? "").trim();
    if (NUMBER_FIELDS.has(k)) p[k] = v === "" ? null : Number(v.replace(",", "."));
    else p[k] = v === "" ? null : v;
  }
  // Required/enum fields must not be null.
  for (const k of ["eventType", "registrationStatus", "status", "country"]) if (p[k] === null) delete p[k];
  return p;
}

const EMPTY: Partial<AdminLarpEvent> = { eventType: "con", registrationStatus: "unknown", status: "published", country: "DE", genres: [], tags: [] };

export function EventForm({ id, meta }: { id: number | null; meta: Meta }) {
  const [event, setEvent] = useState<AdminLarpEvent | null>(null);
  const [form, setForm] = useState<FormState>(toForm(EMPTY));
  const [genres, setGenres] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<{ event: AdminLarpEvent; reason: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) {
      setEvent(null);
      setForm(toForm(EMPTY));
      setGenres([]);
      return;
    }
    api<{ event: AdminLarpEvent }>(`/events/${id}`)
      .then(({ event }) => {
        setEvent(event);
        setForm(toForm(event));
        setGenres(event.genres);
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  const field = (name: string, label: string, opts: { type?: string; required?: boolean; placeholder?: string; wide?: boolean; step?: string } = {}) => (
    <label class={opts.wide ? "wide" : ""}>
      {label}
      {opts.required ? " *" : ""}
      <input
        name={name}
        type={(opts.type ?? "text") as "text"}
        required={opts.required}
        placeholder={opts.placeholder}
        step={opts.step}
        value={form[name] ?? ""}
        onInput={(e) => setForm((f) => ({ ...f, [name]: (e.target as HTMLInputElement).value }))}
      />
    </label>
  );

  const select = (name: string, label: string, options: Record<string, string>) => (
    <label>
      {label}
      <select name={name} value={form[name]} onChange={(e) => setForm((f) => ({ ...f, [name]: (e.target as HTMLSelectElement).value }))}>
        {Object.entries(options).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
    </label>
  );

  const save = async (opts: { allowDuplicate?: boolean; markChecked?: boolean; status?: string } = {}) => {
    setSaving(true);
    setError(null);
    const payload = { ...toPayload(form, genres), ...(opts.status ? { status: opts.status } : {}) };
    try {
      if (id) {
        const { event } = await api<{ event: AdminLarpEvent }>(`/events/${id}`, { method: "PUT", body: { ...payload, markChecked: opts.markChecked } });
        setEvent(event);
        setForm(toForm(event));
        toast(opts.status === "published" ? "Veröffentlicht" : "Gespeichert");
      } else {
        const { event } = await api<{ event: AdminLarpEvent }>("/events", { method: "POST", body: { ...payload, allowDuplicate: opts.allowDuplicate } });
        toast("Veranstaltung angelegt");
        navigate(`/admin/veranstaltung/${event.id}`, { replace: true });
      }
      setDuplicates([]);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setDuplicates(e.body.duplicates as typeof duplicates);
      else setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!id || !window.confirm(`„${form.title}“ endgültig löschen?`)) return;
    await api(`/events/${id}`, { method: "DELETE" });
    toast("Gelöscht");
    navigate("/admin");
  };

  return (
    <section class="view admin-form">
      <header class="view-head admin-head">
        <div>
          <a class="back-link" href="/admin">
            <Icon name="back" size={16} /> Alle Veranstaltungen
          </a>
          <h1 class="view-title">{id ? form.title || "Veranstaltung" : "Neue Veranstaltung"}</h1>
          {event ? (
            <p class="view-lead">
              Angelegt {fmtDateTime(event.createdAt)}
              {event.createdByName ? ` von ${event.createdByName}` : ""} über {event.source === "mcp" ? "KI (MCP)" : event.source === "suggestion" ? "Vorschlagsformular" : event.source === "api" ? "API" : "Backend"}
              {" · "}geändert {fmtDateTime(event.updatedAt)}
              {event.lastCheckedAt ? ` · geprüft ${fmtDateTime(event.lastCheckedAt)}` : ""}
            </p>
          ) : null}
        </div>
        {event && event.status !== "draft" ? (
          <a class="btn ghost small" href={`/termin/${event.slug}`} target="_blank">
            Ansehen <Icon name="external" size={16} />
          </a>
        ) : null}
      </header>

      {event?.status === "draft" ? (
        <div class="notice">
          <p>
            <strong>Entwurf.</strong> {event.notesInternal ?? "Noch nicht öffentlich sichtbar."}
          </p>
          <button class="btn accent small" onClick={() => void save({ status: "published" })} disabled={saving}>
            Prüfen und veröffentlichen
          </button>
        </div>
      ) : null}

      {duplicates.length ? (
        <div class="notice notice-warn" role="alert">
          <p>
            <strong>Möglicherweise schon eingetragen:</strong>
          </p>
          <ul>
            {duplicates.map((d) => (
              <li key={d.event.id}>
                <a href={`/admin/veranstaltung/${d.event.id}`}>{d.event.title}</a> – {formatDateRange(d.event.startDate, d.event.endDate)} ({d.reason})
              </li>
            ))}
          </ul>
          <button class="btn small" onClick={() => void save({ allowDuplicate: true })}>
            Trotzdem anlegen
          </button>
        </div>
      ) : null}

      <form
        class="form admin-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset class="panel">
          <legend>Grunddaten</legend>
          {field("title", "Titel", { required: true, wide: true })}
          <label class="wide">
            Kurzbeschreibung (1–2 Sätze)
            <textarea rows={2} maxLength={300} value={form.summary} onInput={(e) => setForm((f) => ({ ...f, summary: (e.target as HTMLTextAreaElement).value }))} />
          </label>
          <label class="wide">
            Beschreibung
            <textarea rows={6} value={form.description} onInput={(e) => setForm((f) => ({ ...f, description: (e.target as HTMLTextAreaElement).value }))} />
          </label>
          {select("eventType", "Art", meta.vocab.eventTypes)}
          {field("organizer", "Veranstalter")}
          <div class="wide">
            <span class="label">Genres</span>
            <div class="chips wrap">
              {Object.entries(meta.vocab.genres).map(([k, v]) => (
                <button
                  type="button"
                  key={k}
                  class={`chip genre-${k}${genres.includes(k) ? " is-on" : ""}`}
                  aria-pressed={genres.includes(k)}
                  onClick={() => setGenres((g) => (g.includes(k) ? g.filter((x) => x !== k) : [...g, k]))}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          {field("tags", "Schlagworte (kommagetrennt)", { wide: true, placeholder: "Anfängerfreundlich, Zelten, Vollverpflegung" })}
        </fieldset>

        <fieldset class="panel">
          <legend>Termin</legend>
          {field("startDate", "Erster Tag", { type: "date", required: true })}
          {field("endDate", "Letzter Tag", { type: "date" })}
          {field("startTime", "Beginn (Uhrzeit)", { type: "time" })}
          {field("endTime", "Ende (Uhrzeit)", { type: "time" })}
        </fieldset>

        <fieldset class="panel">
          <legend>Anmeldung</legend>
          {field("registrationUrl", "Anmeldelink", { type: "url", wide: true, placeholder: "https://" })}
          {select("registrationStatus", "Status", meta.vocab.registrationStatus)}
          {field("registrationOpens", "Anmeldung öffnet", { type: "date" })}
          {field("registrationDeadline", "Anmeldeschluss", { type: "date" })}
          {field("priceText", "Preise (Text)", { placeholder: "SC 140 €, NSC 60 €" })}
          {field("priceMin", "Preis ab (€)", { type: "number", step: "0.01" })}
          {field("priceMax", "Preis bis (€)", { type: "number", step: "0.01" })}
        </fieldset>

        <fieldset class="panel">
          <legend>Ort</legend>
          {field("venue", "Veranstaltungsort", { wide: true })}
          {field("street", "Straße")}
          {field("postalCode", "PLZ")}
          {field("city", "Ort")}
          {field("region", "Bundesland / Region")}
          {select("country", "Land", meta.vocab.countries)}
          {field("lat", "Breitengrad", { type: "number", step: "any", placeholder: "wird automatisch ermittelt" })}
          {field("lng", "Längengrad", { type: "number", step: "any", placeholder: "wird automatisch ermittelt" })}
        </fieldset>

        <fieldset class="panel">
          <legend>Weitere Angaben</legend>
          {field("websiteUrl", "Website", { type: "url", placeholder: "https://" })}
          {field("contactEmail", "Kontakt-E-Mail", { type: "email" })}
          {field("imageUrl", "Bild-URL", { type: "url", placeholder: "https://" })}
          {field("minAge", "Mindestalter", { type: "number" })}
          {field("capacity", "Max. Teilnehmende", { type: "number" })}
        </fieldset>

        <fieldset class="panel">
          <legend>Intern</legend>
          {select("status", "Sichtbarkeit", meta.vocab.status)}
          {field("sourceUrl", "Quelle", { type: "url", placeholder: "Wo stehen die Infos?" })}
          <label class="wide">
            Notizen (nicht öffentlich)
            <textarea rows={3} value={form.notesInternal} onInput={(e) => setForm((f) => ({ ...f, notesInternal: (e.target as HTMLTextAreaElement).value }))} />
          </label>
        </fieldset>

        {error ? (
          <p class="error" role="alert">
            {error}
          </p>
        ) : null}

        <div class="form-bar">
          {id ? (
            <button type="button" class="btn ghost danger" onClick={() => void remove()}>
              Löschen
            </button>
          ) : null}
          <span class="spacer" />
          {id ? (
            <button type="button" class="btn ghost" disabled={saving} onClick={() => void save({ markChecked: true })}>
              <Icon name="check" size={18} /> Speichern & als geprüft markieren
            </button>
          ) : null}
          <button type="submit" class="btn primary" disabled={saving}>
            {saving ? "Speichert …" : "Speichern"}
          </button>
        </div>
      </form>
    </section>
  );
}
