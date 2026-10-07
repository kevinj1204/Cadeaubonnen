// =====================================================================
// End-to-end test van bestellen, activeren, restwaarde en gelijktijdig gebruik.
//
// Gebruik (tegen een lokale of test-omgeving — NIET je live database):
//   BASE_URL=http://localhost:3000 ADMIN_PASSWORD=... BOOKING_API_KEY=... npm run test:api
// Leest ontbrekende waarden uit .env.local.
// =====================================================================
import { existsSync, readFileSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const KEY = process.env.BOOKING_API_KEY;
const PW = process.env.ADMIN_PASSWORD;
let cookie = "";
let passed = 0;
let failed = 0;

function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

async function http(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("json") ? await res.json() : await res.arrayBuffer();
  return { status: res.status, data };
}
const api = (path, body) => http("POST", `/api/v1/vouchers/${path}`, body, { Authorization: `Bearer ${KEY}` });
const ref = (s) => `TEST-${s}-${Date.now().toString(36)}`;

console.log(`\nTesten tegen ${BASE}\n`);

// 1. Bestelling plaatsen als klant
console.log("Bestellen");
const order = await http("POST", "/api/orders", {
  customerType: "private", amount: 100, firstName: "Test", lastName: "Klant", email: "test@example.com", phone: "0612345678",
  street: "Teststraat", houseNumber: "1", postalCode: "1851AB", city: "Heiloo", country: "Nederland",
  forSelf: false, recipientName: "Sophie", fromName: "Test", personalMessage: "Veel plezier!", acceptTerms: true,
});
check("bestelling geplaatst", order.status === 200 && order.data.ok, order.data);
const bad = await http("POST", "/api/orders", { customerType: "private", amount: 5, email: "x", acceptTerms: true });
check("ongeldige bestelling geweigerd (422)", bad.status === 422 && bad.data.errors?.amount, bad.data);

// 2. Backoffice
console.log("Backoffice");
const wrong = await http("POST", "/api/admin/login", { password: "fout-wachtwoord" });
check("fout wachtwoord geweigerd", wrong.status === 401);
cookie = "";
const login = await http("POST", "/api/admin/login", { password: PW });
check("inloggen", login.status === 200, login.data);
const list = await http("GET", `/api/admin/orders?q=${order.data.orderNumber}`);
check("bestelling vindbaar op bestelnummer", list.data.rows?.length === 1, list.data);
const row = list.data.rows[0];
const code = row.code;
check("code heeft formaat TLP-XXXX-XXXX", /^TLP-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), code);
check("status is 'ordered' (besteld, niet actief)", row.status === "ordered", row.status);
const byCode = await http("GET", `/api/admin/orders?q=${code.slice(4, 8)}`);
check("zoeken op deel van de code", byCode.data.rows?.some((r) => r.code === code));

// 3. Niet-betaalde bon is niet bruikbaar
console.log("Niet betaald = niet bruikbaar");
let c = await api("check", { code });
check("check: niet geldig, reden not_paid", c.data.voucher?.valid === false && c.data.voucher.reason === "not_paid", c.data);
let h = await api("hold", { code, booking_ref: ref("X"), booking_total_cents: 5000 });
check("hold geweigerd (409)", h.status === 409 && h.data.error === "not_paid", h.data);

// 4. Activeren
console.log("Activeren");
let a = await http("POST", `/api/admin/orders/${row.id}`, { action: "mark_invoiced" });
check("factuur verstuurd → wacht op betaling", a.data.voucher?.status === "awaiting_payment", a.data.error);
a = await http("POST", `/api/admin/orders/${row.id}`, { action: "mark_paid", sendEmail: false });
check("betaald → actief", a.data.voucher?.status === "active", a.data.error);
check("vervaldatum gezet", !!a.data.voucher?.expires_at);
const pdf = await http("GET", `/api/admin/orders/${row.id}/pdf`);
check("PDF wordt gegenereerd", pdf.status === 200 && Buffer.from(pdf.data).subarray(0, 4).toString() === "%PDF");
const cust = await fetch(BASE + a.data.customerPdfLink);
check("klant-downloadlink werkt", cust.status === 200);
const custBad = await fetch(BASE + a.data.customerPdfLink.replace(/t=.{4}/, "t=XXXX"));
check("klantlink met verkeerde sleutel geweigerd", custBad.status === 404);

// 5. Restwaarde: €100 bon, shoot €75
console.log("Restwaarde (€100 bon, boeking €75 en daarna €165)");
c = await api("check", { code: code.toLowerCase().replace(/-/g, " "), booking_total_cents: 7500 });
check("check accepteert code in kleine letters/spaties", c.data.voucher?.valid === true, c.data);
check("check: €75 verrekend, €0 te betalen, €25 blijft over", c.data.voucher.applied_cents === 7500 && c.data.voucher.to_pay_cents === 0 && c.data.voucher.remaining_after_cents === 2500, c.data.voucher);
const refA = ref("A");
h = await api("hold", { code, booking_ref: refA, booking_total_cents: 7500, description: "Fotoshoot test" });
check("hold €75 → rest €25, deels gebruikt", h.data.applied_cents === 7500 && h.data.voucher?.remaining_cents === 2500 && h.data.voucher.status === "partially_used", h.data);
const again = await api("hold", { code, booking_ref: refA, booking_total_cents: 7500 });
check("zelfde boeking nogmaals → niet dubbel afgeboekt", again.data.idempotent === true && again.data.voucher.remaining_cents === 2500, again.data);
const cap = await api("capture", { code, booking_ref: refA });
check("capture (boeking goedgekeurd)", cap.data.ok && cap.data.redemption.status === "captured", cap.data);
const rel0 = await api("release", { code, booking_ref: refA });
check("release na capture zonder force geweigerd", rel0.status === 409 && rel0.data.error === "already_captured", rel0.data);

const refB = ref("B");
h = await api("hold", { code, booking_ref: refB, booking_total_cents: 16500 });
check("boeking €165 → €25 verrekend, €140 te betalen", h.data.applied_cents === 2500 && h.data.to_pay_cents === 14000, h.data);
check("bon volledig gebruikt", h.data.voucher?.status === "used" && h.data.voucher.remaining_cents === 0, h.data.voucher);
c = await api("check", { code });
check("volledig gebruikte bon is niet meer geldig", c.data.voucher.valid === false && c.data.voucher.reason === "used");
const rel = await api("release", { code, booking_ref: refB, reason: "Test afgewezen" });
check("release (boeking afgewezen) → €25 terug op de bon", rel.data.ok && rel.data.voucher.remaining_cents === 2500 && rel.data.voucher.status === "partially_used", rel.data);
const relAgain = await api("release", { code, booking_ref: refB });
check("release nogmaals → idempotent", relAgain.data.ok && relAgain.data.idempotent === true, relAgain.data);

// 6. Gelijktijdige boekingen
console.log("Gelijktijdig gebruik (10 boekingen van €30 tegelijk op een bon van €100)");
const manual = await http("POST", "/api/admin/orders", { customerType: "private", amount: 100, firstName: "Gelijk", lastName: "Tijdig", email: "race@example.com", activate: true });
check("handmatig aangemaakte, actieve bon", manual.status === 200 && manual.data.code, manual.data);
const results = await Promise.all(
  Array.from({ length: 10 }, (_, i) => api("hold", { code: manual.data.code, booking_ref: ref(`R${i}`), booking_total_cents: 3000 })),
);
const ok = results.filter((r) => r.data.ok);
const totalApplied = ok.reduce((s, r) => s + r.data.applied_cents, 0);
check(`samen precies €100 afgeboekt (niet meer)`, totalApplied === 10000, results.map((r) => r.data.applied_cents ?? r.data.error));
check("4 boekingen geslaagd (3× €30 + 1× €10), rest geweigerd", ok.length === 4 && results.filter((r) => r.status === 409).length === 6);
c = await api("check", { code: manual.data.code });
check("saldo staat op €0", c.data.voucher.remaining_cents === 0);

// 7. Beveiliging en foutgevallen
console.log("Beveiliging");
const noKey = await http("POST", "/api/v1/vouchers/check", { code }, {});
check("zonder API-sleutel geweigerd (401)", noKey.status === 401);
const badKey = await http("POST", "/api/v1/vouchers/check", { code }, { Authorization: "Bearer verkeerd" });
check("verkeerde API-sleutel geweigerd (401)", badKey.status === 401);
const unknown = await api("check", { code: "TLP-AAAA-AAAA" });
check("onbekende code → 404", unknown.status === 404 && unknown.data.error === "not_found");
const malformed = await api("check", { code: "hallo" });
check("ongeldig formaat → 400", malformed.status === 400);
const savedCookie = cookie;
cookie = "";
const anon = await http("GET", "/api/admin/orders");
check("backoffice-API zonder login geweigerd (401)", anon.status === 401);
cookie = savedCookie;
const blk = await http("POST", `/api/admin/orders/${row.id}`, { action: "block", reason: "test" });
check("blokkeren", blk.data.voucher?.status === "blocked");
h = await api("hold", { code, booking_ref: ref("C"), booking_total_cents: 1000 });
check("geblokkeerde bon niet bruikbaar", h.status === 409 && h.data.error === "blocked");
const unb = await http("POST", `/api/admin/orders/${row.id}`, { action: "unblock" });
check("deblokkeren → terug naar deels gebruikt", unb.data.voucher?.status === "partially_used");
const health = await http("GET", "/api/v1/health", null, { Authorization: `Bearer ${KEY}` });
check("health-check met sleutel", health.data.ok === true);

// 8. Verwijderen
console.log("Verwijderen");
const usedDel = await http("DELETE", `/api/admin/orders/${row.id}`);
check("gebruikte bon kan niet verwijderd worden", usedDel.status === 400, usedDel.data);
const fresh = await http("POST", "/api/admin/orders", { customerType: "private", amount: 25, firstName: "Weg", lastName: "Ermee", email: "weg@example.com" });
const del = await http("DELETE", `/api/admin/orders/${fresh.data.id}`);
check("ongebruikte bon verwijderd", del.status === 200 && del.data.ok, del.data);
const gone = await http("GET", `/api/admin/orders/${fresh.data.id}`);
check("verwijderde bestelling bestaat niet meer", gone.status === 404);
c = await api("check", { code: fresh.data.code });
check("verwijderde code is onbekend", c.status === 404);

console.log(`\n${failed ? "✗" : "✓"} ${passed} geslaagd, ${failed} mislukt\n`);
process.exit(failed ? 1 : 0);
