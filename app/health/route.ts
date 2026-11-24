import { getApp } from "@/lib/server/app.ts";
import pkg from "@/package.json" with { type: "json" };

export const dynamic = "force-dynamic";

export function GET() {
  getApp();
  return Response.json({ ok: true, version: pkg.version, uptime: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1048576) });
}
