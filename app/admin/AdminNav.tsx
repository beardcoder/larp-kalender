"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon.tsx";

const NAV: { path: string; label: string; icon: IconName; adminOnly?: boolean }[] = [
  { path: "/admin", label: "Veranstaltungen", icon: "list" },
  { path: "/admin/verbindungen", label: "KI & Schnittstellen", icon: "link" },
  { path: "/admin/benutzer", label: "Benutzer", icon: "users", adminOnly: true },
  { path: "/admin/profil", label: "Profil", icon: "flag" },
];

export function AdminNav({ isAdmin, drafts, variant }: { isAdmin: boolean; drafts: number; variant: "side" | "top" }) {
  const path = usePathname();
  const active = (p: string) => (p === "/admin" ? path === "/admin" || path.startsWith("/admin/veranstaltung") : path.startsWith(p));
  return (
    <nav className={variant === "side" ? "side-nav" : "admin-topnav"} aria-label="Redaktion">
      {NAV.filter((n) => !n.adminOnly || isAdmin).map((n) => (
        <Link key={n.path} href={n.path} className={active(n.path) ? "is-active" : ""} aria-current={active(n.path) ? "page" : undefined}>
          <Icon name={n.icon} size={variant === "side" ? 20 : 18} />
          <span>{n.label}</span>
          {variant === "side" && n.path === "/admin" && drafts ? <span className="badge">{drafts}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
