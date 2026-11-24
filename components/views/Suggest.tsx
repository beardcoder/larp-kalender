"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { suggestEvent } from "@/app/actions.ts";
import { EVENT_TYPES, GENRES, type Genre } from "@/lib/shared/vocab.ts";
import { Icon } from "../Icon.tsx";

export function SuggestView() {
  const [state, action, pending] = useActionState(suggestEvent, null);
  const [again, setAgain] = useState(0);

  if (state?.ok && again === 0)
    return (
      <section className="view view-suggest">
        <div className="empty">
          <div className="empty-seal is-sealed" aria-hidden="true">
            <Icon name="check" size={28} />
          </div>
          <h1 className="view-title">Danke für deinen Vorschlag</h1>
          <p>Wir prüfen die Angaben und tragen die Veranstaltung ein.</p>
          <div className="subscribe">
            <button className="btn" onClick={() => setAgain(1)}>
              Weitere vorschlagen
            </button>
            <Link className="btn ghost" href="/">
              Zu den Terminen
            </Link>
          </div>
        </div>
      </section>
    );

  return (
    <section className="view view-suggest" aria-labelledby="suggest-heading">
      <header className="view-head">
        <h1 id="suggest-heading" className="view-title">
          Veranstaltung vorschlagen
        </h1>
        <p className="view-lead">Pflicht sind nur Name und Datum. Der Anmeldelink hilft am meisten.</p>
      </header>
      <form className="form panel" action={(f) => (setAgain(0), action(f))}>
        <label>
          Name der Veranstaltung *
          <input name="title" required minLength={3} maxLength={200} autoComplete="off" />
        </label>
        <div className="row">
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
        <div className="row">
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
          <select name="eventType" defaultValue="con">
            {Object.entries(EVENT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Genre</legend>
          <div className="chips wrap">
            {(Object.keys(GENRES) as Genre[]).map((g) => (
              <label key={g} className={`chip genre-${g}`}>
                <input type="checkbox" name="genres" value={g} className="sr-only" />
                {GENRES[g]}
              </label>
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
        <label className="hp" aria-hidden="true">
          Website (leer lassen)
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
        {state?.error ? (
          <p className="error" role="alert">
            {state.error}
          </p>
        ) : null}
        <button className="btn primary big" type="submit" disabled={pending}>
          {pending ? "Wird gesendet …" : "Vorschlag senden"}
        </button>
      </form>
    </section>
  );
}
