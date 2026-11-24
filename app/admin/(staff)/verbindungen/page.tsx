import { getApp } from "@/lib/server/app.ts";
import { baseUrl, requireStaff } from "@/lib/server/auth.ts";
import { listConnections } from "@/lib/server/oauth.ts";
import { listApiTokens } from "@/lib/server/users.ts";
import { disconnect, deleteToken } from "../../actions.ts";
import { ConfirmButton, CopyField, CopyPromptButton, TokenForm } from "./parts.tsx";

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }) : "–");

const schedulePrompt = (origin: string) => `Recherchiere LARP-Veranstaltungen in Deutschland, Österreich und der Schweiz für die nächsten 12 Monate, bei denen man sich als Spieler oder NSC anmelden kann, und pflege sie im LARP-Kalender (${origin}).

So gehst du vor:
1. Rufe im Connector „LARP-Kalender“ zuerst list_events auf, damit du weißt, was schon eingetragen ist.
2. Suche im Web nach neuen und geänderten Veranstaltungen: Veranstalter-Websites, LARP-Terminkalender und -Portale, Vereinsseiten, Foren und Social Media.
3. Trage neue Veranstaltungen mit create_events ein. Wichtig: Titel, Datum (YYYY-MM-DD), Ort (PLZ, Stadt, Bundesland, Land), Genres, Art, direkter Anmeldelink (registrationUrl), Anmeldestatus, Preise, Mindestalter, Veranstalter, eine kurze deutsche Beschreibung (summary) und die Quelle (sourceUrl).
4. Wenn create_events eine Veranstaltung als bereits vorhanden meldet, prüfe die Angaben und aktualisiere sie bei Änderungen mit update_event (z. B. Anmeldung jetzt offen, ausgebucht, abgesagt, neue Preise).
5. Erfinde keine Daten. Lass unbekannte Felder leer.

Fasse am Ende kurz zusammen: wie viele neu eingetragen, welche aktualisiert, welche übersprungen.`;

export default async function ConnectPage() {
  const user = await requireStaff();
  const { db } = getApp();
  const origin = await baseUrl();
  const mcpUrl = `${origin}/mcp`;
  const tokens = listApiTokens(db, user.id);
  const connections = listConnections(db, user.id);
  const prompt = schedulePrompt(origin);

  return (
    <section className="view">
      <header className="view-head">
        <h1 className="view-title">KI & Schnittstellen</h1>
        <p className="view-lead">Verbinde Claude oder ChatGPT mit dem Kalender. Die KI kann dann Veranstaltungen suchen, eintragen und aktualisieren – in deinem Namen.</p>
      </header>

      <section className="panel">
        <h2>MCP-Server</h2>
        <CopyField label="Server-URL" value={mcpUrl} />
        <p>Die Anmeldung läuft über OAuth: Beim Verbinden öffnet sich ein Fenster, in dem du dich mit deinem Redaktionszugang anmeldest und den Zugriff erlaubst.</p>
      </section>

      <section className="panel steps">
        <h2>ChatGPT mit geplanter Aufgabe</h2>
        <ol>
          <li>In ChatGPT unter Einstellungen → Apps & Konnektoren → Erweitert den Entwicklermodus aktivieren.</li>
          <li>„Konnektor erstellen“: Name „LARP-Kalender“, Server-URL von oben, Authentifizierung OAuth. Danach anmelden und Zugriff erlauben.</li>
          <li>Neuen Chat starten, den Konnektor aktivieren und diese Aufgabe einplanen, z. B. „wöchentlich montags um 7 Uhr“:</li>
        </ol>
        <pre className="prompt">{prompt}</pre>
        <CopyPromptButton text={prompt} />
      </section>

      <section className="panel steps">
        <h2>Claude</h2>
        <ol>
          <li>claude.ai: Einstellungen → Konnektoren → „Benutzerdefinierten Konnektor hinzufügen“, Server-URL eintragen, verbinden.</li>
          <li>Claude Code (Terminal):</li>
        </ol>
        <CopyField label="Befehl" value={`claude mcp add --transport http --scope user larp-kalender ${mcpUrl}`} />
        <p>
          Ohne OAuth geht es auch mit einem API-Token: <code>--header &quot;Authorization: Bearer lk_…&quot;</code>
        </p>
      </section>

      <section className="panel">
        <h2>API-Tokens</h2>
        <p>Für Skripte und KI-Clients, die feste Header statt OAuth nutzen. Ein Token gilt wie dein Login – gib ihn nicht weiter.</p>
        <TokenForm />
        {tokens.length ? (
          <ul className="token-list">
            {tokens.map((t) => (
              <li key={t.id}>
                <div>
                  <strong>{t.name}</strong>
                  <span className="row-sub">
                    {t.prefix}… · erstellt {fmt(t.createdAt)} · zuletzt genutzt {fmt(t.lastUsedAt)}
                  </span>
                </div>
                <form action={deleteToken}>
                  <input type="hidden" name="id" value={t.id} />
                  <ConfirmButton question={`Token „${t.name}“ widerrufen?`}>Widerrufen</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel">
        <h2>Verbundene Anwendungen</h2>
        {connections.length ? (
          <ul className="token-list">
            {connections.map((c) => (
              <li key={c.clientId}>
                <div>
                  <strong>{c.name}</strong>
                  <span className="row-sub">
                    verbunden {fmt(c.createdAt)} · zuletzt aktiv {fmt(c.lastUsedAt)}
                  </span>
                </div>
                <form action={disconnect}>
                  <input type="hidden" name="clientId" value={c.clientId} />
                  <ConfirmButton question={`Zugriff für „${c.name}“ entziehen?`}>Trennen</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p>Noch keine Anwendung über OAuth verbunden.</p>
        )}
      </section>

      <section className="panel">
        <h2>Öffentliche Feeds</h2>
        <CopyField label="iCal-Abo" value={`${origin}/kalender.ics`} />
        <CopyField label="CSV" value={`${origin}/veranstaltungen.csv`} />
        <CopyField label="JSON" value={`${origin}/api/events`} />
        <CopyField label="RSS" value={`${origin}/feed.xml`} />
      </section>
    </section>
  );
}
