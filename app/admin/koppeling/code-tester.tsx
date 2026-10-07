"use client";

import Link from "next/link";
import { useState } from "react";
import StatusBadge from "@/components/status-badge";
import { euro } from "@/lib/format";

export default function CodeTester() {
  const [code, setCode] = useState("");
  const [amount, setAmount] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await fetch("/api/admin/check-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, amount }) });
    setRes(await r.json());
    setBusy(false);
  };

  const v = res?.voucher;
  return (
    <section className="panel">
      <h3 className="h3">Code testen</h3>
      <p className="muted small" style={{ marginTop: 0 }}>Controleer een code zoals de boekingsapp dat doet. Er wordt niets afgeboekt.</p>
      <form onSubmit={run} className="stack" style={{ gap: 10 }}>
        <input className="input" placeholder="TLP-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <input className="input" placeholder="Bedrag boeking (€) — optioneel" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button className="btn sm" disabled={busy || !code}>Controleren</button>
      </form>
      {res && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line-soft)" }}>
          {res.error ? (
            <p className="error-text">{res.error}</p>
          ) : !v ? (
            <p className="error-text">{res.message}</p>
          ) : (
            <div className="stack" style={{ gap: 6, fontSize: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="mono">{v.code}</span>
                <StatusBadge status={v.status} />
              </div>
              <div style={{ color: v.valid ? "var(--ok)" : "var(--danger)" }}>{v.message}</div>
              <div className="muted">Oorspronkelijk {euro(v.original_cents)} · rest {euro(v.remaining_cents)}</div>
              {v.booking_total_cents && (
                <div>Boeking {euro(v.booking_total_cents)} → verrekend {euro(v.applied_cents)} · <strong style={{ fontWeight: 500 }}>te betalen {euro(v.to_pay_cents)}</strong> · rest daarna {euro(v.remaining_after_cents)}</div>
              )}
              {res.orderId && <Link href={`/admin/orders/${res.orderId}`} className="small">Bestelling openen →</Link>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
