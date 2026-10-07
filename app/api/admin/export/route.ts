// CSV-export van alle bestellingen (voor je administratie)
import { query } from "@/lib/db";
import { STATUS_LABELS, PAYMENT_LABELS, customerName } from "@/lib/format";
import { requireAdmin } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const rows = await query(
    `SELECT o.*, v.code, v.status, v.original_cents, v.remaining_cents, v.activated_at, v.expires_at
     FROM orders o LEFT JOIN vouchers v ON v.order_id = o.id ORDER BY o.created_at`,
  );
  const cols = [
    "Bestelnummer", "Datum", "Type", "Naam/Bedrijf", "Contactpersoon", "E-mail", "Telefoon", "Adres", "Postcode", "Plaats", "Land",
    "Btw-nummer", "KvK", "Kenmerk", "Ontvanger", "Code", "Waarde", "Restwaarde", "Status", "Betaling", "Betaald op", "Geldig tot",
  ];
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const d = (x: any) => (x ? new Date(x).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam" }) : "");
  const money = (c: number | null) => (c === null || c === undefined ? "" : (c / 100).toFixed(2).replace(".", ","));
  const lines = [cols.join(";")];
  for (const r of rows) {
    lines.push(
      [
        r.order_number, d(r.created_at), r.customer_type === "business" ? "Zakelijk" : "Particulier", customerName(r), r.contact_person,
        r.email, r.phone, [r.street, r.house_number].filter(Boolean).join(" "), r.postal_code, r.city, r.country, r.vat_number, r.coc_number,
        r.invoice_reference, r.recipient_name, r.code, money(r.original_cents), money(r.remaining_cents),
        STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? r.status, PAYMENT_LABELS[r.payment_status] ?? r.payment_status, d(r.paid_at), d(r.expires_at),
      ].map(cell).join(";"),
    );
  }
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cadeaubonnen-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
