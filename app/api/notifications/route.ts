import { getApp } from "@/lib/server/app.ts";
import { today } from "@/lib/server/events.ts";
import { cached } from "@/lib/server/http.ts";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const { push } = getApp();
  return cached(request, () => ({ items: push.activity(), today: today() }), { "content-type": "application/json" }, push.activityVersion());
}
