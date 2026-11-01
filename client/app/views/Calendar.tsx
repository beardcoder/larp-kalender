import { useMemo, useState } from "preact/hooks";
import type { LarpEvent } from "../../../src/shared/types.ts";
import { formatDate, monthName } from "../../../src/shared/format.ts";
import { useStore } from "../../lib/store.ts";
import { navigate, useLocation } from "../../lib/router.ts";
import { EventCard, Icon, sealTone } from "../components.tsx";
import { applyFilters, eventsStore, favoritesStore, filtersStore, positionStore } from "../state.ts";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

export function CalendarView() {
  const { events, today } = useStore(eventsStore);
  const filters = useStore(filtersStore);
  const favorites = useStore(favoritesStore);
  const position = useStore(positionStore);
  const loc = useLocation();

  const monthParam = loc.query.get("monat");
  const [year, month] = (monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : today.slice(0, 7)).split("-").map(Number) as [number, number];
  const m = month - 1;
  const [selected, setSelected] = useState<string | null>(null);

  const visible = useMemo(() => applyFilters(events, filters, position), [events, filters, position]);

  const cells = useMemo(() => {
    const first = new Date(year, m, 1);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const out: { date: string; day: number; inMonth: boolean; weekStart: boolean; events: LarpEvent[] }[] = [];
    const total = Math.ceil((offset + daysInMonth) / 7) * 7;
    for (let i = 0; i < total; i++) {
      const d = new Date(year, m, 1 - offset + i);
      const date = iso(d.getFullYear(), d.getMonth(), d.getDate());
      out.push({
        date,
        day: d.getDate(),
        inMonth: d.getMonth() === m,
        weekStart: i % 7 === 0,
        events: visible.filter((e) => e.startDate <= date && e.endDate >= date),
      });
    }
    return out;
  }, [year, m, visible]);

  const go = (delta: number) => {
    const d = new Date(year, m + delta, 1);
    setSelected(null);
    navigate(`/kalender?monat=${d.getFullYear()}-${pad(d.getMonth() + 1)}`, { replace: true });
  };

  const monthEvents = visible.filter((e) => e.startDate <= iso(year, m, 31) && e.endDate >= iso(year, m, 1));
  const dayEvents = selected ? visible.filter((e) => e.startDate <= selected && e.endDate >= selected) : monthEvents;

  return (
    <section class="view view-calendar" aria-labelledby="cal-heading">
      <header class="view-head cal-head">
        <h1 id="cal-heading" class="view-title">
          {monthName(m)} <span class="year">{year}</span>
        </h1>
        <div class="cal-nav">
          <button class="icon-btn" onClick={() => go(-1)} aria-label="Vorheriger Monat">
            <Icon name="back" />
          </button>
          <button class="btn ghost small" onClick={() => (setSelected(null), navigate("/kalender", { replace: true }))}>
            Heute
          </button>
          <button class="icon-btn" onClick={() => go(1)} aria-label="Nächster Monat">
            <Icon name="next" />
          </button>
        </div>
      </header>

      <div class="grid" role="grid" aria-label={`${monthName(m)} ${year}`}>
        {WEEKDAYS.map((w) => (
          <div class="grid-wd" role="columnheader" key={w}>
            {w}
          </div>
        ))}
        {cells.map((c) => (
          <button
            key={c.date}
            role="gridcell"
            class={`day${c.inMonth ? "" : " is-out"}${c.date === today ? " is-today" : ""}${c.date === selected ? " is-selected" : ""}${c.events.length ? " has-events" : ""}`}
            onClick={() => setSelected(c.date === selected ? null : c.date)}
            aria-label={`${formatDate(c.date, true)}: ${c.events.length ? `${c.events.length} Veranstaltung${c.events.length > 1 ? "en" : ""}` : "keine Veranstaltungen"}`}
            aria-pressed={c.date === selected}
          >
            <span class="day-num">{c.day}</span>
            <span class="day-events">
              {c.events.slice(0, 3).map((e) => (
                <span
                  key={e.id}
                  class={`bar tone-${sealTone(e, today)}${e.startDate === c.date ? " is-start" : ""}${e.endDate === c.date ? " is-end" : ""}`}
                  title={e.title}
                >
                  <span class="bar-label">{e.startDate === c.date || c.weekStart ? e.title : ""}</span>
                </span>
              ))}
              {c.events.length > 3 ? <span class="more">+{c.events.length - 3}</span> : null}
            </span>
          </button>
        ))}
      </div>

      <p class="legend">
        <span class="tone tone-wax" /> Anmeldung offen <span class="tone tone-brass" /> bald / Warteliste <span class="tone tone-stone" /> geschlossen / unbekannt
      </p>

      <div class="day-list">
        <h2 class="month-head">
          {selected ? formatDate(selected, true) : `Alle im ${monthName(m)}`}
          <span class="count-inline">{dayEvents.length}</span>
        </h2>
        {dayEvents.length ? (
          <div class="cards">
            {dayEvents.map((e) => (
              <EventCard key={e.id} event={e} today={today} favorite={favorites.includes(e.id)} position={position} />
            ))}
          </div>
        ) : (
          <p class="muted">{selected ? "An diesem Tag ist nichts eingetragen." : "In diesem Monat ist nichts eingetragen."}</p>
        )}
      </div>
    </section>
  );
}
