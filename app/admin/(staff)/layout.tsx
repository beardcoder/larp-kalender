import Link from "next/link";
import { Toasts } from "@/components/Toasts.tsx";
import { getApp } from "@/lib/server/app.ts";
import { requireStaff } from "@/lib/server/auth.ts";
import { eventStats } from "@/lib/server/events.ts";
import pkg from "@/package.json" with { type: "json" };
import { AdminNav } from "../AdminNav.tsx";

export const dynamic = "force-dynamic";

/** Everything below /admin except the login page: staff only. */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const { drafts } = eventStats(getApp().db);
  const isAdmin = user.role === "admin";
  return (
    <div className="shell admin">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <img src="/icons/icon.svg" alt="" width={34} height={34} />
          <span>Redaktion</span>
        </Link>
        <AdminNav isAdmin={isAdmin} drafts={drafts} variant="side" />
        <p className="side-foot">
          {user.name} · v{pkg.version}
        </p>
      </aside>
      <AdminNav isAdmin={isAdmin} drafts={drafts} variant="top" />
      <main className="main">{children}</main>
      <Toasts />
    </div>
  );
}
