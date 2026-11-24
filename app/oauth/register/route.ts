import { getApp } from "@/lib/server/app.ts";
import { ipOf, json } from "@/lib/server/http.ts";
import { handleRegister } from "@/lib/server/oauth.ts";
import { limits } from "@/lib/server/rate-limit.ts";

export function POST(request: Request) {
  if (!limits.oauthRegister!.allow(ipOf(request))) return json({ error: "slow_down", error_description: "Too many registrations." }, 429);
  return handleRegister(getApp().db, request);
}
