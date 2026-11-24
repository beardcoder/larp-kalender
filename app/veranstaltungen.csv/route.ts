import { getApp } from "@/lib/server/app.ts";
import { listPublicEvents, today } from "@/lib/server/events.ts";
import { renderCsv } from "@/lib/server/feeds.ts";
import { baseOf, cached, filterFromQuery } from "@/lib/server/http.ts";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  return cached(request, () => renderCsv(listPublicEvents(getApp().db, filterFromQuery(q)), baseOf(request), q.get("sep") === "," ? "," : ";"), {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="larp-veranstaltungen-${today()}.csv"`,
  });
}
