/**
 * Reminders for bookmarked events, shared by the server (push) and the app (notification center),
 * so both always agree on what is due.
 */

import type { LarpEvent } from "./types.ts";
import { addDaysIso, daysBetween } from "./format.ts";

export type ReminderKind = "deadline" | "opens" | "start";

export interface Reminder {
  kind: ReminderKind;
  title: string;
  body: string;
  /** Day the reminder became due (ISO date), used for sorting and "unread" in the app. */
  since: string;
}

/** The reminder that is due today for an event, if any. */
export function reminderFor(e: LarpEvent, t: string): Reminder | null {
  if (e.status === "cancelled") return null; // announced as a change
  const open = ["open", "waitlist"].includes(e.registrationStatus);
  if (e.registrationDeadline && open) {
    const d = daysBetween(t, e.registrationDeadline);
    if (d >= 0 && d <= 3)
      return {
        kind: "deadline",
        title: d === 0 ? `Heute Anmeldeschluss: ${e.title}` : `Anmeldeschluss in ${d} ${d === 1 ? "Tag" : "Tagen"}`,
        body: `${e.title} – jetzt anmelden, solange es geht.`,
        since: addDaysIso(e.registrationDeadline, -3),
      };
  }
  if (
    e.registrationOpens &&
    e.registrationOpens <= t &&
    daysBetween(e.registrationOpens, t) <= 2 &&
    e.registrationStatus !== "closed" &&
    e.registrationStatus !== "sold_out"
  )
    return { kind: "opens", title: `Anmeldung offen: ${e.title}`, body: "Die Anmeldung ist gestartet.", since: e.registrationOpens };
  const until = daysBetween(t, e.startDate);
  if (until >= 0 && until <= 7)
    return {
      kind: "start",
      title: until === 0 ? `Heute geht's los: ${e.title}` : `In ${until} ${until === 1 ? "Tag" : "Tagen"}: ${e.title}`,
      body: [e.venue, e.city].filter(Boolean).join(", ") || "Gute Reise und viel Spaß im Spiel!",
      since: addDaysIso(e.startDate, -7),
    };
  return null;
}
