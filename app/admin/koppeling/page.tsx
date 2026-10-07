import { requireAdminPage } from "@/components/admin-guard";
import AdminShell from "@/components/admin-shell";
import { appUrl } from "@/lib/email";
import CodeTester from "./code-tester";

export const dynamic = "force-dynamic";

const ENDPOINTS = [
  ["POST", "/api/v1/vouchers/check", "Code controleren (wijzigt niets). Geeft geldigheid, oorspronkelijke waarde, restwaarde en — met booking_total_cents — wat er verrekend wordt."],
  ["POST", "/api/v1/vouchers/hold", "Bij een boekingsaanvraag: tegoed reserveren. Het bedrag gaat direct van de bon af, zodat het niet dubbel gebruikt kan worden."],
  ["POST", "/api/v1/vouchers/capture", "Bij goedkeuring van de boeking: reservering definitief maken."],
  ["POST", "/api/v1/vouchers/release", "Bij afwijzing/annulering: reservering vrijgeven, het bedrag komt terug op de bon."],
  ["POST", "/api/v1/vouchers/redeem", "Reserveren + direct definitief in één stap (voor boekingen zonder goedkeuringsstap)."],
  ["GET", "/api/v1/health", "Test of de API-sleutel werkt."],
];

export default async function Page() {
  await requireAdminPage();
  const base = appUrl();
  const keyOk = (process.env.BOOKING_API_KEY || "").length >= 32;
  return (
    <AdminShell>
      <div className="page-head">
        <div>
          <div className="eyebrow">Boekingsapp</div>
          <h1 className="h1">Koppeling</h1>
        </div>
      </div>

      <div className="detail">
        <div>
          <section className="panel">
            <h3 className="h3">Hoe het werkt</h3>
            <ol className="muted" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
              <li>Klant vult in de boekingsapp een cadeauboncode in → de boekingsapp roept <code className="inline">check</code> aan en toont het tegoed en het nieuwe totaal.</li>
              <li>Klant verstuurt de boekingsaanvraag → <code className="inline">hold</code> reserveert het bedrag op de bon.</li>
              <li>Jij keurt de boeking goed → <code className="inline">capture</code>. Wijs je af → <code className="inline">release</code> en het tegoed staat er weer op.</li>
            </ol>
            <p className="muted small" style={{ marginBottom: 0 }}>
              De boekingsapp (Google Apps Script) praat server-side met deze API. De geheime sleutel staat alleen in de Script Properties van Apps Script en nooit in de browser. Zie de map <code className="inline">apps-script/</code> en de README.
            </p>
          </section>

          <section className="panel">
            <h3 className="h3">Endpoints</h3>
            <p className="small muted" style={{ marginTop: 0 }}>Basis-URL: <code className="inline">{base}</code></p>
            <table className="mini-table">
              <tbody>
                {ENDPOINTS.map(([m, p, d]) => (
                  <tr key={p}>
                    <td style={{ whiteSpace: "nowrap" }}><code className="inline">{m}</code></td>
                    <td><code style={{ fontSize: 13 }}>{p}</code><div className="sub" style={{ marginTop: 4 }}>{d}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted">Elke aanroep met header <code className="inline">Authorization: Bearer &lt;BOOKING_API_KEY&gt;</code>. Bedragen in centen.</p>
            <pre className="code">{`POST ${base}/api/v1/vouchers/hold
{
  "code": "TLP-A3C6-K9QX",
  "booking_ref": "BOEKING-2026-0142",
  "booking_total_cents": 16500,
  "description": "Fotoshoot 14 november"
}

→ { "ok": true, "applied_cents": 10000, "to_pay_cents": 6500,
    "voucher": { "remaining_cents": 0, "status": "used", ... } }`}</pre>
          </section>
        </div>

        <aside>
          <section className="panel">
            <h3 className="h3">Status</h3>
            <span className={`statusline${keyOk ? " ok" : ""}`}>{keyOk ? "API-sleutel is ingesteld" : "BOOKING_API_KEY ontbreekt in Vercel"}</span>
          </section>
          <CodeTester />
        </aside>
      </div>
    </AdminShell>
  );
}
