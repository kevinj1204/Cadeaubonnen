"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const COUNTRIES = ["Nederland", "België", "Duitsland", "Luxemburg", "Frankrijk", "Verenigd Koninkrijk", "Anders"];

export default function NewVoucher() {
  const router = useRouter();
  const [f, setF] = useState<any>({
    customerType: "private", amount: "", firstName: "", lastName: "", companyName: "", contactPerson: "", vatNumber: "",
    email: "", phone: "", street: "", houseNumber: "", postalCode: "", city: "", country: "Nederland",
    forSelf: true, recipientName: "", recipientEmail: "", fromName: "", personalMessage: "", activate: false, sendEmail: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  const input = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className={`field${errors[k] ? " has-error" : ""}`}>
      <label htmlFor={k}>{label}</label>
      <input id={k} className="input" value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} />
      {errors[k] && <span className="error-text">{errors[k]}</span>}
    </div>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, amount: Number(String(f.amount).replace(",", ".")) }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErrors(data.errors || {});
      setError(data.error || "Er ging iets mis.");
      return;
    }
    router.push(`/admin/orders/${data.id}`);
  };

  return (
    <form onSubmit={submit} style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Handmatig</div>
          <h1 className="h1">Nieuwe cadeaubon</h1>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        Voor bijvoorbeeld een bestelling per telefoon, een winactie of een cadeaubon die je in de studio verkoopt. Adres en telefoon zijn hier optioneel.
      </p>

      <section className="panel stack">
        <div className="segmented" role="group" style={{ maxWidth: 360 }}>
          <button type="button" aria-pressed={f.customerType === "private"} onClick={() => set("customerType", "private")}>Particulier</button>
          <button type="button" aria-pressed={f.customerType === "business"} onClick={() => set("customerType", "business")}>Zakelijk</button>
        </div>
        <div className="grid-2">
          {input("amount", "Waarde (€)", { inputMode: "decimal", required: true, placeholder: "100" })}
          <div />
        </div>
        {f.customerType === "private" ? (
          <div className="grid-2">{input("firstName", "Voornaam")}{input("lastName", "Achternaam")}</div>
        ) : (
          <div className="grid-2">{input("companyName", "Bedrijfsnaam")}{input("contactPerson", "Contactpersoon")}</div>
        )}
        <div className="grid-2">{input("email", "E-mailadres", { type: "email" })}{input("phone", "Telefoon (optioneel)")}</div>
        <div className="grid-addr">{input("street", "Straat (optioneel)")}{input("houseNumber", "Huisnr.")}</div>
        <div className="grid-pc">{input("postalCode", "Postcode")}{input("city", "Plaats")}</div>
        <div className="grid-2">
          <div className="field">
            <label>Land</label>
            <select className="select" value={f.country} onChange={(e) => set("country", e.target.value)}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          {f.customerType === "business" ? input("vatNumber", "Btw-nummer (optioneel)") : <div />}
        </div>
      </section>

      <section className="panel stack">
        <label className="check">
          <input type="checkbox" checked={!f.forSelf} onChange={(e) => set("forSelf", !e.target.checked)} />
          <span>De bon is voor iemand anders (naam en boodschap op de bon)</span>
        </label>
        {!f.forSelf && (
          <>
            <div className="grid-2">{input("recipientName", "Voor (naam ontvanger)")}{input("fromName", "Van")}</div>
            {input("recipientEmail", "E-mail ontvanger (optioneel)", { type: "email" })}
            <div className="field">
              <label>Persoonlijke boodschap (optioneel)</label>
              <textarea className="textarea" maxLength={300} value={f.personalMessage} onChange={(e) => set("personalMessage", e.target.value)} />
            </div>
          </>
        )}
      </section>

      <section className="panel stack">
        <label className="check">
          <input type="checkbox" checked={f.activate} onChange={(e) => set("activate", e.target.checked)} />
          <span><strong style={{ fontWeight: 400, color: "var(--text)" }}>Direct activeren</strong> — de betaling is al ontvangen (of de bon is gratis). De code is meteen bruikbaar.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={f.sendEmail} onChange={(e) => set("sendEmail", e.target.checked)} />
          <span>Stuur de klant meteen een e-mail ({f.activate ? "cadeaubon met PDF" : "bevestiging van de bestelling"})</span>
        </label>
      </section>

      {error && <div className="alert" style={{ marginBottom: 16 }}>{error}</div>}
      <button className="btn" disabled={busy}>{busy ? "Bezig…" : "Cadeaubon aanmaken"}</button>
    </form>
  );
}
