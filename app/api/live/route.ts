import { getApp } from "@/lib/server/app.ts";

export const dynamic = "force-dynamic";

/** Server-Sent Events: hints for open app windows to refresh. */
export function GET(request: Request) {
  return getApp().live.stream(request);
}
