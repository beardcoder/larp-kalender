"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { applyFilters, filtersStore, positionStore } from "@/lib/client/state.ts";
import { useStore } from "@/lib/client/store.ts";
import { formatDate, monthName } from "@/lib/shared/format.ts";
import { useAppData } from "../AppData.tsx";
import { sealTone } from "../event-bits.tsx";
import { Icon } from "../Icon.tsx";
import { Cards } from "./EventList.tsx";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthParam = (y: number, m: number) => `${y}-${pad(m + 1)}`;

/** Month grid; the month is in the URL (?monat=2026-07), the filters of the list apply here too. */
export function CalendarView({ month }: { month?: string }) {
  const { events, today, newSince } = useAppData();
  const filters = useStore(filtersStore);
  const origin = useStore(positionStore);
  const [year, m1] = (month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7)).split("-").map(Number) as [number, number];
  const m = m1 - 1;
  const [selected, setSelected] = useState<string | null>(null);

  const visible = useMemo(() => applyFilters(events, filters, origin, newSince), [events, filters, origin, newSince]);
  const cells = useMemo(() => {
    const offset = (new Date(year, m, 1).getDay() + 6) % 7; // Monday first
    const total = Math.ceil((offset + new Date(year, m + 1, 0).getDate()) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(year, m, 1 - offset + i);
      const date = iso(d);
      return { date, day: d.getDate(), inMonth: d.getMonth() === m, weekStart: i % 7 === 0, events: visible.filter((e) => e.startDate <= date && e.endDate >= date) };
    });
  }, [year, m, visible]);

  const first = iso(new Date(year, m, 1));
  const last = iso(new Date(year, m + 1, 0));
  const listed = visible.filter((e) => (selected ? e.startDate <= selected && e.endDate >= selected : e.startDate <= last && e.endDate >= first));
  const prev = new Date(year, m - 1, 1);
  const next = new Date(year, m + 1, 1);

  return (
    <section className="view view-calendar" aria-labelledby="cal-heading">
      <header className="view-head cal-head">
        <h1 id="cal-heading" className="view-title">
          {monthName(m)} <span className="year">{year}</span>
        </h1>
        <div className="cal-nav">
          <Link className="icon-btn" href={`/kalender?monat=${monthParam(prev.getFullYear(), prev.getMonth())}`} replace aria-label="Vorheriger Monat" onClick={() => setSelected(null)}>
            <Icon name="back" />
          </Link>
          <Link className="btn ghost small" href="/kalender" replace onClick={() => setSelected(null)}>
            Heute
          </Link>
          <Link className="icon-btn" href={`/kalender?monat=${monthParam(next.getFullYear(), next.getMonth())}`} replace aria-label="Nächster Monat" onClick={() => setSelected(null)}>
            <Icon name="next" />
          </Link>
        </div>
      </header>

      <div className="grid" role="grid" aria-label={`${monthName(m)} ${year}`}>
        {WEEKDAYS.map((w) => (
          <div className="grid-wd" role="columnheader" key={w}>
            {w}
          </div>
        ))}
        {cells.map((c) => (
          <button
            key={c.date}
            role="gridcell"
            className={`day${c.inMonth ? "" : " is-out"}${c.date === today ? " is-today" : ""}${c.date === selected ? " is-selected" : ""}`}
            onClick={() => setSelected(c.date === selected ? null : c.date)}
            aria-label={`${formatDate(c.date, true)}: ${c.events.length ? `${c.events.length} Veranstaltung${c.events.length > 1 ? "en" : ""}` : "keine Veranstaltungen"}`}
            aria-pressed={c.date === selected}
          >
            <span className="day-num">{c.day}</span>
            <span className="day-events">
              {c.events.slice(0, 3).map((e) => (
                <span key={e.id} className={`bar tone-${sealTone(e, today)}${e.startDate === c.date ? " is-start" : ""}${e.endDate === c.date ? " is-end" : ""}`} title={e.title}>
                  <span className="bar-label">{e.startDate === c.date || c.weekStart ? e.title : ""}</span>
                </span>
              ))}
              {c.events.length > 3 ? <span className="more">+{c.events.length - 3}</span> : null}
            </span>
          </button>
        ))}
      </div>

      <p className="legend">
        <span className="tone tone-open" /> Anmeldung offen <span className="tone tone-soon" /> bald / Warteliste <span className="tone tone-closed" /> geschlossen / unbekannt
      </p>

      <div className="day-list">
        <h2 className="month-head">
          {selected ? formatDate(selected, true) : `Alle im ${monthName(m)}`}
          <span className="count-inline">{listed.length}</span>
        </h2>
        {listed.length ? <Cards events={listed} /> : <p className="muted">{selected ? "An diesem Tag ist nichts eingetragen." : "In diesem Monat ist nichts eingetragen."}</p>}
      </div>
    </section>
  );
}
