"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/status-badge";
import { customerName, dateNL, euro, PAYMENT_LABELS, REDEMPTION_LABELS, STATUS_LABELS, VOUCHER_STATUSES } from "@/lib/format";

type Detail = {
  order: any;
  voucher: any;
  redemptions: any[];
  events: any[];
  emails: any[];
  emailConfigured: boolean;
  customerPdfLink: string | null;
};

type Ask = {
  title: string;
  text: string;
  confirm: string;
  danger?: boolean;
  input?: { label: string; placeholder?: string };
  check?: { label: string; default: boolean };
  run: (input: string, checked: boolean) => Promise<void>;
};

export default function OrderDetail({ id }: { id: string }) {
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [askInput, setAskInput] = useState("");
  const [askCheck, setAskCheck] = useState(true);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ recipientName: "", recipientEmail: "", fromName: "", personalMessage: "" });
  const [notes, setNotes] = useState("");
  const [redeem, setRedeem] = useState({ amount: "", description: "", bookingRef: "" });
  const [showRedeem, setShowRedeem] = useState(false);
  const [expiry, setExpiry] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/orders/${id}`);
    if (res.status === 401) return router.replace("/admin/login");
    if (res.status === 404) return setNotFound(true);
    const data: Detail = await res.json();
    setD(data);
    setNotes(data.order.admin_notes ?? "");
    setExpiry(data.voucher?.expires_at ? new Date(data.voucher.expires_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" }) : "");
    setEdit({
      recipientName: data.voucher?.recipient_name ?? "",
      recipientEmail: data.voucher?.recipient_email ?? "",
      fromName: data.voucher?.from_name ?? "",
      personalMessage: data.voucher?.personal_message ?? "",
    });
  }, [id, router]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(t);
  }, [toast]);

  const post = async (url: string, body: any, okMsg: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Er ging iets mis.");
      let msg = okMsg;
      if (data.email === "sent") msg += " E-mail met PDF verstuurd.";
      if (data.email === "skipped") msg += " (E-mail niet verstuurd: SMTP nog niet ingesteld.)";
      if (data.email === "failed") msg += " Let op: e-mail versturen is mislukt.";
      setToast({ msg });
      await load();
      return true;
    } catch (e: any) {
      setToast({ msg: e.message, err: true });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const action = (body: any, okMsg: string) => post(`/api/admin/orders/${id}`, body, okMsg);

  const openAsk = (a: Ask) => {
    setAskInput("");
    setAskCheck(a.check?.default ?? true);
    setAsk(a);
  };

  if (notFound) return <div className="empty">Bestelling niet gevonden. <Link href="/admin">Terug naar overzicht</Link></div>;
  if (!d) return <div className="empty">Laden…</div>;

  const { order: o, voucher: v } = d;
  const s = v?.status as string;
  const unpaid = s === "ordered" || s === "awaiting_payment";
  const inUse = s === "active" || s === "partially_used" || s === "used";
  const pct = v ? Math.round((v.remaining_cents / v.original_cents) * 100) : 0;
  const pdfUrl = `/api/admin/orders/${id}/pdf`;
  const everUsed = d.redemptions.some((r) => r.status !== "released");

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Link href="/admin" className="small muted">← Alle bestellingen</Link>
      </div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Bestelling · {dateNL(o.created_at, true)}{o.source === "admin" ? " · handmatig aangemaakt" : ""}</div>
          <h1 className="h1">{o.order_number}</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <StatusBadge status={s} />
          <span className="muted small">{PAYMENT_LABELS[o.payment_status]}</span>
        </div>
      </div>

      <div className="detail">
        <div>
          {/* ---------- Cadeaubon ---------- */}
          <section className="panel">
            <h3 className="h3">Cadeaubon</h3>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <div className="label">Code</div>
                <div className="mono" style={{ fontSize: 24, marginTop: 4 }}>{v.code}</div>
                {unpaid && <div className="faint small" style={{ marginTop: 4 }}>Gereserveerd — nog niet bruikbaar in de boekingsapp</div>}
              </div>
              <div className="balance">
                <div>
                  <div className="label">Restwaarde</div>
                  <div className="big">{euro(v.remaining_cents)}</div>
                </div>
                <div style={{ paddingBottom: 6 }}>
                  <div className="label">Oorspronkelijk</div>
                  <div style={{ fontSize: 20 }}>{euro(v.original_cents)}</div>
                </div>
              </div>
            </div>
            <div className="bar"><div style={{ width: `${pct}%` }} /></div>
            <dl className="kv" style={{ marginTop: 18 }}>
              <dt>Geactiveerd</dt><dd>{v.activated_at ? dateNL(v.activated_at, true) : "Nog niet"}</dd>
              <dt>Geldig tot</dt><dd>{v.expires_at ? dateNL(v.expires_at) : v.activated_at ? "Onbeperkt" : "Wordt bepaald bij activatie"}</dd>
              {v.blocked_reason && (<><dt>Reden blokkade</dt><dd>{v.blocked_reason}</dd></>)}
              <dt>PDF</dt><dd>Versie {v.pdf_version}{v.pdf_generated_at ? ` · ${dateNL(v.pdf_generated_at, true)}` : ""}</dd>
            </dl>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
              <a className="btn ghost sm" href={pdfUrl} target="_blank" rel="noreferrer">Bekijken</a>
              <a className="btn ghost sm" href={`${pdfUrl}?download=1`}>Downloaden</a>
              <button className="btn ghost sm" disabled={busy} onClick={() => action({ action: "regenerate_pdf" }, "PDF opnieuw gegenereerd.")}>Opnieuw genereren</button>
              {d.customerPdfLink && (
                <button className="btn quiet sm" onClick={() => { navigator.clipboard?.writeText(location.origin + d.customerPdfLink); setToast({ msg: "Klantlink gekopieerd." }); }}>
                  Kopieer klantlink
                </button>
              )}
            </div>
            {unpaid && <p className="faint small" style={{ margin: "10px 0 0" }}>De PDF toont een ‘voorbeeld’-watermerk zolang de bon niet betaald is.</p>}
          </section>

          {/* ---------- Gebruik ---------- */}
          <section className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <h3 className="h3" style={{ margin: 0 }}>Gebruiksgeschiedenis</h3>
              {inUse && v.remaining_cents > 0 && (
                <button className="btn ghost sm" onClick={() => setShowRedeem((x) => !x)}>{showRedeem ? "Sluiten" : "Handmatig afboeken"}</button>
              )}
            </div>
            {showRedeem && (
              <form
                className="inline-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await post(`/api/admin/orders/${id}/redemptions`, { op: "redeem", ...redeem }, "Bedrag afgeboekt.")) {
                    setRedeem({ amount: "", description: "", bookingRef: "" });
                    setShowRedeem(false);
                  }
                }}
              >
                <p className="muted small" style={{ margin: 0 }}>Bijvoorbeeld voor een boeking buiten de boekingsapp. Er wordt nooit meer afgeboekt dan de restwaarde.</p>
                <div className="grid-2">
                  <input className="input" placeholder="Bedrag (€)" inputMode="decimal" value={redeem.amount} onChange={(e) => setRedeem({ ...redeem, amount: e.target.value })} required />
                  <input className="input" placeholder="Kenmerk boeking (optioneel)" value={redeem.bookingRef} onChange={(e) => setRedeem({ ...redeem, bookingRef: e.target.value })} />
                </div>
                <input className="input" placeholder="Omschrijving, bijv. Fotoshoot 12 okt" value={redeem.description} onChange={(e) => setRedeem({ ...redeem, description: e.target.value })} />
                <div><button className="btn sm" disabled={busy}>Afboeken</button></div>
              </form>
            )}
            {d.redemptions.length === 0 ? (
              <p className="muted small" style={{ margin: "12px 0 0" }}>Deze cadeaubon is nog niet gebruikt.</p>
            ) : (
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table className="mini-table">
                  <thead><tr><th>Datum</th><th>Boeking</th><th>Bedrag</th><th>Rest erna</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {d.redemptions.map((r) => (
                      <tr key={r.id} style={{ opacity: r.status === "released" ? 0.55 : 1 }}>
                        <td style={{ whiteSpace: "nowrap" }}>{dateNL(r.created_at, true)}</td>
                        <td>
                          {r.booking_ref}
                          {r.description && <div className="sub">{r.description}</div>}
                          {r.booking_total_cents && <div className="sub">Boeking {euro(r.booking_total_cents)} · te betalen {euro(Math.max(0, r.booking_total_cents - r.amount_cents))}</div>}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>− {euro(r.amount_cents)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{euro(r.balance_after_cents)}</td>
                        <td>
                          {REDEMPTION_LABELS[r.status]}
                          {r.release_reason && <div className="sub">{r.release_reason}</div>}
                        </td>
                        <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                          {r.status === "held" && (
                            <button className="btn quiet sm" disabled={busy} onClick={() => post(`/api/admin/orders/${id}/redemptions`, { op: "capture", bookingRef: r.booking_ref }, "Reservering definitief gemaakt.")}>Bevestigen</button>
                          )}
                          {r.status !== "released" && (
                            <button
                              className="btn quiet sm"
                              disabled={busy}
                              onClick={() =>
                                openAsk({
                                  title: "Bedrag terugzetten?",
                                  text: `${euro(r.amount_cents)} van boeking ${r.booking_ref} komt weer op de cadeaubon te staan.`,
                                  confirm: "Terugzetten",
                                  input: { label: "Reden", placeholder: "Bijv. boeking geannuleerd" },
                                  run: async (reason) => { await post(`/api/admin/orders/${id}/redemptions`, { op: "release", bookingRef: r.booking_ref, reason }, "Bedrag teruggezet op de bon."); },
                                })
                              }
                            >
                              Terugzetten
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ---------- Besteller ---------- */}
          <section className="panel">
            <h3 className="h3">{o.customer_type === "business" ? "Zakelijke besteller" : "Besteller"}</h3>
            <dl className="kv">
              <dt>Type</dt><dd>{o.customer_type === "business" ? "Zakelijk" : "Particulier"}</dd>
              {o.customer_type === "business" ? (
                <>
                  <dt>Bedrijf</dt><dd>{o.company_name}</dd>
                  <dt>Contactpersoon</dt><dd>{o.contact_person}</dd>
                </>
              ) : (
                <><dt>Naam</dt><dd>{customerName(o)}</dd></>
              )}
              <dt>E-mail</dt><dd><a href={`mailto:${o.email}`}>{o.email}</a></dd>
              <dt>Telefoon</dt><dd>{o.phone ? <a href={`tel:${o.phone}`}>{o.phone}</a> : "—"}</dd>
              <dt>{o.customer_type === "business" ? "Factuuradres" : "Adres"}</dt>
              <dd>
                {o.street || o.city ? (
                  <>{[o.street, o.house_number].filter(Boolean).join(" ")}<br />{[o.postal_code, o.city].filter(Boolean).join(" ")}<br />{o.country}</>
                ) : "—"}
              </dd>
              {o.vat_number && (<><dt>Btw-nummer</dt><dd>{o.vat_number}</dd></>)}
              {o.coc_number && (<><dt>KvK</dt><dd>{o.coc_number}</dd></>)}
              {o.invoice_reference && (<><dt>Referentie</dt><dd>{o.invoice_reference}</dd></>)}
              {o.invoice_email && (<><dt>Factuur-e-mail</dt><dd><a href={`mailto:${o.invoice_email}`}>{o.invoice_email}</a></dd></>)}
              <dt>Bedrag</dt><dd>{euro(o.amount_cents)}</dd>
              <dt>Factuur verstuurd</dt><dd>{o.invoice_sent_at ? dateNL(o.invoice_sent_at, true) : "—"}</dd>
              <dt>Betaald op</dt><dd>{o.paid_at ? dateNL(o.paid_at, true) : "—"}</dd>
              {o.payment_note && (<><dt>Notitie betaling</dt><dd>{o.payment_note}</dd></>)}
            </dl>
          </section>

          {/* ---------- Ontvanger ---------- */}
          <section className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className="h3" style={{ margin: 0 }}>Op de cadeaubon</h3>
              <button className="btn quiet sm" onClick={() => setEditing((x) => !x)}>{editing ? "Annuleren" : "Wijzigen"}</button>
            </div>
            {!editing ? (
              <dl className="kv" style={{ marginTop: 14 }}>
                <dt>Voor</dt><dd>{v.recipient_name || (o.for_self ? "Besteller zelf" : "—")}</dd>
                <dt>Van</dt><dd>{v.from_name || "—"}</dd>
                <dt>E-mail ontvanger</dt><dd>{v.recipient_email || "—"}</dd>
                <dt>Boodschap</dt><dd>{v.personal_message ? <span className="msg-quote">“{v.personal_message}”</span> : "—"}</dd>
              </dl>
            ) : (
              <form
                className="inline-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await action({ action: "update_details", ...edit }, "Gegevens bijgewerkt; PDF opnieuw gegenereerd.")) setEditing(false);
                }}
              >
                <div className="grid-2">
                  <input className="input" placeholder="Voor (naam ontvanger)" value={edit.recipientName} onChange={(e) => setEdit({ ...edit, recipientName: e.target.value })} />
                  <input className="input" placeholder="Van" value={edit.fromName} onChange={(e) => setEdit({ ...edit, fromName: e.target.value })} />
                </div>
                <input className="input" placeholder="E-mail ontvanger" value={edit.recipientEmail} onChange={(e) => setEdit({ ...edit, recipientEmail: e.target.value })} />
                <textarea className="textarea" placeholder="Persoonlijke boodschap" maxLength={300} value={edit.personalMessage} onChange={(e) => setEdit({ ...edit, personalMessage: e.target.value })} />
                <div><button className="btn sm" disabled={busy}>Opslaan</button></div>
              </form>
            )}
          </section>

          {/* ---------- Logboek ---------- */}
          <section className="panel">
            <h3 className="h3">Logboek</h3>
            <ul className="timeline">
              {d.events.map((e) => (
                <li key={e.id}>
                  {e.message}
                  <span className="when">{dateNL(e.created_at, true)} · {e.actor === "admin" ? "jij" : e.actor === "customer" ? "klant" : e.actor === "booking-api" ? "boekingsapp" : "systeem"}</span>
                </li>
              ))}
            </ul>
            {d.emails.length > 0 && (
              <>
                <h3 className="h3" style={{ marginTop: 18 }}>E-mails</h3>
                <table className="mini-table">
                  <tbody>
                    {d.emails.map((m) => (
                      <tr key={m.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{dateNL(m.created_at, true)}</td>
                        <td>{m.subject}<div className="sub">aan {m.to_address}</div></td>
                        <td style={{ color: m.status === "sent" ? "var(--ok)" : m.status === "failed" ? "var(--danger)" : "var(--faint)" }}>
                          {m.status === "sent" ? "Verstuurd" : m.status === "failed" ? "Mislukt" : "Niet verstuurd"}
                          {m.error && <div className="sub">{m.error}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        </div>

        {/* ================= Zijbalk: acties ================= */}
        <aside>
          <section className="panel">
            <h3 className="h3">Acties</h3>
            <div className="actions-grid">
              {s === "ordered" && (
                <button className="btn ghost" disabled={busy} onClick={() => action({ action: "mark_invoiced" }, "Status: wacht op betaling.")}>
                  Factuur verstuurd
                </button>
              )}
              {unpaid && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    openAsk({
                      title: "Betaling ontvangen?",
                      text: `De cadeaubon ${v.code} t.w.v. ${euro(v.original_cents)} wordt geactiveerd en is daarna direct bruikbaar in de boekingsapp.`,
                      confirm: "Betaald — activeren",
                      check: { label: d.emailConfigured ? `Stuur de klant de cadeaubon (PDF) per e-mail` : "E-mail versturen (SMTP nog niet ingesteld)", default: d.emailConfigured },
                      run: async (_i, send) => { await action({ action: "mark_paid", sendEmail: send }, "Betaling verwerkt — cadeaubon is actief."); },
                    })
                  }
                >
                  Betaald — activeren
                </button>
              )}
              {inUse && (
                <button
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => openAsk({ title: "Cadeaubon blokkeren?", text: "De code kan dan tijdelijk niet gebruikt worden. Je kunt de blokkade later opheffen.", confirm: "Blokkeren", danger: true, input: { label: "Reden (optioneel)" }, run: async (reason) => { await action({ action: "block", reason }, "Cadeaubon geblokkeerd."); } })}
                >
                  Blokkeren
                </button>
              )}
              {s === "blocked" && <button className="btn ghost" disabled={busy} onClick={() => action({ action: "unblock" }, "Blokkade opgeheven.")}>Blokkade opheffen</button>}
              {s !== "cancelled" && (
                <button
                  className="btn danger"
                  disabled={busy}
                  onClick={() => openAsk({ title: "Cadeaubon annuleren?", text: "De code wordt definitief onbruikbaar (je kunt dit later nog terugdraaien via ‘Heropenen’).", confirm: "Annuleren", danger: true, input: { label: "Reden (optioneel)" }, run: async (reason) => { await action({ action: "cancel", reason }, "Cadeaubon geannuleerd."); } })}
                >
                  Annuleren
                </button>
              )}
              {s === "cancelled" && <button className="btn ghost" disabled={busy} onClick={() => action({ action: "reopen" }, "Bestelling heropend.")}>Heropenen</button>}
              {!everUsed && (
                <button
                  className="btn quiet"
                  disabled={busy}
                  onClick={() =>
                    openAsk({
                      title: "Definitief verwijderen?",
                      text: `Bestelling ${o.order_number} en cadeaubon ${v.code} worden helemaal verwijderd, inclusief logboek. Dit kan niet ongedaan worden gemaakt. Typ VERWIJDER om te bevestigen.`,
                      confirm: "Verwijderen",
                      danger: true,
                      input: { label: "Typ VERWIJDER", placeholder: "VERWIJDER" },
                      run: async (typed) => {
                        if (typed.trim().toUpperCase() !== "VERWIJDER") { setToast({ msg: "Niet verwijderd: typ VERWIJDER om te bevestigen.", err: true }); return; }
                        setBusy(true);
                        const res = await fetch(`/api/admin/orders/${id}`, { method: "DELETE" });
                        const data = await res.json().catch(() => ({}));
                        setBusy(false);
                        if (!res.ok) { setToast({ msg: data.error || "Verwijderen mislukt.", err: true }); return; }
                        router.replace("/admin?deleted=" + encodeURIComponent(data.orderNumber || ""));
                      },
                    })
                  }
                  style={{ color: "var(--danger)" }}
                >
                  Verwijderen
                </button>
              )}
            </div>
            {everUsed && <p className="faint small" style={{ margin: "10px 0 0" }}>Deze bon is gebruikt in een boeking en kan daarom niet verwijderd worden, alleen geannuleerd.</p>}

            <div className="inline-form">
              <div className="label">E-mails opnieuw versturen</div>
              <button className="btn ghost sm" disabled={busy} onClick={() => post(`/api/admin/orders/${id}/email`, { template: "orderReceived" }, "Bevestiging verstuurd.")}>Bevestiging bestelling</button>
              <button className="btn ghost sm" disabled={busy || !inUse} onClick={() => post(`/api/admin/orders/${id}/email`, { template: "activated" }, "Cadeaubon (PDF) verstuurd.")}>Cadeaubon met PDF</button>
              {!d.emailConfigured && <span className="faint small">E-mail is nog niet ingesteld — zie README › E-mail.</span>}
            </div>

            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); action({ action: "set_expiry", expiresAt: expiry || null }, "Geldigheid aangepast."); }}>
              <label className="label" htmlFor="exp">Geldig tot en met</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input id="exp" type="date" className="input" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
                <button className="btn ghost sm" disabled={busy}>Opslaan</button>
              </div>
              <span className="faint small">Leeg = onbeperkt geldig.</span>
            </form>

            <details className="inline-form">
              <summary className="label" style={{ cursor: "pointer" }}>Geavanceerd: status direct wijzigen</summary>
              <p className="faint small" style={{ margin: "6px 0" }}>Alleen gebruiken om een vergissing te herstellen. Er worden geen e-mails verstuurd.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <select className="select" defaultValue={s} id="force-status">
                  {VOUCHER_STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABELS[x]}</option>)}
                </select>
                <button className="btn ghost sm" disabled={busy} onClick={() => action({ action: "set_status", status: (document.getElementById("force-status") as HTMLSelectElement).value }, "Status gewijzigd.")}>Zet</button>
              </div>
            </details>
          </section>

          <section className="panel">
            <h3 className="h3">Interne notities</h3>
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bijv. factuurnummer, afspraken…" />
            <button className="btn ghost sm" style={{ marginTop: 10 }} disabled={busy || notes === (o.admin_notes ?? "")} onClick={() => action({ action: "set_notes", notes }, "Notitie opgeslagen.")}>Opslaan</button>
          </section>
        </aside>
      </div>

      {ask && (
        <div className="dialog-back" onClick={() => !busy && setAsk(null)}>
          <div className="dialog" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
            <h2 className="h2">{ask.title}</h2>
            <p className="muted" style={{ margin: "6px 0 0" }}>{ask.text}</p>
            {ask.input && (
              <div className="field" style={{ marginTop: 16 }}>
                <label>{ask.input.label}</label>
                <input className="input" placeholder={ask.input.placeholder} value={askInput} onChange={(e) => setAskInput(e.target.value)} autoFocus />
              </div>
            )}
            {ask.check && (
              <label className="check" style={{ marginTop: 16 }}>
                <input type="checkbox" checked={askCheck} onChange={(e) => setAskCheck(e.target.checked)} />
                <span>{ask.check.label}</span>
              </label>
            )}
            <div className="row">
              <button className="btn quiet" onClick={() => setAsk(null)} disabled={busy}>Terug</button>
              <button
                className={`btn${ask.danger ? " danger" : ""}`}
                disabled={busy}
                onClick={async () => { await ask.run(askInput, askCheck); setAsk(null); }}
              >
                {busy ? "Bezig…" : ask.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={`toast${toast.err ? " err" : ""}`} role="status">{toast.msg}</div>}
    </>
  );
}
