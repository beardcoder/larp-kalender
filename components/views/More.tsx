"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { disablePush, enablePush, needsInstallForPush, pushPrefsStore, pushSupported, testPush } from "@/lib/client/push.ts";
import { activeFilterCount, filtersStore, themeStore, toggleIn, type Filters, type Theme } from "@/lib/client/state.ts";
import { useStore } from "@/lib/client/store.ts";
import { GENRES, type Genre } from "@/lib/shared/vocab.ts";
import { useAppData } from "../AppData.tsx";
import { Icon } from "../Icon.tsx";
import { toast } from "../Toasts.tsx";
import { AccountSection } from "./Account.tsx";
import { SubscribeLinks } from "./SubscribeLinks.tsx";

function filterParams(f: Filters): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.genres.length) p.genre = f.genres.join(",");
  if (f.types.length) p.type = f.types.join(",");
  if (f.countries.length) p.country = f.countries.join(",");
  if (f.openOnly) p.registration = "open,waitlist";
  if (f.q) p.q = f.q;
  return p;
}

function CalendarSection() {
  const filters = useStore(filtersStore);
  const [deadlines, setDeadlines] = useState(true);
  const [useFilters, setUseFilters] = useState(false);
  const active = activeFilterCount(filters) > 0 || !!filters.q;
  const params = { ...(useFilters ? filterParams(filters) : {}), ...(deadlines ? { deadlines: "1" } : {}) };
  return (
    <section className="panel" id="abonnieren">
      <h2>Kalender abonnieren</h2>
      <p>Alle Termine erscheinen in deiner Kalender-App und aktualisieren sich automatisch, auch Absagen und neue Veranstaltungen.</p>
      <label className="switch">
        <input type="checkbox" checked={deadlines} onChange={(e) => setDeadlines(e.target.checked)} />
        <span>Anmeldeschlüsse als eigene Termine</span>
      </label>
      {active ? (
        <label className="switch">
          <input type="checkbox" checked={useFilters} onChange={(e) => setUseFilters(e.target.checked)} />
          <span>Nur Termine, die zu meinen Filtern passen</span>
        </label>
      ) : null}
      <SubscribeLinks params={params} />
    </section>
  );
}

function ExportSection() {
  const qs = new URLSearchParams(filterParams(useStore(filtersStore))).toString();
  return (
    <section className="panel">
      <h2>Herunterladen</h2>
      <p>Tabelle für Excel, Numbers oder LibreOffice. Der RSS-Feed meldet neu eingetragene Veranstaltungen.</p>
      <div className="subscribe">
        <a className="btn ghost" href="/veranstaltungen.csv" download>
          <Icon name="download" size={18} /> Alle Termine (CSV)
        </a>
        {qs ? (
          <a className="btn ghost" href={`/veranstaltungen.csv?${qs}`} download>
            <Icon name="download" size={18} /> Gefilterte Termine (CSV)
          </a>
        ) : null}
        <a className="btn ghost" href="/feed.xml" target="_blank">
          <Icon name="rss" size={18} /> RSS-Feed
        </a>
      </div>
    </section>
  );
}

function NotificationSection() {
  const prefs = useStore(pushPrefsStore);
  const [busy, setBusy] = useState(false);
  const [support, setSupport] = useState<"yes" | "install" | "no" | null>(null);
  useEffect(() => setSupport(pushSupported() ? "yes" : needsInstallForPush() ? "install" : "no"), []);
  const set = (patch: Partial<typeof prefs>) => pushPrefsStore.set((p) => ({ ...p, ...patch }));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      toast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" id="benachrichtigungen">
      <h2>Benachrichtigungen</h2>
      <p className="hint">
        Alle Hinweise findest du auch in der App unter <Link href="/benachrichtigungen">Benachrichtigungen</Link>, mit oder ohne Push.
      </p>
      {support === "install" ? (
        <p>Auf iPhone und iPad funktionieren Benachrichtigungen nur in der installierten App. Füge die Seite zuerst zum Home-Bildschirm hinzu.</p>
      ) : support === "no" ? (
        <p>Dieser Browser unterstützt keine Benachrichtigungen.</p>
      ) : support === "yes" ? (
        <>
          <p>
            Wir melden neue Veranstaltungen und wichtige Änderungen (Anmeldung offen, ausgebucht, abgesagt, neues Datum) und erinnern dich an Termine auf deiner
            Merkliste: Anmeldestart, Anmeldeschluss und eine Woche vorher.
          </p>
          <label className="switch">
            <input type="checkbox" checked={prefs.enabled} disabled={busy} onChange={(e) => void run(e.target.checked ? enablePush : disablePush)} />
            <span>Benachrichtigungen erhalten</span>
          </label>
          {prefs.enabled ? (
            <div className="sub-settings">
              <label className="switch">
                <input type="checkbox" checked={prefs.notifyNew} onChange={(e) => set({ notifyNew: e.target.checked })} />
                <span>Neue Veranstaltungen</span>
              </label>
              <label className="switch">
                <input type="checkbox" checked={prefs.notifyUpdates !== false} onChange={(e) => set({ notifyUpdates: e.target.checked })} />
                <span>Änderungen an Veranstaltungen</span>
              </label>
              {prefs.notifyNew || prefs.notifyUpdates !== false ? (
                <div className="chips wrap" role="group" aria-label="Nur diese Genres">
                  {(Object.keys(GENRES) as Genre[]).map((g) => (
                    <button key={g} className={`chip genre-${g}${prefs.genres.includes(g) ? " is-on" : ""}`} aria-pressed={prefs.genres.includes(g)} onClick={() => set({ genres: toggleIn(prefs.genres, g) })}>
                      {GENRES[g]}
                    </button>
                  ))}
                  <p className="hint">
                    {prefs.genres.length ? "Nur für die gewählten Genres." : "Ohne Auswahl: alle Genres."} Änderungen an Terminen auf deiner Merkliste bekommst du immer,
                    solange Erinnerungen an sind.
                  </p>
                </div>
              ) : null}
              <label className="switch">
                <input type="checkbox" checked={prefs.reminders} onChange={(e) => set({ reminders: e.target.checked })} />
                <span>Erinnerungen für die Merkliste</span>
              </label>
              <button className="btn ghost small" onClick={() => void testPush().then((ok) => toast(ok ? "Testnachricht gesendet" : "Senden fehlgeschlagen"))}>
                <Icon name="bell" size={16} /> Testnachricht senden
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

function InstallSection() {
  const [installed, setInstalled] = useState(true);
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    setInstalled(matchMedia("(display-mode: standalone)").matches);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => (e.preventDefault(), setPrompt(e as InstallPrompt));
    const onInstalled = () => setInstalled(true);
    addEventListener("beforeinstallprompt", onPrompt);
    addEventListener("appinstalled", onInstalled);
    return () => (removeEventListener("beforeinstallprompt", onPrompt), removeEventListener("appinstalled", onInstalled));
  }, []);
  if (installed) return null;
  return (
    <section className="panel">
      <h2>Als App installieren</h2>
      {prompt ? (
        <>
          <p>Mit eigenem Symbol auf dem Startbildschirm, ohne Browserleiste und auch offline lesbar.</p>
          <button
            className="btn primary"
            onClick={async () => {
              await prompt.prompt();
              if ((await prompt.userChoice).outcome === "accepted") setInstalled(true);
              setPrompt(null);
            }}
          >
            <Icon name="install" size={18} /> Installieren
          </button>
        </>
      ) : ios ? (
        <p>Tippe in Safari auf „Teilen“ und dann auf „Zum Home-Bildschirm“.</p>
      ) : (
        <p>Öffne das Browsermenü und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.</p>
      )}
    </section>
  );
}

function AppearanceSection() {
  const theme = useStore(themeStore);
  const options: [Theme, string][] = [
    ["auto", "Wie das System"],
    ["dark", "Dunkel"],
    ["light", "Hell"],
  ];
  return (
    <section className="panel">
      <h2>Darstellung</h2>
      <div className="segmented" role="radiogroup" aria-label="Farbschema">
        {options.map(([value, label]) => (
          <button key={value} role="radio" aria-checked={theme === value} className={theme === value ? "is-on" : ""} onClick={() => themeStore.set(value)}>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function MoreView() {
  const { events } = useAppData();
  return (
    <section className="view view-more" aria-labelledby="more-heading">
      <header className="view-head">
        <h1 id="more-heading" className="view-title">
          Mehr
        </h1>
      </header>
      <AccountSection />
      <CalendarSection />
      <NotificationSection />
      <section className="panel">
        <h2>Fehlt eine Veranstaltung?</h2>
        <p>Schick uns die Eckdaten. Nach kurzer Prüfung erscheint sie im Kalender.</p>
        <Link className="btn primary" href="/vorschlagen">
          <Icon name="plus" size={18} /> Veranstaltung vorschlagen
        </Link>
      </section>
      <ExportSection />
      <InstallSection />
      <AppearanceSection />
      <section className="panel quiet">
        <p>{events.length} kommende Termine.</p>
        <p>
          <Link href="/admin">Anmeldung für die Redaktion</Link>
        </p>
      </section>
    </section>
  );
}
