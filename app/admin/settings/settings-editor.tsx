"use client";

import { Fragment, useEffect, useState } from "react";
import type { Settings } from "@/lib/settings";

type Payload = {
  settings: Settings;
  defaults: Settings;
  placeholders: { key: string; label: string }[];
  status: { email: boolean; mailFrom: string | null; bookingApi: boolean; appUrl: string | null };
};

const EMAIL_LABELS: Record<keyof Settings["emails"], { title: string; text: string }> = {
  orderReceived: { title: "E-mail 1 — Bestelling ontvangen", text: "Gaat direct na het bestellen naar de klant." },
  activated: { title: "E-mail 2 — Cadeaubon geactiveerd", text: "Gaat naar de klant als jij de betaling als ontvangen markeert. De PDF zit als bijlage bij." },
  adminNewOrder: { title: "Melding aan jou — nieuwe bestelling", text: "Gaat naar het meldingsadres hieronder." },
};

export default function SettingsEditor() {
  const [p, setP] = useState<Payload | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [newAmount, setNewAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings").then(async (r) => {
      const data = await r.json();
      setP(data);
      setS(data.settings);
    });
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  if (!s || !p) return <div className="empty">Laden…</div>;

  const up = (fn: (x: Settings) => Settings) => { setS(fn(structuredClone(s))); setDirty(true); };

  const save = async () => {
    setSaving(true);
    const res = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setMsg({ t: data.error || "Opslaan mislukt", err: true });
    setS(data.settings);
    setDirty(false);
    setMsg({ t: "Instellingen opgeslagen." });
  };

  const previewPdf = async () => {
    const res = await fetch("/api/admin/preview-pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) });
    if (!res.ok) return setMsg({ t: (await res.json()).error || "Voorbeeld mislukt", err: true });
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank");
  };

  const addAmount = () => {
    const n = Math.round(Number(newAmount.replace(",", ".")));
    if (!n) return;
    up((x) => ({ ...x, amounts: Array.from(new Set([...x.amounts, n])).sort((a, b) => a - b) }));
    setNewAmount("");
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Beheer</div>
          <h1 className="h1">Instellingen</h1>
        </div>
        <button className="btn" onClick={save} disabled={saving || !dirty}>{saving ? "Opslaan…" : dirty ? "Wijzigingen opslaan" : "Opgeslagen"}</button>
      </div>

      <div className="settings-grid">
        <nav className="settings-nav">
          <a href="#bedragen">Bedragen</a>
          <a href="#bestelpagina">Bestelpagina</a>
          <a href="#ontwerp">Ontwerp cadeaubon</a>
          <a href="#emails">E-mails</a>
          <a href="#status">Systeemstatus</a>
        </nav>

        <div>
          <section className="panel" id="bedragen">
            <h3 className="h3">Bedragen</h3>
            <p className="muted small" style={{ marginTop: 0 }}>Deze bedragen kunnen klanten aanklikken.</p>
            <div className="chips">
              {s.amounts.map((a) => (
                <span className="chip" key={a}>
                  €{a}
                  <button type="button" aria-label={`€${a} verwijderen`} onClick={() => up((x) => ({ ...x, amounts: x.amounts.filter((y) => y !== a) }))}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, maxWidth: 320 }}>
              <input className="input" placeholder="Bedrag toevoegen" inputMode="numeric" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAmount())} />
              <button type="button" className="btn ghost sm" onClick={addAmount}>Toevoegen</button>
            </div>
            <div className="grid-2" style={{ marginTop: 20 }}>
              <div className="field"><label>Minimum (€)</label><input className="input" inputMode="numeric" value={s.minAmount} onChange={(e) => up((x) => ({ ...x, minAmount: Number(e.target.value) || 0 }))} /></div>
              <div className="field"><label>Maximum (€)</label><input className="input" inputMode="numeric" value={s.maxAmount} onChange={(e) => up((x) => ({ ...x, maxAmount: Number(e.target.value) || 0 }))} /></div>
            </div>
            <label className="check" style={{ marginTop: 16 }}>
              <input type="checkbox" checked={s.allowCustomAmount} onChange={(e) => up((x) => ({ ...x, allowCustomAmount: e.target.checked }))} />
              <span>Klant mag ook zelf een bedrag invullen (tussen minimum en maximum)</span>
            </label>
            <div className="field" style={{ marginTop: 18, maxWidth: 320 }}>
              <label>Geldigheid na activatie (maanden)</label>
              <input className="input" inputMode="numeric" value={s.validityMonths} onChange={(e) => up((x) => ({ ...x, validityMonths: Number(e.target.value) || 0 }))} />
              <span className="faint small">0 = onbeperkt geldig. Geldt voor nieuw geactiveerde bonnen.</span>
            </div>
          </section>

          <section className="panel" id="bestelpagina">
            <h3 className="h3">Bestelpagina</h3>
            <div className="stack">
              <div className="field"><label>Titel</label><input className="input" value={s.intro.title} onChange={(e) => up((x) => ({ ...x, intro: { ...x.intro, title: e.target.value } }))} /></div>
              <div className="field"><label>Introductietekst</label><textarea className="textarea" value={s.intro.subtitle} onChange={(e) => up((x) => ({ ...x, intro: { ...x.intro, subtitle: e.target.value } }))} /></div>
              <div className="field"><label>Link naar voorwaarden</label><input className="input" placeholder="https://thelightportraits.nl/voorwaarden" value={s.termsUrl} onChange={(e) => up((x) => ({ ...x, termsUrl: e.target.value }))} /></div>
            </div>
          </section>

          <section className="panel" id="ontwerp">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h3 className="h3" style={{ margin: 0 }}>Ontwerp cadeaubon (PDF)</h3>
              <button type="button" className="btn ghost sm" onClick={previewPdf}>Voorbeeld-PDF</button>
            </div>
            <div className="stack" style={{ marginTop: 16 }}>
              <div className="grid-2">
                <div className="field"><label>Kopregel</label><input className="input" value={s.design.title} onChange={(e) => up((x) => ({ ...x, design: { ...x.design, title: e.target.value } }))} /></div>
                <div className="field"><label>Titel</label><input className="input" value={s.design.subtitle} onChange={(e) => up((x) => ({ ...x, design: { ...x.design, subtitle: e.target.value } }))} /></div>
              </div>
              <div className="grid-2">
                <div className="field"><label>Website</label><input className="input" value={s.design.website} onChange={(e) => up((x) => ({ ...x, design: { ...x.design, website: e.target.value } }))} /></div>
                <div className="field"><label>Voetregel</label><input className="input" value={s.design.footer} onChange={(e) => up((x) => ({ ...x, design: { ...x.design, footer: e.target.value } }))} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14 }}>
                {([
                  ["background", "Achtergrond"],
                  ["text", "Tekst"],
                  ["muted", "Gedempte tekst"],
                  ["accent", "Koper (lijnen)"],
                  ["accentSoft", "Goud (bedrag)"],
                ] as const).map(([k, label]) => (
                  <div className="field" key={k}>
                    <label>{label}</label>
                    <div className="swatch">
                      <input type="color" value={s.design[k]} onChange={(e) => up((x) => ({ ...x, design: { ...x.design, [k]: e.target.value } }))} />
                      <span className="small muted">{s.design[k]}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" className="btn quiet sm" style={{ alignSelf: "flex-start" }} onClick={() => up((x) => ({ ...x, design: { ...p.defaults.design } }))}>Standaardontwerp herstellen</button>
            </div>
          </section>

          <section className="panel" id="emails">
            <h3 className="h3">E-mails</h3>
            <div className="field" style={{ maxWidth: 420, marginBottom: 20 }}>
              <label>Meldingen nieuwe bestellingen naar</label>
              <input className="input" type="email" value={s.notifyEmail} onChange={(e) => up((x) => ({ ...x, notifyEmail: e.target.value }))} />
            </div>
            {(Object.keys(EMAIL_LABELS) as (keyof Settings["emails"])[]).map((k) => (
              <div key={k} style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 18, marginTop: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 400 }}>{EMAIL_LABELS[k].title}</div>
                    <div className="faint small">{EMAIL_LABELS[k].text}</div>
                  </div>
                  <label className="check">
                    <input type="checkbox" checked={s.emails[k].enabled} onChange={(e) => up((x) => { x.emails[k].enabled = e.target.checked; return x; })} />
                    <span>Automatisch versturen</span>
                  </label>
                </div>
                <div className="stack" style={{ marginTop: 12, gap: 12 }}>
                  <div className="field"><label>Onderwerp</label><input className="input" value={s.emails[k].subject} onChange={(e) => up((x) => { x.emails[k].subject = e.target.value; return x; })} /></div>
                  <div className="field"><label>Tekst</label><textarea className="textarea" style={{ minHeight: 260 }} value={s.emails[k].body} onChange={(e) => up((x) => { x.emails[k].body = e.target.value; return x; })} /></div>
                  <button type="button" className="btn quiet sm" style={{ alignSelf: "flex-start" }} onClick={() => up((x) => { x.emails[k] = { ...p.defaults.emails[k] }; return x; })}>Standaardtekst herstellen</button>
                </div>
              </div>
            ))}
            <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 18, marginTop: 18 }}>
              <div className="label" style={{ marginBottom: 10 }}>Beschikbare invulvelden</div>
              <div className="ph-list">
                {p.placeholders.map((ph) => (
                  <Fragment key={ph.key}><code>{`{{${ph.key}}}`}</code><span>{ph.label}</span></Fragment>
                ))}
              </div>
            </div>
          </section>

          <section className="panel" id="status">
            <h3 className="h3">Systeemstatus</h3>
            <div className="stack" style={{ gap: 10 }}>
              <span className={`statusline${p.status.email ? " ok" : ""}`}>E-mail (SMTP): {p.status.email ? `ingesteld, afzender ${p.status.mailFrom}` : "niet ingesteld — e-mails worden niet verstuurd"}</span>
              <span className={`statusline${p.status.bookingApi ? " ok" : ""}`}>Koppeling boekingsapp: {p.status.bookingApi ? "API-sleutel ingesteld" : "BOOKING_API_KEY ontbreekt"}</span>
              <span className={`statusline${p.status.appUrl ? " ok" : ""}`}>APP_URL: {p.status.appUrl ?? "niet ingesteld (links in e-mails kunnen dan niet kloppen)"}</span>
            </div>
          </section>
        </div>
      </div>
      {msg && <div className={`toast${msg.err ? " err" : ""}`}>{msg.t}</div>}
    </>
  );
}
