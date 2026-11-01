import { useState } from "preact/hooks";
import { EVENT_TYPES, GENRES, type Genre } from "../../../src/shared/vocab.ts";
import { Icon } from "../components.tsx";

export function SuggestView() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const [genres, setGenres] = useState<Genre[]>([]);

  const submit = async (e: Event) => {
    e.preventDefault();
    const form = new FormData(e.target as HTMLFormElement);
    const data: Record<string, unknown> = { genres };
    for (const [k, v] of form) if (typeof v === "string" && v.trim()) data[k] = v.trim();
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/suggestions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Senden fehlgeschlagen.");
      setState("sent");
    } catch (err) {
      setError((err as Error).message);
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <section class="view view-suggest">
        <div class="empty">
          <div class="empty-seal is-sealed" aria-hidden="true">
            <Icon name="check" size={28} />
          </div>
          <h1 class="view-title">Danke für deinen Vorschlag</h1>
          <p>Wir prüfen die Angaben und tragen die Veranstaltung ein.</p>
          <div class="subscribe">
            <button class="btn" onClick={() => setState("idle")}>
              Weitere vorschlagen
            </button>
            <a class="btn ghost" href="/">
              Zu den Terminen
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section class="view view-suggest" aria-labelledby="suggest-heading">
      <header class="view-head">
        <h1 id="suggest-heading" class="view-title">Veranstaltung vorschlagen</h1>
        <p class="view-lead">Pflicht sind nur Name und Datum. Der Anmeldelink hilft am meisten.</p>
      </header>
      <form class="form panel" onSubmit={(e) => void submit(e)}>
        <label>
          Name der Veranstaltung *
          <input name="title" required minLength={3} maxLength={200} autocomplete="off" />
        </label>
        <div class="row">
          <label>
            Erster Tag *
            <input name="startDate" type="date" required />
          </label>
          <label>
            Letzter Tag
            <input name="endDate" type="date" />
          </label>
        </div>
        <label>
          Link zur Anmeldung
          <input name="registrationUrl" type="url" placeholder="https://" inputMode="url" />
        </label>
        <label>
          Website
          <input name="websiteUrl" type="url" placeholder="https://" inputMode="url" />
        </label>
        <div class="row">
          <label>
            PLZ
            <input name="postalCode" maxLength={12} inputMode="numeric" />
          </label>
          <label>
            Ort
            <input name="city" maxLength={120} />
          </label>
        </div>
        <label>
          Veranstaltungsort
          <input name="venue" maxLength={200} placeholder="z. B. Burg, Zeltplatz, Jugendherberge" />
        </label>
        <label>
          Veranstalter
          <input name="organizer" maxLength={200} />
        </label>
        <label>
          Art
          <select name="eventType">
            {Object.entries(EVENT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Genre</legend>
          <div class="chips wrap">
            {(Object.keys(GENRES) as Genre[]).map((g) => (
              <button
                type="button"
                key={g}
                class={`chip genre-${g}${genres.includes(g) ? " is-on" : ""}`}
                aria-pressed={genres.includes(g)}
                onClick={() => setGenres((x) => (x.includes(g) ? x.filter((y) => y !== g) : [...x, g].slice(0, 5)))}
              >
                {GENRES[g]}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          Preis
          <input name="priceText" maxLength={200} placeholder="z. B. SC 120 €, NSC 60 €" />
        </label>
        <label>
          Kurzbeschreibung
          <textarea name="summary" maxLength={300} rows={3} />
        </label>
        <label>
          Dein Name oder Kontakt (optional, nur für Rückfragen)
          <input name="submitter" maxLength={200} />
        </label>
        <label class="hp" aria-hidden="true">
          Website (leer lassen)
          <input name="website" tabIndex={-1} autocomplete="off" />
        </label>
        {error ? (
          <p class="error" role="alert">
            {error}
          </p>
        ) : null}
        <button class="btn primary big" type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Wird gesendet …" : "Vorschlag senden"}
        </button>
      </form>
    </section>
  );
}
