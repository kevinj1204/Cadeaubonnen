"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PublicSettings } from "@/lib/settings";

// ---------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------
type Form = {
  customerType: "private" | "business";
  amount: number | null;
  customAmount: string;
  firstName: string;
  lastName: string;
  companyName: string;
  contactPerson: string;
  vatNumber: string;
  cocNumber: string;
  invoiceReference: string;
  invoiceEmail: string;
  email: string;
  phone: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
  forSelf: boolean | null;
  recipientName: string;
  recipientEmail: string;
  fromName: string;
  personalMessage: string;
  acceptTerms: boolean;
  website: string; // spam-val
};

const EMPTY: Form = {
  customerType: "private",
  amount: null,
  customAmount: "",
  firstName: "",
  lastName: "",
  companyName: "",
  contactPerson: "",
  vatNumber: "",
  cocNumber: "",
  invoiceReference: "",
  invoiceEmail: "",
  email: "",
  phone: "",
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  country: "Nederland",
  forSelf: null,
  recipientName: "",
  recipientEmail: "",
  fromName: "",
  personalMessage: "",
  acceptTerms: false,
  website: "",
};

const STEPS = ["Cadeaubon", "Gegevens", "Ontvanger", "Controleren", "Bevestiging"];
const COUNTRIES = ["Nederland", "België", "Duitsland", "Luxemburg", "Frankrijk", "Verenigd Koninkrijk", "Anders"];
const MESSAGE_MAX = 300;
const STORE_KEY = "tlp-cadeaubon-v1";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const euro = (n: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);

const FIELD_STEP: Record<string, number> = {
  customerType: 0, amount: 0,
  firstName: 1, lastName: 1, companyName: 1, contactPerson: 1, vatNumber: 1, cocNumber: 1, invoiceReference: 1, invoiceEmail: 1,
  email: 1, phone: 1, street: 1, houseNumber: 1, postalCode: 1, city: 1, country: 1,
  recipientName: 2, recipientEmail: 2, fromName: 2, personalMessage: 2,
  acceptTerms: 3,
};

function buyerName(f: Form) {
  return f.customerType === "business" ? f.companyName : [f.firstName, f.lastName].filter(Boolean).join(" ");
}

function effectiveAmount(f: Form): number | null {
  if (f.amount) return f.amount;
  const n = Number(f.customAmount.replace(",", "."));
  return f.customAmount && Number.isFinite(n) ? n : null;
}

function validateStep(step: number, f: Form, s: PublicSettings): Record<string, string> {
  const e: Record<string, string> = {};
  if (step === 0) {
    const a = effectiveAmount(f);
    if (a === null) e.amount = "Kies een bedrag.";
    else if (!Number.isInteger(a)) e.amount = "Kies een bedrag in hele euro's.";
    else if (a < s.minAmount || a > s.maxAmount) e.amount = `Kies een bedrag tussen ${euro(s.minAmount)} en ${euro(s.maxAmount)}.`;
  }
  if (step === 1) {
    if (f.customerType === "private") {
      if (!f.firstName.trim()) e.firstName = "Vul je voornaam in.";
      if (!f.lastName.trim()) e.lastName = "Vul je achternaam in.";
    } else {
      if (!f.companyName.trim()) e.companyName = "Vul de bedrijfsnaam in.";
      if (!f.contactPerson.trim()) e.contactPerson = "Vul een contactpersoon in.";
      const vat = f.vatNumber.toUpperCase().replace(/\s/g, "");
      if (vat && !/^[A-Z]{2}[A-Z0-9]{8,12}$/.test(vat)) e.vatNumber = "Bijv. NL123456789B01.";
      if (f.invoiceEmail && !EMAIL_RE.test(f.invoiceEmail.trim())) e.invoiceEmail = "Vul een geldig e-mailadres in.";
    }
    if (!EMAIL_RE.test(f.email.trim())) e.email = "Vul een geldig e-mailadres in.";
    if (f.phone.replace(/[^0-9]/g, "").length < 8) e.phone = "Vul een geldig telefoonnummer in.";
    if (!f.street.trim()) e.street = "Vul de straat in.";
    if (!f.houseNumber.trim()) e.houseNumber = "Vul het huisnummer in.";
    const pc = f.postalCode.trim().toUpperCase();
    if (!pc) e.postalCode = "Vul de postcode in.";
    else if (f.country === "Nederland" && !/^[1-9][0-9]{3}\s?[A-Z]{2}$/.test(pc)) e.postalCode = "Formaat 1234 AB.";
    else if (f.country === "België" && !/^[1-9][0-9]{3}$/.test(pc)) e.postalCode = "4 cijfers, bijv. 3630.";
    if (!f.city.trim()) e.city = f.customerType === "business" ? "Vul de plaats in." : "Vul je woonplaats in.";
  }
  if (step === 2) {
    if (f.forSelf === null) e.forSelf = "Maak een keuze.";
    if (f.forSelf === false) {
      if (!f.recipientName.trim()) e.recipientName = "Vul de naam van de ontvanger in.";
      if (f.recipientEmail && !EMAIL_RE.test(f.recipientEmail.trim())) e.recipientEmail = "Vul een geldig e-mailadres in.";
    }
  }
  if (step === 3 && !f.acceptTerms) e.acceptTerms = "Vink dit aan om te kunnen bestellen.";
  return e;
}

// ---------------------------------------------------------------------
// Kleine bouwstenen
// ---------------------------------------------------------------------
function Field({
  label, name, value, onChange, error, type = "text", optional, autoComplete, inputMode, placeholder, maxLength,
}: {
  label: string; name: string; value: string; onChange: (v: string) => void; error?: string; type?: string; optional?: boolean;
  autoComplete?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; placeholder?: string; maxLength?: number;
}) {
  return (
    <div className={`field${error ? " has-error" : ""}`}>
      <label htmlFor={name}>
        {label} {optional && <span className="opt">(optioneel)</span>}
      </label>
      <input
        id={name}
        name={name}
        className="input"
        type={type}
        value={value}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        maxLength={maxLength ?? 160}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-err` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <span className="error-text" id={`${name}-err`}>
          {error}
        </span>
      )}
    </div>
  );
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="7.25" stroke="currentColor" strokeWidth="1" />
      <path d="M8 7v4.2M8 4.6v.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function VoucherPreview({ amount, recipient, from, message, code }: { amount: number | null; recipient?: string; from?: string; message?: string; code?: string }) {
  const names = [recipient ? `Voor ${recipient}` : "", from ? `van ${from}` : ""].filter(Boolean).join("  ·  ");
  return (
    <div className="voucher" aria-label="Voorbeeld van de cadeaubon">
      <div className="v-inner">
        <div className="v-brand">THE LIGHT PORTRAITS</div>
        <div className="v-rule" />
        <div className="v-title">Cadeaubon</div>
        <div className="v-value">{amount ? euro(amount) : "€ —"}</div>
        {names && <div className="v-names">{names}</div>}
        {message && <div className="v-msg">“{message}”</div>}
      </div>
      <div className="v-code">
        <small>CADEAUBONCODE</small>
        <b>{code ?? "TLP-••••-••••"}</b>
      </div>
      <div className="v-foot">thelightportraits.nl</div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="stepper" aria-label="Voortgang">
      {STEPS.map((label, i) => (
        <li key={label} className={i === step ? "is-current" : i < step ? "is-done" : ""} aria-current={i === step ? "step" : undefined}>
          <span className="n">{i < step ? "✓" : i + 1}</span>
          <span className="l">{label}</span>
        </li>
      ))}
    </ol>
  );
}

function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  if (v === undefined || v === null || v === "") return null;
  return (
    <div className="sum-row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

// ---------------------------------------------------------------------
// Bestelflow
// ---------------------------------------------------------------------
export default function OrderFlow({ settings }: { settings: PublicSettings }) {
  const [f, setF] = useState<Form>(EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [fromTouched, setFromTouched] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  // Bewaar voortgang tijdens het bestellen (bijv. bij per ongeluk verversen)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        setF({ ...EMPTY, ...saved.f, acceptTerms: false, website: "" });
        if (typeof saved.step === "number" && saved.step < 4) setStep(saved.step);
      }
    } catch {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current || orderNumber) return;
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({ f, step }));
    } catch {}
  }, [f, step, orderNumber]);

  // In een iframe: geef de hoogte door aan de WordPress-pagina, zodat het iframe meegroeit
  useEffect(() => {
    if (window.parent === window) return;
    const send = () =>
      window.parent.postMessage({ type: "tlp-cadeaubon:height", height: document.documentElement.scrollHeight }, "*");
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    send();
    return () => ro.disconnect();
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k as string]) setErrors((e) => { const n = { ...e }; delete n[k as string]; return n; });
  };

  const amount = effectiveAmount(f);
  const defaultFrom = buyerName(f);
  const fromName = fromTouched ? f.fromName : f.fromName || defaultFrom;

  const goTo = (n: number) => {
    setStep(n);
    setServerError(null);
    requestAnimationFrame(() => {
      if (window.parent !== window) {
        // In een iframe (WordPress): laat de pagina eromheen naar boven scrollen
        window.parent.postMessage({ type: "tlp-cadeaubon:scrollTop" }, "*");
      } else {
        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  };

  const next = () => {
    const e = validateStep(step, f, settings);
    setErrors(e);
    if (Object.keys(e).length) {
      requestAnimationFrame(() => {
        const first = document.querySelector<HTMLElement>(".has-error input, .has-error select, .has-error textarea, [data-error='true']");
        first?.focus({ preventScroll: false });
        first?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return;
    }
    goTo(step + 1);
  };

  const submit = async () => {
    const e = { ...validateStep(0, f, settings), ...validateStep(1, f, settings), ...validateStep(2, f, settings), ...validateStep(3, f, settings) };
    setErrors(e);
    if (Object.keys(e).length) {
      const firstStep = Math.min(...Object.keys(e).map((k) => FIELD_STEP[k] ?? 3));
      if (firstStep !== 3) goTo(firstStep);
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, amount, fromName: f.forSelf ? "" : fromName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setServerError(data.message || "Er ging iets mis. Probeer het opnieuw.");
        if (data.errors) {
          setErrors(data.errors);
          const firstStep = Math.min(...Object.keys(data.errors).map((k) => FIELD_STEP[k] ?? 3));
          if (firstStep < 3) goTo(firstStep);
        }
        return;
      }
      setOrderNumber(data.orderNumber);
      try { sessionStorage.removeItem(STORE_KEY); } catch {}
      goTo(4);
    } catch {
      setServerError("Geen verbinding. Controleer je internet en probeer het opnieuw.");
    } finally {
      setSubmitting(false);
    }
  };

  const customActive = settings.allowCustomAmount && f.amount === null && f.customAmount !== "";
  const previewProps = useMemo(
    () => ({
      amount,
      recipient: f.forSelf === false ? f.recipientName : "",
      from: f.forSelf === false ? fromName : "",
      message: f.forSelf === false ? f.personalMessage : "",
    }),
    [amount, f.forSelf, f.recipientName, fromName, f.personalMessage],
  );

  return (
    <div className="shell">
      <header className="brand" ref={topRef}>
        <h1 className="brand-name">The Light<br />Portraits</h1>
        <div className="brand-tagline">Real moments. Real beauty. <em>Real you.</em></div>
        <div className="brand-rule" />
        {step === 0 && (
          <>
            <h2 className="h1 intro-title">{settings.intro.title}</h2>
            <p className="lead intro">{settings.intro.subtitle}</p>
          </>
        )}
        {step > 0 && step < 4 && <div className="h2" style={{ fontStyle: "italic", fontWeight: 300 }}>Cadeaubon bestellen</div>}
      </header>

      {step < 4 && <Stepper step={step} />}

      <div className={`layout${step === 4 ? " single" : ""}`}>
        <main className="main">
          {/* ---------------- Stap 1 ---------------- */}
          {step === 0 && (
            <section className="card rise" aria-labelledby="s1">
              <h2 className="h2" id="s1">Kies je cadeaubon</h2>
              <p className="muted small" style={{ margin: "0 0 26px" }}>Te besteden aan iedere fotoshoot. Niet alles gebruikt? De restwaarde blijft op de bon staan.</p>

              <div className="stack" style={{ gap: 28 }}>
                <div>
                  <div className="label" style={{ marginBottom: 10 }}>Ik bestel als</div>
                  <div className="segmented" role="group" aria-label="Particulier of zakelijk">
                    <button type="button" aria-pressed={f.customerType === "private"} onClick={() => set("customerType", "private")}>Particulier</button>
                    <button type="button" aria-pressed={f.customerType === "business"} onClick={() => set("customerType", "business")}>Zakelijk</button>
                  </div>
                </div>

                <div>
                  <div className="label" style={{ marginBottom: 10 }}>Waarde</div>
                  <div className="amounts" role="group" aria-label="Kies een bedrag" data-error={!!errors.amount}>
                    {settings.amounts.map((a) => (
                      <button
                        key={a}
                        type="button"
                        className="amount"
                        aria-pressed={f.amount === a}
                        onClick={() => { set("amount", a); set("customAmount", ""); }}
                      >
                        {euro(a)}
                      </button>
                    ))}
                  </div>
                  {settings.allowCustomAmount && (
                    <div className={`custom-amount${customActive ? " is-active" : ""}`}>
                      <label htmlFor="customAmount" className="label">Of kies zelf een bedrag</label>
                      <div className="euro-input">
                        <span aria-hidden>€</span>
                        <input
                          id="customAmount"
                          className="input"
                          inputMode="numeric"
                          placeholder={`${settings.minAmount} – ${settings.maxAmount}`}
                          value={f.customAmount}
                          maxLength={5}
                          onChange={(e) => { set("customAmount", e.target.value.replace(/[^0-9]/g, "")); set("amount", null); }}
                        />
                      </div>
                    </div>
                  )}
                  {errors.amount && <p className="error-text" style={{ marginTop: 10 }}>{errors.amount}</p>}
                </div>
              </div>
            </section>
          )}

          {/* ---------------- Stap 2 ---------------- */}
          {step === 1 && (
            <section className="card rise" aria-labelledby="s2">
              <div className="step-head">
                <h2 className="h2" id="s2">{f.customerType === "business" ? "Bedrijfsgegevens" : "Jouw gegevens"}</h2>
                <div className="segmented mini" role="group" aria-label="Particulier of zakelijk">
                  <button type="button" aria-pressed={f.customerType === "private"} onClick={() => set("customerType", "private")}>Particulier</button>
                  <button type="button" aria-pressed={f.customerType === "business"} onClick={() => set("customerType", "business")}>Zakelijk</button>
                </div>
              </div>
              <p className="muted small" style={{ margin: "0 0 24px" }}>
                {f.customerType === "business"
                  ? "Deze gegevens gebruiken we voor de factuur."
                  : "We gebruiken je gegevens alleen voor de factuur en om de cadeaubon te versturen."}
              </p>

              <div className="stack">
                {f.customerType === "business" ? (
                  <>
                    <Field label="Bedrijfsnaam" name="companyName" value={f.companyName} onChange={(v) => set("companyName", v)} error={errors.companyName} autoComplete="organization" />
                    <Field label="Contactpersoon" name="contactPerson" value={f.contactPerson} onChange={(v) => set("contactPerson", v)} error={errors.contactPerson} autoComplete="name" />
                  </>
                ) : (
                  <div className="grid-2">
                    <Field label="Voornaam" name="firstName" value={f.firstName} onChange={(v) => set("firstName", v)} error={errors.firstName} autoComplete="given-name" />
                    <Field label="Achternaam" name="lastName" value={f.lastName} onChange={(v) => set("lastName", v)} error={errors.lastName} autoComplete="family-name" />
                  </div>
                )}
                <div className="grid-2">
                  <Field label="E-mailadres" name="email" type="email" value={f.email} onChange={(v) => set("email", v)} error={errors.email} autoComplete="email" inputMode="email" />
                  <Field label="Telefoonnummer" name="phone" type="tel" value={f.phone} onChange={(v) => set("phone", v)} error={errors.phone} autoComplete="tel" inputMode="tel" maxLength={30} />
                </div>

                <div className="sub-label">{f.customerType === "business" ? "Factuuradres" : "Adres"}</div>
                <div className="grid-addr">
                  <Field label="Straat" name="street" value={f.street} onChange={(v) => set("street", v)} error={errors.street} autoComplete="address-line1" />
                  <Field label="Huisnr." name="houseNumber" value={f.houseNumber} onChange={(v) => set("houseNumber", v)} error={errors.houseNumber} maxLength={20} />
                </div>
                <div className="grid-pc">
                  <Field label="Postcode" name="postalCode" value={f.postalCode} onChange={(v) => set("postalCode", v.toUpperCase())} error={errors.postalCode} autoComplete="postal-code" maxLength={12} />
                  <Field label={f.customerType === "business" ? "Plaats" : "Woonplaats"} name="city" value={f.city} onChange={(v) => set("city", v)} error={errors.city} autoComplete="address-level2" />
                </div>
                <div className="field">
                  <label htmlFor="country">Land</label>
                  <select id="country" className="select" value={f.country} onChange={(e) => set("country", e.target.value)} autoComplete="country-name">
                    {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>

                {f.customerType === "business" && (
                  <>
                    <div className="sub-label">Facturatie <span className="opt">(optioneel)</span></div>
                    <div className="grid-2">
                      <Field label="Btw-nummer" name="vatNumber" value={f.vatNumber} onChange={(v) => set("vatNumber", v.toUpperCase())} error={errors.vatNumber} optional placeholder="NL123456789B01" maxLength={30} />
                      <Field label="KvK-nummer" name="cocNumber" value={f.cocNumber} onChange={(v) => set("cocNumber", v)} optional maxLength={30} />
                    </div>
                    <div className="grid-2">
                      <Field label="Referentie / PO-nummer" name="invoiceReference" value={f.invoiceReference} onChange={(v) => set("invoiceReference", v)} optional maxLength={80} />
                      <Field label="Factuur naar ander e-mailadres" name="invoiceEmail" type="email" value={f.invoiceEmail} onChange={(v) => set("invoiceEmail", v)} error={errors.invoiceEmail} optional inputMode="email" />
                    </div>
                  </>
                )}
              </div>
            </section>
          )}

          {/* ---------------- Stap 3 ---------------- */}
          {step === 2 && (
            <section className="card rise" aria-labelledby="s3">
              <h2 className="h2" id="s3">Voor wie is de cadeaubon?</h2>
              <p className="muted small" style={{ margin: "0 0 24px" }}>De naam en je boodschap komen op de digitale cadeaubon te staan.</p>
              <div className="grid-2" role="radiogroup" aria-label="Voor wie" data-error={!!errors.forSelf}>
                <button type="button" role="radio" className="choice" aria-checked={f.forSelf === true} onClick={() => set("forSelf", true)}>
                  <span className="dot" />
                  <span className="t">Voor mezelf</span>
                  <span className="s">Ik gebruik de bon zelf</span>
                </button>
                <button type="button" role="radio" className="choice" aria-checked={f.forSelf === false} onClick={() => set("forSelf", false)}>
                  <span className="dot" />
                  <span className="t">Voor iemand anders</span>
                  <span className="s">Ik geef de bon cadeau</span>
                </button>
              </div>
              {errors.forSelf && <p className="error-text" style={{ marginTop: 10 }}>{errors.forSelf}</p>}

              {f.forSelf === false && (
                <div className="stack rise" style={{ marginTop: 26 }}>
                  <div className="grid-2">
                    <Field label="Naam ontvanger" name="recipientName" value={f.recipientName} onChange={(v) => set("recipientName", v)} error={errors.recipientName} maxLength={60} />
                    <Field
                      label="Van"
                      name="fromName"
                      value={fromName}
                      onChange={(v) => { setFromTouched(true); set("fromName", v); }}
                      maxLength={60}
                      placeholder="Bijv. Mama & Papa"
                    />
                  </div>
                  <Field label="E-mailadres ontvanger" name="recipientEmail" type="email" value={f.recipientEmail} onChange={(v) => set("recipientEmail", v)} error={errors.recipientEmail} optional inputMode="email" />
                  <div className="field">
                    <label htmlFor="personalMessage">Persoonlijke boodschap <span className="opt">(optioneel)</span></label>
                    <textarea
                      id="personalMessage"
                      className="textarea"
                      value={f.personalMessage}
                      maxLength={MESSAGE_MAX}
                      placeholder="Een paar woorden die op de cadeaubon komen te staan…"
                      onChange={(e) => set("personalMessage", e.target.value)}
                    />
                    <span className="faint small" style={{ textAlign: "right" }}>{f.personalMessage.length} / {MESSAGE_MAX}</span>
                  </div>
                  <p className="faint small" style={{ margin: 0 }}>
                    De cadeaubon wordt na betaling naar jou gestuurd, zodat je hem zelf kunt geven.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ---------------- Stap 4 ---------------- */}
          {step === 3 && (
            <section className="card rise" aria-labelledby="s4">
              <h2 className="h2" id="s4">Controleer je bestelling</h2>
              <p className="muted small" style={{ margin: "0 0 22px" }}>Klopt alles? Dan kun je de cadeaubon bestellen.</p>

              <div className="mobile-preview"><VoucherPreview {...previewProps} /></div>

              <div className="sum-block">
                <div className="sum-head">
                  <span className="h3" style={{ margin: 0 }}>The Light Portraits Cadeaubon</span>
                  <button type="button" className="link-btn" onClick={() => goTo(0)}>Wijzig</button>
                </div>
                <Row k="Waarde" v={amount ? euro(amount) : "—"} />
                {f.forSelf === false ? (
                  <>
                    <Row k="Voor" v={f.recipientName} />
                    <Row k="Van" v={fromName} />
                    <Row k="E-mail ontvanger" v={f.recipientEmail} />
                    <Row k="Boodschap" v={f.personalMessage ? <em className="msg">“{f.personalMessage}”</em> : undefined} />
                  </>
                ) : (
                  <Row k="Voor" v="Mezelf" />
                )}
                <button type="button" className="link-btn under" onClick={() => goTo(2)}>Ontvanger wijzigen</button>
              </div>

              <div className="sum-block">
                <div className="sum-head">
                  <span className="h3" style={{ margin: 0 }}>Bestelgegevens</span>
                  <button type="button" className="link-btn" onClick={() => goTo(1)}>Wijzig</button>
                </div>
                <Row k="Type" v={f.customerType === "business" ? "Zakelijk" : "Particulier"} />
                {f.customerType === "business" ? (
                  <>
                    <Row k="Bedrijf" v={f.companyName} />
                    <Row k="Contactpersoon" v={f.contactPerson} />
                  </>
                ) : (
                  <Row k="Naam" v={buyerName(f)} />
                )}
                <Row k="E-mail" v={f.email} />
                <Row k="Telefoon" v={f.phone} />
                <Row k={f.customerType === "business" ? "Factuuradres" : "Adres"} v={<>{f.street} {f.houseNumber}<br />{f.postalCode} {f.city}<br />{f.country}</>} />
                {f.customerType === "business" && (
                  <>
                    <Row k="Btw-nummer" v={f.vatNumber} />
                    <Row k="KvK" v={f.cocNumber} />
                    <Row k="Referentie" v={f.invoiceReference} />
                    <Row k="Factuur-e-mail" v={f.invoiceEmail} />
                  </>
                )}
              </div>

              <div className="total">
                <span>Totaal</span>
                <span className="display">{amount ? euro(amount) : "—"}</span>
              </div>

              <div className="notice" style={{ marginTop: 22 }}>
                <InfoIcon />
                <div>
                  <strong style={{ fontWeight: 400, color: "var(--text)" }}>Er vindt nu nog geen online betaling plaats.</strong>
                  <br />
                  Na je bestelling ontvang je per e-mail een factuur met de betaalinformatie. Zodra de betaling binnen is, wordt de cadeaubon geactiveerd en sturen we je de digitale cadeaubon.
                </div>
              </div>

              <label className="check" style={{ marginTop: 22 }} data-error={!!errors.acceptTerms}>
                <input type="checkbox" checked={f.acceptTerms} onChange={(e) => set("acceptTerms", e.target.checked)} />
                <span>
                  Ik ga akkoord met de{" "}
                  {settings.termsUrl ? <a href={settings.termsUrl} target="_blank" rel="noreferrer">voorwaarden</a> : "voorwaarden"}{" "}
                  en begrijp dat de cadeaubon pas na betaling actief wordt.
                </span>
              </label>
              {errors.acceptTerms && <p className="error-text" style={{ margin: "8px 0 0 32px" }}>{errors.acceptTerms}</p>}

              {/* spam-val: onzichtbaar voor mensen */}
              <div className="hp" aria-hidden>
                <label>Website <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} /></label>
              </div>

              {serverError && <div className="alert" style={{ marginTop: 20 }} role="alert">{serverError}</div>}
            </section>
          )}

          {/* ---------------- Stap 5 ---------------- */}
          {step === 4 && (
            <section className="card confirm rise" aria-labelledby="s5">
              <div className="confirm-mark" aria-hidden>
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                  <circle cx="22" cy="22" r="21" stroke="var(--copper)" strokeWidth="1" />
                  <path d="M14 22.5l5.5 5.5L30.5 17" stroke="var(--gold)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="h1" id="s5" style={{ fontSize: "clamp(34px,6vw,46px)" }}>Bedankt voor je bestelling</h2>
              <p className="lead" style={{ marginTop: 14 }}>We hebben je aanvraag voor een The Light Portraits cadeaubon ontvangen.</p>

              <div className="order-no">
                <span className="eyebrow">Bestelnummer</span>
                <span className="mono" style={{ fontSize: 20 }}>{orderNumber}</span>
              </div>

              <ol className="next-steps">
                <li><span>1</span><p>Je ontvangt een bevestiging en daarna een factuur op <strong>{f.email}</strong>.</p></li>
                <li><span>2</span><p>Na ontvangst van de betaling wordt de cadeaubon geactiveerd.</p></li>
                <li><span>3</span><p>Je krijgt de digitale cadeaubon als PDF, klaar om cadeau te geven.</p></li>
              </ol>

              <div className="notice" style={{ textAlign: "left" }}>
                <InfoIcon />
                <div>Let op: de cadeaubon is <strong style={{ fontWeight: 400, color: "var(--text)" }}>nog niet actief</strong>. Hij kan pas gebruikt worden nadat de betaling is verwerkt.</div>
              </div>

              <button type="button" className="btn ghost" style={{ marginTop: 28 }} onClick={() => { setF(EMPTY); setOrderNumber(null); setFromTouched(false); setErrors({}); goTo(0); }}>
                Nog een cadeaubon bestellen
              </button>
            </section>
          )}

          {step < 4 && (
            <div className="actions">
              {step > 0 ? (
                <button type="button" className="btn quiet" onClick={() => goTo(step - 1)}>← Terug</button>
              ) : <span />}
              {step < 3 ? (
                <button type="button" className="btn" onClick={next}>Verder</button>
              ) : (
                <button type="button" className="btn" onClick={submit} disabled={submitting}>
                  {submitting ? "Bezig…" : "Cadeaubon bestellen"}
                </button>
              )}
            </div>
          )}
        </main>

        {step < 4 && (
          <aside className={`aside${step === 0 ? "" : " hide-m"}`} aria-label="Voorbeeld">
            <div className="aside-sticky">
              <VoucherPreview {...previewProps} />
              <div className="aside-total">
                <span className="eyebrow">Totaal</span>
                <span className="display" style={{ fontSize: 30 }}>{amount ? euro(amount) : "—"}</span>
              </div>
              <p className="faint small" style={{ margin: "6px 0 0" }}>
                Betaling via factuur na je bestelling. De code wordt geactiveerd na ontvangst van de betaling.
              </p>
            </div>
          </aside>
        )}
      </div>

      <footer className="foot">
        <span className="eyebrow" style={{ fontSize: 10 }}>© The Light Portraits</span>
      </footer>

      <style>{flowCss}</style>
    </div>
  );
}

const flowCss = `
.shell { max-width: 1080px; margin: 0 auto; padding: 48px 20px 40px; }
.brand { text-align: center; margin-bottom: 30px; scroll-margin-top: 16px; }
.brand-name { font-family: var(--font-display); font-size: 44px; font-weight: 500; letter-spacing: .08em; text-transform: uppercase; margin: 0; line-height: 1.05; }
.brand-tagline { font-family: var(--font-display); font-style: italic; font-size: 20px; margin-top: 10px; }
.brand-tagline em { color: var(--copper); }
.brand-rule { width: 120px; height: 1px; background: var(--copper); margin: 22px auto 26px; opacity: .6; }
.intro-title { font-size: clamp(32px, 6vw, 44px) !important; }
@media (max-width: 600px) { .brand-name { font-size: 36px; } }
.intro { max-width: 560px; margin: 16px auto 0; }
.stepper { list-style: none; display: flex; justify-content: center; gap: 6px; padding: 0; margin: 0 auto 34px; max-width: 720px; }
.stepper li { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative; color: var(--faint); font-size: 11px; letter-spacing: .16em; text-transform: uppercase; }
.stepper li:not(:last-child)::after { content: ""; position: absolute; top: 14px; left: calc(50% + 22px); right: calc(-50% + 22px); height: 1px; background: var(--line); }
.stepper li.is-done:not(:last-child)::after { background: var(--copper); opacity: .6; }
.stepper .n { width: 29px; height: 29px; border-radius: 50%; border: 1px solid var(--line); display: grid; place-items: center; font-size: 12px; letter-spacing: 0; background: var(--bg); }
.stepper li.is-current { color: var(--text); }
.stepper li.is-current .n { border-color: var(--copper); color: var(--gold); }
.stepper li.is-done .n { border-color: var(--copper); background: var(--copper); color: #131315; }
@media (max-width: 600px) {
  .stepper .l { display: none; }
  .stepper li.is-current .l { display: block; position: absolute; top: 36px; white-space: nowrap; }
  .stepper { margin-bottom: 46px; }
}
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 32px; align-items: start; }
.layout.single { grid-template-columns: minmax(0, 640px); justify-content: center; }
.aside-sticky { position: sticky; top: 24px; }
.aside-total { display: flex; justify-content: space-between; align-items: baseline; margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--line-soft); }
.mobile-preview { display: none; margin-bottom: 22px; }
@media (max-width: 900px) {
  .layout { grid-template-columns: minmax(0, 1fr); }
  .aside { order: -1; }
  .aside-sticky { position: static; max-width: 420px; margin: 0 auto; }
  .aside-total, .aside .faint { display: none; }
  .aside.hide-m { display: none; }
  .mobile-preview { display: block; }
}
.custom-amount { margin-top: 18px; display: grid; grid-template-columns: 1fr 180px; gap: 16px; align-items: center; }
.custom-amount .label { text-transform: none; letter-spacing: .02em; font-size: 14px; color: var(--muted); }
.euro-input { position: relative; }
.euro-input span { position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: var(--muted); font-family: var(--font-display); font-size: 20px; }
.euro-input .input { padding-left: 34px; font-family: var(--font-display); font-size: 20px; }
.custom-amount.is-active .input { border-color: var(--copper); }
@media (max-width: 520px) { .custom-amount { grid-template-columns: 1fr; gap: 8px; } }
.step-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
.segmented.mini { padding: 3px; }
.segmented.mini button { min-height: 34px; padding: 0 12px; font-size: 10px; }
.sub-label { font-size: 11px; letter-spacing: .24em; text-transform: uppercase; color: var(--copper-hi); margin-top: 10px; padding-top: 18px; border-top: 1px solid var(--line-soft); }
.sub-label .opt { color: var(--faint); letter-spacing: 0; text-transform: none; font-size: 12px; }
.actions { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 22px; }
.actions .btn:last-child { min-width: 200px; }
@media (max-width: 600px) {
  .actions { position: sticky; bottom: 0; margin: 22px -20px 0; padding: 14px 20px calc(14px + env(safe-area-inset-bottom)); background: linear-gradient(180deg, rgba(19,19,21,0), rgba(19,19,21,.94) 26%); }
  .actions .btn:last-child { flex: 1; min-width: 0; }
}
.sum-block { border-top: 1px solid var(--line-soft); padding: 18px 0 14px; }
.sum-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.sum-row { display: grid; grid-template-columns: 150px 1fr; gap: 12px; padding: 6px 0; font-size: 15px; }
.sum-row .k { color: var(--muted); font-size: 13px; padding-top: 2px; }
.sum-row .v { overflow-wrap: anywhere; }
.sum-row .msg { font-family: var(--font-display); font-size: 17px; color: #d8d1c6; }
@media (max-width: 480px) { .sum-row { grid-template-columns: 1fr; gap: 2px; } }
.link-btn { background: none; border: 0; padding: 4px 0; color: var(--copper-hi); font-size: 12px; letter-spacing: .14em; text-transform: uppercase; cursor: pointer; }
.link-btn.under { margin-top: 6px; }
.link-btn:hover { color: var(--gold); }
.total { display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid var(--line); padding-top: 18px; margin-top: 6px; }
.total span:first-child { font-size: 12px; letter-spacing: .26em; text-transform: uppercase; color: var(--muted); }
.total .display { font-size: 38px; color: var(--gold); }
.confirm { text-align: center; padding: 48px 36px; }
.confirm-mark { display: flex; justify-content: center; margin-bottom: 22px; }
.order-no { display: inline-flex; flex-direction: column; gap: 6px; border: 1px solid var(--line); border-radius: var(--radius); padding: 16px 28px; margin: 28px 0 26px; background: var(--bg-2); }
.next-steps { list-style: none; padding: 0; margin: 0 auto 26px; max-width: 460px; text-align: left; display: flex; flex-direction: column; gap: 12px; }
.next-steps li { display: flex; gap: 14px; color: var(--muted); font-size: 15px; }
.next-steps li span { flex: none; width: 24px; height: 24px; border: 1px solid var(--copper); border-radius: 50%; display: grid; place-items: center; font-size: 11px; color: var(--gold); margin-top: 1px; }
.next-steps p { margin: 0; }
.next-steps strong { font-weight: 400; color: var(--text); overflow-wrap: anywhere; }
.foot { text-align: center; margin-top: 56px; opacity: .7; }
@media (max-width: 600px) { .shell { padding-top: 32px; } .confirm { padding: 36px 20px; } }
`;
