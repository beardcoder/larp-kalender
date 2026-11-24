import { getApp } from "@/lib/server/app.ts";
import { ipOf, json } from "@/lib/server/http.ts";
import { limits } from "@/lib/server/rate-limit.ts";

export async function POST(request: Request) {
  if (!limits.pushTest!.allow(ipOf(request))) return json({ ok: false });
  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
  return json({ ok: endpoint ? await getApp().push.test(endpoint) : false });
}
