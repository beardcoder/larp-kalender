import { useEffect, useState } from "preact/hooks";
import { GENRES, type Genre } from "../../../src/shared/vocab.ts";
import { useStore } from "../../lib/store.ts";
import { copyText, Icon } from "../components.tsx";
import { disablePush, enablePush, needsInstallForPush, pushPrefsStore, pushSupported, testPush } from "../push.ts";
import { activeFilterCount, eventsStore, filtersStore, loadEvents, themeStore, type Filters, type Theme } from "../state.ts";
import { toast } from "../toast.tsx";
import { AccountSection } from "./Account.tsx";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let installEvent: BeforeInstallPromptEvent | null = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e as BeforeInstallPromptEvent;
});

function filterParams(f: Filters): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.genres.length) p.genre = f.genres.join(",");
  if (f.types.length) p.type = f.types.join(",");
  if (f.countries.length) p.country = f.countries.join(",");
  if (f.openOnly) p.registration = "open,waitlist";
  if (f.q) p.q = f.q;
  return p;
}

/** Buttons to subscribe to an iCal feed in common calendar apps. */
export function SubscribeLinks({ params }: { params: Record<string, string> }) {
  const qs = new URLSearchParams(params).toString();
  const https = `${location.origin}/kalender.ics${qs ? `?${qs}` : ""}`;
  const webcal = https.replace(/^https?:/, "webcal:");
  const name = params.name ?? "LARP-Kalender";
  return (
    <div class="subscribe">
      <a class="btn primary" href={webcal} data-native>
        <Icon name="calendar" size={18} /> Abonnieren
      </a>
      <a class="btn ghost" href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noopener noreferrer">
        Google Kalender
      </a>
      <a
        class="btn ghost"
        href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent(name)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Outlook
      </a>
      <button class="btn ghost" onClick={() => void copyText(https).then((ok) => toast(ok ? "Abo-Link kopiert" : "Kopieren nicht möglich"))}>
        <Icon name="copy" size={18} /> Link kopieren
      </button>
    </div>
  );
}

function CalendarSection() {
  const filters = useStore(filtersStore);
  const [deadlines, setDeadlines] = useState(true);
  const [useFilters, setUseFilters] = useState(false);
  const active = activeFilterCount(filters) > 0 || !!filters.q;
  const params: Record<string, string> = { ...(useFilters ? filterParams(filters) : {}), ...(deadlines ? { deadlines: "1" } : {}) };
  return (
    <section class="panel" id="abonnieren">
      <h2>Kalender abonnieren</h2>
      <p>Alle Termine erscheinen in deiner Kalender-App und aktualisieren sich automatisch, auch Absagen und neue Veranstaltungen.</p>
      <label class="switch">
        <input type="checkbox" checked={deadlines} onChange={(e) => setDeadlines((e.target as HTMLInputElement).checked)} />
        <span>Anmeldeschlüsse als eigene Termine</span>
      </label>
      {active ? (
        <label class="switch">
          <input type="checkbox" checked={useFilters} onChange={(e) => setUseFilters((e.target as HTMLInputElement).checked)} />
          <span>Nur Termine, die zu meinen Filtern passen</span>
        </label>
      ) : null}
      <SubscribeLinks params={params} />
    </section>
  );
}

function ExportSection() {
  const filters = useStore(filtersStore);
  const qs = new URLSearchParams(filterParams(filters)).toString();
  return (
    <section class="panel">
      <h2>Herunterladen</h2>
      <p>Tabelle für Excel, Numbers oder LibreOffice. Der RSS-Feed meldet neu eingetragene Veranstaltungen.</p>
      <div class="subscribe">
        <a class="btn ghost" href="/veranstaltungen.csv" download>
          <Icon name="download" size={18} /> Alle Termine (CSV)
        </a>
        {qs ? (
          <a class="btn ghost" href={`/veranstaltungen.csv?${qs}`} download>
            <Icon name="download" size={18} /> Gefilterte Termine (CSV)
          </a>
        ) : null}
        <a class="btn ghost" href="/feed.xml" target="_blank">
          <Icon name="rss" size={18} /> RSS-Feed
        </a>
      </div>
    </section>
  );
}

function NotificationSection() {
  const prefs = useStore(pushPrefsStore);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();

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

  const toggleGenre = (g: Genre) =>
    pushPrefsStore.set((p) => ({ ...p, genres: p.genres.includes(g) ? p.genres.filter((x) => x !== g) : [...p.genres, g] }));

  return (
    <section class="panel" id="benachrichtigungen">
      <h2>Benachrichtigungen</h2>
      {!supported ? (
        needsInstallForPush() ? (
          <p>Auf iPhone und iPad funktionieren Benachrichtigungen nur in der installierten App. Füge die Seite zuerst zum Home-Bildschirm hinzu.</p>
        ) : (
          <p>Dieser Browser unterstützt keine Benachrichtigungen.</p>
        )
      ) : (
        <>
          <p>Wir melden neue Veranstaltungen und erinnern dich an Termine auf deiner Merkliste: Anmeldestart, Anmeldeschluss, eine Woche vorher und bei Absagen.</p>
          <label class="switch">
            <input
              type="checkbox"
              checked={prefs.enabled}
              disabled={busy}
              onChange={(e) => void run((e.target as HTMLInputElement).checked ? enablePush : disablePush)}
            />
            <span>Benachrichtigungen erhalten</span>
          </label>
          {prefs.enabled ? (
            <div class="sub-settings">
              <label class="switch">
                <input type="checkbox" checked={prefs.notifyNew} onChange={(e) => pushPrefsStore.set((p) => ({ ...p, notifyNew: (e.target as HTMLInputElement).checked }))} />
                <span>Neue Veranstaltungen</span>
              </label>
              {prefs.notifyNew ? (
                <div class="chips wrap" role="group" aria-label="Nur diese Genres">
                  {(Object.keys(GENRES) as Genre[]).map((g) => (
                    <button key={g} class={`chip genre-${g}${prefs.genres.includes(g) ? " is-on" : ""}`} aria-pressed={prefs.genres.includes(g)} onClick={() => toggleGenre(g)}>
                      {GENRES[g]}
                    </button>
                  ))}
                  <p class="hint">{prefs.genres.length ? "Nur für die gewählten Genres." : "Ohne Auswahl: alle Genres."}</p>
                </div>
              ) : null}
              <label class="switch">
                <input type="checkbox" checked={prefs.reminders} onChange={(e) => pushPrefsStore.set((p) => ({ ...p, reminders: (e.target as HTMLInputElement).checked }))} />
                <span>Erinnerungen für die Merkliste</span>
              </label>
              <button class="btn ghost small" onClick={() => void testPush().then((ok) => toast(ok ? "Testnachricht gesendet" : "Senden fehlgeschlagen"))}>
                <Icon name="bell" size={16} /> Testnachricht senden
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function InstallSection() {
  const [installed, setInstalled] = useState(window.matchMedia("(display-mode: standalone)").matches);
  const [canPrompt, setCanPrompt] = useState(!!installEvent);
  useEffect(() => {
    const onPrompt = () => setCanPrompt(true);
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  if (installed) return null;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return (
    <section class="panel">
      <h2>Als App installieren</h2>
      {canPrompt ? (
        <>
          <p>Mit eigenem Symbol auf dem Startbildschirm, ohne Browserleiste und auch offline lesbar.</p>
          <button
            class="btn primary"
            onClick={async () => {
              await installEvent?.prompt();
              const choice = await installEvent?.userChoice;
              if (choice?.outcome === "accepted") setInstalled(true);
              installEvent = null;
              setCanPrompt(false);
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
    <section class="panel">
      <h2>Darstellung</h2>
      <div class="segmented" role="radiogroup" aria-label="Farbschema">
        {options.map(([value, label]) => (
          <button key={value} role="radio" aria-checked={theme === value} class={theme === value ? "is-on" : ""} onClick={() => themeStore.set(value)}>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function MoreView() {
  const { events } = useStore(eventsStore);
  useEffect(() => {
    if (location.hash === "#konto") document.getElementById("konto")?.scrollIntoView({ block: "start" });
  }, []);
  return (
    <section class="view view-more" aria-labelledby="more-heading">
      <header class="view-head">
        <h1 id="more-heading" class="view-title">Mehr</h1>
      </header>
      <AccountSection />
      <CalendarSection />
      <NotificationSection />
      <section class="panel">
        <h2>Fehlt eine Veranstaltung?</h2>
        <p>Schick uns die Eckdaten. Nach kurzer Prüfung erscheint sie im Kalender.</p>
        <a class="btn primary" href="/vorschlagen">
          <Icon name="plus" size={18} /> Veranstaltung vorschlagen
        </a>
      </section>
      <ExportSection />
      <InstallSection />
      <AppearanceSection />
      <section class="panel quiet">
        <p>
          {events.length} kommende Termine geladen.{" "}
          <button class="link-btn" onClick={() => void loadEvents().then(() => toast("Termine aktualisiert"))}>
            Jetzt aktualisieren
          </button>
        </p>
        <p>
          <a href="/admin" data-native>
            Anmeldung für die Redaktion
          </a>
        </p>
      </section>
    </section>
  );
}
