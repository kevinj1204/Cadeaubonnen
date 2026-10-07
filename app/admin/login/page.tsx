"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || "Inloggen mislukt.");
    router.replace("/admin");
    router.refresh();
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <form onSubmit={submit} className="card rise" style={{ width: "100%", maxWidth: 400, textAlign: "center", padding: "40px 32px" }}>
        <div className="eyebrow" style={{ color: "var(--text)", letterSpacing: ".42em" }}>The Light Portraits</div>
        <hr className="rule" />
        <h1 className="h2" style={{ fontStyle: "italic", fontWeight: 300 }}>Cadeaubonnen</h1>
        <p className="muted small" style={{ margin: "0 0 26px" }}>Backoffice</p>
        <div className="field" style={{ textAlign: "left" }}>
          <label htmlFor="pw">Wachtwoord</label>
          <input id="pw" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
        </div>
        {error && <p className="error-text" style={{ textAlign: "left" }}>{error}</p>}
        <button className="btn block" style={{ marginTop: 22 }} disabled={busy || !password}>{busy ? "Bezig…" : "Inloggen"}</button>
      </form>
    </div>
  );
}
