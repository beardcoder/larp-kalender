import { getApp } from "@/lib/server/app.ts";
import { toPublicEvent } from "@/lib/server/events.ts";
import { renderIcs } from "@/lib/server/feeds.ts";
import { baseOf } from "@/lib/server/http.ts";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const e = getApp().getEvent((await params).slug);
  if (!e || e.status === "draft") return new Response("Nicht gefunden.", { status: 404 });
  return new Response(renderIcs([toPublicEvent(e)], { base: baseOf(request), name: e.title, deadlines: true }), {
    headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${e.slug}.ics"` },
  });
}
