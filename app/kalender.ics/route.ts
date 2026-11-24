import { getApp } from "@/lib/server/app.ts";
import { getFavorites, userIdByFeedToken } from "@/lib/server/account.ts";
import { listPublicEvents } from "@/lib/server/events.ts";
import { renderIcs } from "@/lib/server/feeds.ts";
import { baseOf, cached, filterFromQuery } from "@/lib/server/http.ts";

export const dynamic = "force-dynamic";

/** Subscribable iCal feed; `feed=<token>` is the private bookmark feed of a member account. */
export function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const { db } = getApp();
  const f = filterFromQuery(q);
  // Subscriptions keep recently past events so they do not vanish from calendars right away.
  if (!f.from && !f.includePast) f.from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const feed = q.get("feed");
  if (feed) {
    const userId = userIdByFeedToken(db, feed);
    f.ids = userId ? getFavorites(db, userId) : [];
    if (!f.ids.length) f.ids = [-1];
  }
  const name = q.get("name")?.slice(0, 60) || (f.ids ? "LARP – Meine Merkliste" : "LARP-Kalender");
  return cached(request, () => renderIcs(listPublicEvents(db, f), { base: baseOf(request), name, deadlines: q.get("deadlines") === "1" }), {
    "content-type": "text/calendar; charset=utf-8",
    "content-disposition": 'inline; filename="larp-kalender.ics"',
  });
}
