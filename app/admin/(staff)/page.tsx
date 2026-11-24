import Link from "next/link";
import { Icon } from "@/components/Icon.tsx";
import { getApp } from "@/lib/server/app.ts";
import { addDays, eventStats, listAdminEvents, today, type EventFilter } from "@/lib/server/events.ts";
import { formatDateRange } from "@/lib/shared/format.ts";
import { EVENT_TYPES, REGISTRATION_STATUS } from "@/lib/shared/vocab.ts";
import { publishEvent } from "../actions.ts";

const TABS = {
  upcoming: { label: "Kommend", filter: (): EventFilter => ({ statuses: ["published", "cancelled"] }) },
  drafts: { label: "Vorschläge & Entwürfe", filter: (): EventFilter => ({ statuses: ["draft"], includePast: true }) },
  past: { label: "Vergangen", filter: (): EventFilter => ({ includePast: true, to: addDays(today(), -1), order: "desc" }) },
} as const;

const SOURCE: Record<string, string> = { mcp: "KI", suggestion: "Vorschlag", api: "API", manual: "Backend" };

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string }> }) {
  const { tab: tabParam, q } = await searchParams;
  const tab = (tabParam && tabParam in TABS ? tabParam : "upcoming") as keyof typeof TABS;
  const { db, push } = getApp();
  const stats = eventStats(db);
  let events = listAdminEvents(db, { ...TABS[tab].filter(), q, limit: 1000 });
  if (tab === "past") events = events.filter((e) => e.endDate < today());

  return (
    <section className="view">
      <header className="view-head admin-head">
        <h1 className="view-title">Veranstaltungen</h1>
        <Link className="btn accent" href="/admin/veranstaltung/neu">
          <Icon name="plus" size={18} /> Neue Veranstaltung
        </Link>
      </header>

      <div className="stats">
        <div>
          <strong>{stats.upcoming}</strong>
          <span>kommend</span>
        </div>
        <div>
          <strong>{stats.openRegistration}</strong>
          <span>Anmeldung offen</span>
        </div>
        <div>
          <strong>{stats.drafts}</strong>
          <span>zu prüfen</span>
        </div>
        <div>
          <strong>{push.count()}</strong>
          <span>Push-Abos</span>
        </div>
      </div>

      <div className="admin-tabs" role="tablist">
        {Object.entries(TABS).map(([key, t]) => (
          <Link key={key} role="tab" aria-selected={tab === key} className={tab === key ? "is-on" : ""} href={`/admin?tab=${key}`}>
            {t.label}
            {key === "drafts" && stats.drafts ? <span className="badge">{stats.drafts}</span> : null}
          </Link>
        ))}
      </div>

      <form className="search" action="/admin">
        <Icon name="search" size={18} />
        <input type="hidden" name="tab" value={tab} />
        <input type="search" name="q" placeholder="Titel, Ort, Veranstalter … (Enter)" defaultValue={q} aria-label="Suchen" />
      </form>

      {!events.length ? (
        <p className="muted">Keine Einträge.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Veranstaltung</th>
                <th>Anmeldung</th>
                <th>Quelle</th>
                <th>
                  <span className="sr-only">Aktionen</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className={e.status === "cancelled" ? "is-cancelled" : ""}>
                  <td className="nowrap">{formatDateRange(e.startDate, e.endDate)}</td>
                  <td>
                    <Link href={`/admin/veranstaltung/${e.id}`} className="row-title">
                      {e.title}
                    </Link>
                    <span className="row-sub">{[e.city, EVENT_TYPES[e.eventType], e.status === "cancelled" ? "abgesagt" : ""].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td>
                    <span className={`status status-${e.registrationStatus}`}>{REGISTRATION_STATUS[e.registrationStatus]}</span>
                    {!e.registrationUrl ? <span className="row-sub warn">kein Anmeldelink</span> : null}
                  </td>
                  <td>
                    <span className="row-sub">{SOURCE[e.source] ?? e.source}</span>
                    <span className="row-sub">{e.createdByName ?? ""}</span>
                  </td>
                  <td className="nowrap">
                    {e.status === "draft" ? (
                      <form action={publishEvent}>
                        <input type="hidden" name="id" value={e.id} />
                        <button className="btn small accent">Veröffentlichen</button>
                      </form>
                    ) : (
                      <Link className="btn small ghost" href={`/admin/veranstaltung/${e.id}`}>
                        Bearbeiten
                      </Link>
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
