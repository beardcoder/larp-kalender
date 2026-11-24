import { getApp } from "@/lib/server/app.ts";
import { json } from "@/lib/server/http.ts";

export async function POST(request: Request) {
  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (endpoint) getApp().push.unsubscribe(endpoint);
  return json({ ok: true });
}
