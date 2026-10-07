"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/admin", label: "Bestellingen" },
  { href: "/admin/new", label: "Nieuwe bon" },
  { href: "/admin/koppeling", label: "Koppeling" },
  { href: "/admin/settings", label: "Instellingen" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
  };
  return (
    <>
      <header className="adm-top">
        <Link href="/admin" className="adm-brand">
          <span className="eyebrow" style={{ color: "var(--text)", letterSpacing: ".38em" }}>The Light Portraits</span>
          <span className="adm-sub">Cadeaubonnen · Backoffice</span>
        </Link>
        <nav className="adm-nav">
          {NAV.map((n) => {
            const active = n.href === "/admin" ? path === "/admin" || path.startsWith("/admin/orders") : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={active ? "is-active" : ""}>
                {n.label}
              </Link>
            );
          })}
          <button type="button" onClick={logout} className="adm-logout">Uitloggen</button>
        </nav>
      </header>
      <main className="adm-main">{children}</main>
    </>
  );
}
