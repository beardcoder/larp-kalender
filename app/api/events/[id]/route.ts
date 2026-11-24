import { getApp } from "@/lib/server/app.ts";
import { toPublicEvent } from "@/lib/server/events.ts";
import { json } from "@/lib/server/http.ts";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const e = getApp().getEvent((await params).id);
  return e && e.status !== "draft" ? json({ event: toPublicEvent(e) }) : json({ error: "Nicht gefunden." }, 404);
}
