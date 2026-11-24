import { getApp } from "@/lib/server/app.ts";
import { PlaceSearch } from "@/lib/server/geocode.ts";
import { ipOf, json } from "@/lib/server/http.ts";
import { limits } from "@/lib/server/rate-limit.ts";

const holder = globalThis as unknown as { __larpPlaces?: PlaceSearch };

/** Place search for the radius filter (postcode or town -> coordinates), proxied so visitor IPs stay here. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return json({ places: [] });
  if (!limits.places!.allow(ipOf(request))) return json({ error: "Zu viele Suchanfragen. Bitte später erneut versuchen." }, 429);
  holder.__larpPlaces ??= new PlaceSearch(getApp().cfg.contactEmail);
  try {
    return json({ places: await holder.__larpPlaces.search(q) });
  } catch (err) {
    console.warn("[places]", (err as Error).message);
    return json({ error: "Ortssuche gerade nicht erreichbar." }, 502);
  }
}
