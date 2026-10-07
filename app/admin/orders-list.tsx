"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import StatusBadge from "@/components/status-badge";
import { customerName, dateNL, euro, PAYMENT_LABELS } from "@/lib/format";

const FILTERS: { key: string; label: string; statuses?: string[] }[] = [
  { key: "all", label: "Alle" },
  { key: "pending", label: "Open (nog niet betaald)", statuses: ["ordered", "awaiting_payment"] },
  { key: "ordered", label: "Besteld" },
  { key: "awaiting_payment", label: "Wacht op betaling" },
  { key: "active", label: "Actief" },
  { key: "partially_used", label: "Deels gebruikt" },
  { key: "used", label: "Volledig gebruikt" },
  { key: "blocked", label: "Geblokkeerd" },
  { key: "cancelled", label: "Geannuleerd" },
];
const PAGE = 50;

function List() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ rows: any[]; total: number; counts: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleted, setDeleted] = useState<string | null>(params.get("deleted"));
  useEffect(() => {
    if (!deleted) return;
    const t = setTimeout(() => setDeleted(null), 4000);
    return () => clearTimeout(t);
  }, [deleted]);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const sp = new URLSearchParams();
      if (q) sp.set("q", q);
      if (status !== "all") sp.set("status", status);
      router.replace(`/admin${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
      sp.set("offset", String(offset));
      sp.set("limit", String(PAGE));
      const res = await fetch(`/api/admin/orders?${sp}`);
      if (res.status === 401) return router.replace("/admin/login");
      setData(await res.json());
      setLoading(false);
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, offset]);

  const counts = data?.counts ?? {};
  const count = (f: (typeof FILTERS)[number]) =>
    f.key === "all" ? Object.values(counts).reduce((a, b) => a + b, 0) : (f.statuses ?? [f.key]).reduce((a, s) => a + (counts[s] ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Overzicht</div>
          <h1 className="h1">Bestellingen</h1>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a className="btn ghost sm" href="/api/admin/export">Export (CSV)</a>
          <Link className="btn sm" href="/admin/new">+ Nieuwe cadeaubon</Link>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="k">Wacht op actie</div><div className="v">{(counts.ordered ?? 0) + (counts.awaiting_payment ?? 0)}</div></div>
        <div className="stat"><div className="k">Actief</div><div className="v">{(counts.active ?? 0) + (counts.partially_used ?? 0)}</div></div>
        <div className="stat"><div className="k">Volledig gebruikt</div><div className="v">{counts.used ?? 0}</div></div>
        <div className="stat"><div className="k">Totaal bonnen</div><div className="v">{count(FILTERS[0])}</div></div>
      </div>

      <div className="toolbar">
        <input
          className="input"
          type="search"
          placeholder="Zoek op naam, e-mail, bestelnummer, code of bedrijf…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOffset(0); }}
          aria-label="Zoeken"
        />
      </div>
      <div className="filters" role="group" aria-label="Filter op status">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className="filter" aria-pressed={status === f.key} onClick={() => { setStatus(f.key); setOffset(0); }}>
            {f.label} <span className="c">{count(f)}</span>
          </button>
        ))}
      </div>

      <div className="table-wrap">
        {!data && loading ? (
          <div className="empty">Laden…</div>
        ) : data && data.rows.length === 0 ? (
          <div className="empty">
            {q || status !== "all" ? "Geen bestellingen gevonden met deze zoekopdracht." : "Nog geen bestellingen. Zodra iemand een cadeaubon bestelt, verschijnt die hier."}
          </div>
        ) : (
          <table className="list" style={{ opacity: loading ? 0.6 : 1 }}>
            <thead>
              <tr>
                <th>Bestelling</th>
                <th>Klant</th>
                <th className="hide-m">Ontvanger</th>
                <th>Code</th>
                <th className="num">Waarde</th>
                <th className="num">Rest</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r) => (
                <tr key={r.id} onClick={() => router.push(`/admin/orders/${r.id}`)}>
                  <td>
                    <Link href={`/admin/orders/${r.id}`} onClick={(e) => e.stopPropagation()} style={{ color: "var(--text)" }}>{r.order_number}</Link>
                    <div className="sub">{dateNL(r.created_at)}{r.source === "admin" ? " · handmatig" : ""}</div>
                  </td>
                  <td>
                    {customerName(r)}
                    <div className="sub">{r.customer_type === "business" ? "Zakelijk · " : ""}{r.email}</div>
                  </td>
                  <td className="hide-m">{r.recipient_name || <span className="faint">—</span>}</td>
                  <td className="code">{r.code}</td>
                  <td className="num">{euro(r.original_cents)}</td>
                  <td className="num">{euro(r.remaining_cents)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                    <div className="sub" style={{ marginTop: 4 }}>{PAYMENT_LABELS[r.payment_status]}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {deleted && <div className="toast" role="status">Bestelling {deleted} is verwijderd.</div>}
      {data && data.total > PAGE && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <span className="muted small">{offset + 1}–{Math.min(offset + PAGE, data.total)} van {data.total}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn ghost sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Vorige</button>
            <button className="btn ghost sm" disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>Volgende</button>
          </div>
        </div>
      )}
    </>
  );
}

export default function OrdersList() {
  return (
    <Suspense>
      <List />
    </Suspense>
  );
}
