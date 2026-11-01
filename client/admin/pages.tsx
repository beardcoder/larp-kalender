import { useEffect, useMemo, useState } from "preact/hooks";
import { formatDateRange } from "../../src/shared/format.ts";
import { useStore } from "../lib/store.ts";
import { useLocation, navigate } from "../lib/router.ts";
import { copyText, Icon } from "../app/components.tsx";
import { toast } from "../app/toast.tsx";
import { api, fmtDateTime, userStore, type AdminLarpEvent, type ApiToken, type Connection, type Meta, type User } from "./api.ts";

/* ---------- login ---------- */

export function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    const f = new FormData(e.target as HTMLFormElement);
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: User }>("/login", { method: "POST", body: { email: f.get("email"), password: f.get("password") } });
      userStore.set(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main class="login">
      <form class="form panel" onSubmit={(e) => void submit(e)}>
        <img src="/icons/icon.svg" alt="" width="56" height="56" />
        <h1 class="view-title">Redaktion</h1>
        <label>
          E-Mail
          <input name="email" type="email" autocomplete="username" required autofocus />
        </label>
        <label>
          Passwort
          <input name="password" type="password" autocomplete="current-password" required />
        </label>
        {error ? (
          <p class="error" role="alert">
            {error}
          </p>
        ) : null}
        <button class="btn primary big" disabled={busy}>
          {busy ? "Anmelden …" : "Anmelden"}
        </button>
        <a class="muted" href="/" data-native>
          Zurück zum Kalender
        </a>
      </form>
    </main>
  );
}

/* ---------- event list ---------- */

const TABS = [
  { key: "upcoming", label: "Kommend", query: "status=published,cancelled" },
  { key: "drafts", label: "Vorschläge & Entwürfe", query: "status=draft&past=1" },
  { key: "past", label: "Vergangen", query: "past=1&to=" },
] as const;

export function EventsPage({ meta, reloadMeta }: { meta: Meta; reloadMeta: () => void }) {
  const loc = useLocation();
  const tab = (loc.query.get("tab") ?? "upcoming") as (typeof TABS)[number]["key"];
  const [q, setQ] = useState("");
  const [events, setEvents] = useState<AdminLarpEvent[] | null>(null);

  useEffect(() => {
    setEvents(null);
    const t = TABS.find((x) => x.key === tab) ?? TABS[0];
    let query: string = t.query;
    if (tab === "past") {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      query = `past=1&to=${yesterday}`;
    }
    api<{ events: AdminLarpEvent[] }>(`/events?${query}`)
      .then((d) => setEvents(tab === "past" ? d.events.filter((e) => e.endDate < new Date().toISOString().slice(0, 10)) : d.events))
      .catch((e) => toast((e as Error).message));
  }, [tab]);

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (events ?? []).filter((e) => terms.every((t) => [e.title, e.city, e.organizer, e.venue].join(" ").toLowerCase().includes(t)));
  }, [events, q]);

  const quickStatus = async (e: AdminLarpEvent, status: string) => {
    await api(`/events/${e.id}`, { method: "PUT", body: { status } });
    setEvents((list) => (list ?? []).filter((x) => x.id !== e.id));
    reloadMeta();
    toast(status === "published" ? "Veröffentlicht" : "Gespeichert");
  };

  return (
    <section class="view">
      <header class="view-head admin-head">
        <h1 class="view-title">Veranstaltungen</h1>
        <a class="btn wax" href="/admin/veranstaltung/neu">
          <Icon name="plus" size={18} /> Neue Veranstaltung
        </a>
      </header>

      <div class="stats">
        <div>
          <strong>{meta.stats.upcoming}</strong>
          <span>kommend</span>
        </div>
        <div>
          <strong>{meta.stats.openRegistration}</strong>
          <span>Anmeldung offen</span>
        </div>
        <div>
          <strong>{meta.stats.drafts}</strong>
          <span>zu prüfen</span>
        </div>
        <div>
          <strong>{meta.pushSubscribers}</strong>
          <span>Push-Abos</span>
        </div>
      </div>

      <div class="admin-tabs" role="tablist">
        {TABS.map((t) => (
          <a key={t.key} role="tab" aria-selected={tab === t.key} class={tab === t.key ? "is-on" : ""} href={`/admin?tab=${t.key}`}>
            {t.label}
            {t.key === "drafts" && meta.stats.drafts ? <span class="badge">{meta.stats.drafts}</span> : null}
          </a>
        ))}
      </div>

      <label class="search">
        <Icon name="search" size={18} />
        <span class="sr-only">Suchen</span>
        <input type="search" placeholder="Titel, Ort, Veranstalter …" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </label>

      {events === null ? (
        <p class="muted">Lade …</p>
      ) : !filtered.length ? (
        <p class="muted">Keine Einträge.</p>
      ) : (
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Veranstaltung</th>
                <th>Anmeldung</th>
                <th>Quelle</th>
                <th>
                  <span class="sr-only">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} class={e.status === "cancelled" ? "is-cancelled" : ""}>
                  <td class="nowrap">{formatDateRange(e.startDate, e.endDate)}</td>
                  <td>
                    <a href={`/admin/veranstaltung/${e.id}`} class="row-title">
                      {e.title}
                    </a>
                    <span class="row-sub">
                      {[e.city, meta.vocab.eventTypes[e.eventType], e.status === "cancelled" ? "abgesagt" : ""].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td>
                    <span class={`status status-${e.registrationStatus}`}>{meta.vocab.registrationStatus[e.registrationStatus]}</span>
                    {!e.registrationUrl ? <span class="row-sub warn">kein Anmeldelink</span> : null}
                  </td>
                  <td>
                    <span class="row-sub">{e.source === "mcp" ? "KI" : e.source === "suggestion" ? "Vorschlag" : e.source === "api" ? "API" : "Backend"}</span>
                    <span class="row-sub">{e.createdByName ?? ""}</span>
                  </td>
                  <td class="nowrap">
                    {e.status === "draft" ? (
                      <button class="btn small wax" onClick={() => void quickStatus(e, "published")}>
                        Veröffentlichen
                      </button>
                    ) : (
                      <a class="btn small ghost" href={`/admin/veranstaltung/${e.id}`}>
                        Bearbeiten
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ---------- MCP / API connections ---------- */

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div class="copy-field">
      <span class="label">{label}</span>
      <div>
        <code>{value}</code>
        <button class="icon-btn" aria-label={`${label} kopieren`} onClick={() => void copyText(value).then((ok) => toast(ok ? "Kopiert" : "Kopieren nicht möglich"))}>
          <Icon name="copy" size={18} />
        </button>
      </div>
    </div>
  );
}

const schedulePrompt = (origin: string) => `Recherchiere LARP-Veranstaltungen in Deutschland, Österreich und der Schweiz für die nächsten 12 Monate, bei denen man sich als Spieler oder NSC anmelden kann, und pflege sie im LARP-Kalender (${origin}).

So gehst du vor:
1. Rufe im Connector „LARP-Kalender“ zuerst list_events auf, damit du weißt, was schon eingetragen ist.
2. Suche im Web nach neuen und geänderten Veranstaltungen: Veranstalter-Websites, LARP-Terminkalender und -Portale, Vereinsseiten, Foren und Social Media.
3. Trage neue Veranstaltungen mit create_events ein. Wichtig: Titel, Datum (YYYY-MM-DD), Ort (PLZ, Stadt, Bundesland, Land), Genres, Art, direkter Anmeldelink (registrationUrl), Anmeldestatus, Preise, Mindestalter, Veranstalter, eine kurze deutsche Beschreibung (summary) und die Quelle (sourceUrl).
4. Wenn create_events eine Veranstaltung als bereits vorhanden meldet, prüfe die Angaben und aktualisiere sie bei Änderungen mit update_event (z. B. Anmeldung jetzt offen, ausgebucht, abgesagt, neue Preise).
5. Erfinde keine Daten. Lass unbekannte Felder leer.

Fasse am Ende kurz zusammen: wie viele neu eingetragen, welche aktualisiert, welche übersprungen.`;

export function ConnectPage() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const origin = location.origin;
  const mcpUrl = `${origin}/mcp`;

  const load = () =>
    api<{ tokens: ApiToken[]; connections: Connection[] }>("/tokens").then((d) => {
      setTokens(d.tokens);
      setConnections(d.connections);
    });
  useEffect(() => void load(), []);

  const create = async (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const name = new FormData(form).get("name");
    const { token } = await api<{ token: string }>("/tokens", { method: "POST", body: { name } });
    setFresh(token);
    form.reset();
    void load();
  };

  return (
    <section class="view">
      <header class="view-head">
        <h1 class="view-title">KI & Schnittstellen</h1>
        <p class="view-lead">Verbinde Claude oder ChatGPT mit dem Kalender. Die KI kann dann Veranstaltungen suchen, eintragen und aktualisieren – in deinem Namen.</p>
      </header>

      <section class="panel">
        <h2>MCP-Server</h2>
        <CopyField label="Server-URL" value={mcpUrl} />
        <p>Die Anmeldung läuft über OAuth: Beim Verbinden öffnet sich ein Fenster, in dem du dich mit deinem Redaktionszugang anmeldest und den Zugriff erlaubst.</p>
      </section>

      <section class="panel steps">
        <h2>ChatGPT mit geplanter Aufgabe</h2>
        <ol>
          <li>In ChatGPT unter Einstellungen → Apps & Konnektoren → Erweitert den Entwicklermodus aktivieren.</li>
          <li>„Konnektor erstellen“: Name „LARP-Kalender“, Server-URL von oben, Authentifizierung OAuth. Danach anmelden und Zugriff erlauben.</li>
          <li>Neuen Chat starten, den Konnektor aktivieren und diese Aufgabe einplanen, z. B. „wöchentlich montags um 7 Uhr“:</li>
        </ol>
        <pre class="prompt">{schedulePrompt(origin)}</pre>
        <button class="btn ghost small" onClick={() => void copyText(schedulePrompt(origin)).then(() => toast("Prompt kopiert"))}>
          <Icon name="copy" size={16} /> Prompt kopieren
        </button>
      </section>

      <section class="panel steps">
        <h2>Claude</h2>
        <ol>
          <li>claude.ai: Einstellungen → Konnektoren → „Benutzerdefinierten Konnektor hinzufügen“, Server-URL eintragen, verbinden.</li>
          <li>Claude Code (Terminal):</li>
        </ol>
        <CopyField label="Befehl" value={`claude mcp add --transport http --scope user larp-kalender ${mcpUrl}`} />
        <p>Ohne OAuth geht es auch mit einem API-Token: <code>--header "Authorization: Bearer lk_…"</code></p>
      </section>

      <section class="panel">
        <h2>API-Tokens</h2>
        <p>Für Skripte und KI-Clients, die feste Header statt OAuth nutzen. Ein Token gilt wie dein Login – gib ihn nicht weiter.</p>
        {fresh ? (
          <div class="notice">
            <p>
              <strong>Neuer Token – jetzt kopieren, er wird nur einmal angezeigt:</strong>
            </p>
            <CopyField label="Token" value={fresh} />
          </div>
        ) : null}
        <form class="inline-form" onSubmit={(e) => void create(e)}>
          <input name="name" placeholder="Wofür? z. B. „Import-Skript“" required minLength={2} />
          <button class="btn primary small">Token erstellen</button>
        </form>
        {tokens.length ? (
          <ul class="token-list">
            {tokens.map((t) => (
              <li key={t.id}>
                <div>
                  <strong>{t.name}</strong>
                  <span class="row-sub">
                    {t.prefix}… · erstellt {fmtDateTime(t.createdAt)} · zuletzt genutzt {fmtDateTime(t.lastUsedAt)}
                  </span>
                </div>
                <button
                  class="btn ghost small danger"
                  onClick={() => {
                    if (window.confirm(`Token „${t.name}“ widerrufen?`)) void api(`/tokens/${t.id}`, { method: "DELETE" }).then(load);
                  }}
                >
                  Widerrufen
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section class="panel">
        <h2>Verbundene Anwendungen</h2>
        {connections.length ? (
          <ul class="token-list">
            {connections.map((c) => (
              <li key={c.clientId}>
                <div>
                  <strong>{c.name}</strong>
                  <span class="row-sub">
                    verbunden {fmtDateTime(c.createdAt)} · zuletzt aktiv {fmtDateTime(c.lastUsedAt)}
                  </span>
                </div>
                <button
                  class="btn ghost small danger"
                  onClick={() => {
                    if (window.confirm(`Zugriff für „${c.name}“ entziehen?`)) void api(`/connections/${encodeURIComponent(c.clientId)}`, { method: "DELETE" }).then(load);
                  }}
                >
                  Trennen
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>Noch keine Anwendung über OAuth verbunden.</p>
        )}
      </section>

      <section class="panel">
        <h2>Öffentliche Feeds</h2>
        <CopyField label="iCal-Abo" value={`${origin}/kalender.ics`} />
        <CopyField label="CSV" value={`${origin}/veranstaltungen.csv`} />
        <CopyField label="JSON" value={`${origin}/api/events`} />
        <CopyField label="RSS" value={`${origin}/feed.xml`} />
      </section>
    </section>
  );
}

/* ---------- users ---------- */

export function UsersPage({ meta }: { meta: Meta }) {
  const me = useStore(userStore);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = () => api<{ users: User[] }>("/users").then((d) => setUsers(d.users));
  useEffect(() => void load(), []);

  const create = async (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const f = Object.fromEntries(new FormData(form));
    setError(null);
    try {
      await api("/users", { method: "POST", body: f });
      form.reset();
      toast("Benutzer angelegt");
      void load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const update = async (u: User, patch: Partial<User> & { password?: string }) => {
    try {
      await api(`/users/${u.id}`, { method: "PUT", body: patch });
      toast("Gespeichert");
      void load();
    } catch (err) {
      toast((err as Error).message);
    }
  };

  return (
    <section class="view">
      <header class="view-head">
        <h1 class="view-title">Benutzer</h1>
        <p class="view-lead">Redaktion darf Veranstaltungen pflegen und KI-Clients verbinden. Administratoren verwalten zusätzlich Benutzer.</p>
      </header>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Rolle</th>
              <th>Letzte Anmeldung</th>
              <th>
                <span class="sr-only">Aktionen</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} class={u.disabled ? "is-cancelled" : ""}>
                <td>
                  <span class="row-title">{u.name}</span>
                  <span class="row-sub">{u.email}</span>
                </td>
                <td>
                  <select value={u.role} disabled={u.id === me?.id} onChange={(e) => void update(u, { role: (e.target as HTMLSelectElement).value as User["role"] })}>
                    {Object.entries(meta.vocab.roles).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span class="row-sub">{fmtDateTime(u.lastLoginAt)}</span>
                </td>
                <td class="nowrap">
                  {u.id !== me?.id ? (
                    <>
                      <button
                        class="btn ghost small"
                        onClick={() => {
                          const pw = window.prompt(`Neues Passwort für ${u.name} (mind. 10 Zeichen):`);
                          if (pw) void update(u, { password: pw });
                        }}
                      >
                        Passwort
                      </button>{" "}
                      <button class="btn ghost small" onClick={() => void update(u, { disabled: !u.disabled })}>
                        {u.disabled ? "Aktivieren" : "Sperren"}
                      </button>{" "}
                      <button
                        class="btn ghost small danger"
                        onClick={() => {
                          if (window.confirm(`${u.name} löschen? Veranstaltungen bleiben erhalten.`))
                            void api(`/users/${u.id}`, { method: "DELETE" }).then(load);
                        }}
                      >
                        Löschen
                      </button>
                    </>
                  ) : (
                    <span class="row-sub">Das bist du</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form class="form panel narrow" onSubmit={(e) => void create(e)}>
        <h2>Benutzer hinzufügen</h2>
        <label>
          Name
          <input name="name" required minLength={2} />
        </label>
        <label>
          E-Mail
          <input name="email" type="email" required />
        </label>
        <label>
          Startpasswort (mind. 10 Zeichen)
          <input name="password" type="text" required minLength={10} autocomplete="new-password" />
        </label>
        <label>
          Rolle
          <select name="role">
            {Object.entries(meta.vocab.roles).map(([k, v]) => (
              <option key={k} value={k} selected={k === "editor"}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {error ? <p class="error">{error}</p> : null}
        <button class="btn primary">Anlegen</button>
      </form>
    </section>
  );
}

/* ---------- profile ---------- */

export function ProfilePage() {
  const me = useStore(userStore)!;
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: Event) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    setError(null);
    try {
      const { user } = await api<{ user: User }>("/me", { method: "PUT", body: f });
      userStore.set(user);
      form.querySelectorAll<HTMLInputElement>("input[type=password]").forEach((i) => (i.value = ""));
      toast("Gespeichert");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const logout = async () => {
    await api("/logout", { method: "POST" });
    userStore.set(null);
    navigate("/admin");
  };
  return (
    <section class="view">
      <header class="view-head">
        <h1 class="view-title">Profil</h1>
      </header>
      <form class="form panel narrow" onSubmit={(e) => void submit(e)}>
        <label>
          Name
          <input name="name" defaultValue={me.name} required minLength={2} />
        </label>
        <label>
          E-Mail
          <input value={me.email} disabled />
        </label>
        <label>
          Aktuelles Passwort
          <input name="currentPassword" type="password" autocomplete="current-password" />
        </label>
        <label>
          Neues Passwort (mind. 10 Zeichen)
          <input name="password" type="password" minLength={10} autocomplete="new-password" />
        </label>
        {error ? <p class="error">{error}</p> : null}
        <button class="btn primary">Speichern</button>
      </form>
      <button class="btn ghost" onClick={() => void logout()}>
        Abmelden
      </button>
    </section>
  );
}
