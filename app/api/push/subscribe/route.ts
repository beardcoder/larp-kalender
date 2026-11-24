import { getApp } from "@/lib/server/app.ts";
import { ipOf, json, zodMessage } from "@/lib/server/http.ts";
import { subscriptionSchema } from "@/lib/server/push.ts";
import { limits } from "@/lib/server/rate-limit.ts";

export async function POST(request: Request) {
  if (!limits.push!.allow(ipOf(request))) return json({ error: "Zu viele Anfragen." }, 429);
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: zodMessage(parsed.error) }, 400);
  if (!getApp().push.subscribe(parsed.data)) return json({ error: "Benachrichtigungen sind gerade nicht verfügbar." }, 503);
  return json({ ok: true });
}
