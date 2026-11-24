import { getApp } from "@/lib/server/app.ts";
import { listPublicEvents, today } from "@/lib/server/events.ts";
import { cached, filterFromQuery } from "@/lib/server/http.ts";

export const dynamic = "force-dynamic";

/** Public JSON API (also used by external widgets, hence CORS in next.config). */
export function GET(request: Request) {
  const filter = filterFromQuery(new URL(request.url).searchParams);
  return cached(request, () => ({ events: listPublicEvents(getApp().db, filter), today: today() }), { "content-type": "application/json" });
}
