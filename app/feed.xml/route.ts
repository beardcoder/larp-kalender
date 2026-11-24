import { getApp } from "@/lib/server/app.ts";
import { listPublicEvents } from "@/lib/server/events.ts";
import { renderRss } from "@/lib/server/feeds.ts";
import { baseOf, cached } from "@/lib/server/http.ts";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return cached(
    request,
    () => {
      const events = listPublicEvents(getApp().db, { statuses: ["published"], limit: 2000 })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 50);
      return renderRss(events, baseOf(request));
    },
    { "content-type": "application/rss+xml; charset=utf-8" },
  );
}
