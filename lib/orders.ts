import type { PoolClient } from "pg";
import { logEvent, query, queryOne, tx } from "./db";
import { generateCode } from "./codes";
import { euro, STATUS_LABELS, type VoucherStatus } from "./format";
import type { OrderInput } from "./validation";
import type { Settings } from "./settings";

async function nextOrderNumber(c: PoolClient): Promise<string> {
  const r = await c.query<{ n: string }>("SELECT nextval('order_number_seq') AS n");
  const year = new Date().getFullYear();
  return `CB-${year}-${String(r.rows[0].n).padStart(4, "0")}`;
}

async function uniqueCode(c: PoolClient): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    const r = await c.query("SELECT 1 FROM vouchers WHERE code = $1", [code]);
    if (!r.rowCount) return code;
  }
  throw new Error("Kon geen unieke code maken");
}

/** Maakt bestelling + gereserveerde (nog niet actieve) cadeaubon aan. */
export async function createOrder(
  input: OrderInput,
  opts: { source: "web" | "admin"; ipHash?: string; activate?: boolean; settings?: Settings; actor?: string } = { source: "web" },
) {
  return tx(async (c) => {
    const orderNumber = await nextOrderNumber(c);
    const amountCents = Math.round(input.amount * 100);
    const fromName =
      input.fromName ||
      (input.customerType === "business" ? input.companyName : [input.firstName, input.lastName].filter(Boolean).join(" "));

    const o = await c.query(
      `INSERT INTO orders (order_number, source, customer_type, first_name, last_name, company_name, contact_person,
         vat_number, coc_number, invoice_reference, invoice_email, email, phone, street, house_number, postal_code, city, country,
         for_self, recipient_name, recipient_email, from_name, personal_message, amount_cents, ip_hash,
         payment_status, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
       RETURNING *`,
      [
        orderNumber, opts.source, input.customerType, input.firstName || null, input.lastName || null,
        input.companyName || null, input.contactPerson || null, input.vatNumber || null, input.cocNumber || null,
        input.invoiceReference || null, input.invoiceEmail || null, input.email, input.phone || null, input.street || null,
        input.houseNumber || null, input.postalCode || null, input.city || null, input.country || null, input.forSelf,
        input.recipientName || null, input.recipientEmail || null, input.forSelf ? null : fromName || null,
        input.personalMessage || null, amountCents, opts.ipHash ?? null,
        opts.activate ? "paid" : "unpaid", opts.activate ? new Date() : null,
      ],
    );
    const order = o.rows[0];
    const code = await uniqueCode(c);
    const months = opts.settings?.validityMonths ?? 0;
    const v = await c.query(
      `INSERT INTO vouchers (code, order_id, original_cents, remaining_cents, status, recipient_name, recipient_email,
          from_name, personal_message, activated_at, expires_at, pdf_generated_at)
       VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,
          CASE WHEN $9::timestamptz IS NOT NULL AND $10::int > 0 THEN ((((now() AT TIME ZONE 'Europe/Amsterdam')::date + make_interval(months => $10::int))::date + time '23:59') AT TIME ZONE 'Europe/Amsterdam') END,
          now())
       RETURNING *`,
      [
        code, order.id, amountCents, opts.activate ? "active" : "ordered",
        input.forSelf ? null : input.recipientName || null, input.forSelf ? null : input.recipientEmail || null,
        input.forSelf ? null : fromName || null, input.forSelf ? null : input.personalMessage || null,
        opts.activate ? new Date() : null, months,
      ],
    );
    await logEvent(c, {
      orderId: order.id,
      voucherId: v.rows[0].id,
      type: "created",
      actor: opts.actor ?? (opts.source === "web" ? "customer" : "admin"),
      message:
        opts.source === "web"
          ? `Bestelling geplaatst via de website (${euro(amountCents)}). Code ${code} gereserveerd, nog niet actief.`
          : `Cadeaubon handmatig aangemaakt in de backoffice (${euro(amountCents)})${opts.activate ? " en direct geactiveerd" : ""}.`,
    });
    return { order, voucher: v.rows[0] };
  });
}

export async function getOrderDetail(id: string) {
  const order = await queryOne("SELECT * FROM orders WHERE id = $1", [id]);
  if (!order) return null;
  const voucher = await queryOne("SELECT * FROM vouchers WHERE order_id = $1 ORDER BY created_at LIMIT 1", [id]);
  const redemptions = voucher
    ? await query("SELECT * FROM redemptions WHERE voucher_id = $1 ORDER BY created_at DESC", [voucher.id])
    : [];
  const events = await query("SELECT * FROM events WHERE order_id = $1 ORDER BY created_at DESC, id DESC", [id]);
  const emails = await query("SELECT * FROM email_log WHERE order_id = $1 ORDER BY created_at DESC", [id]);
  return { order, voucher, redemptions, events, emails };
}

export async function searchOrders(params: { q?: string; status?: string; limit?: number; offset?: number }) {
  const where: string[] = [];
  const args: unknown[] = [];
  if (params.q) {
    args.push(`%${params.q.trim().toLowerCase()}%`);
    const p = `$${args.length}`;
    args.push(params.q.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""));
    const pc = `$${args.length}`;
    where.push(`(
      lower(o.order_number) LIKE ${p} OR lower(o.email) LIKE ${p} OR lower(coalesce(o.company_name,'')) LIKE ${p}
      OR lower(coalesce(o.first_name,'') || ' ' || coalesce(o.last_name,'')) LIKE ${p}
      OR lower(coalesce(o.contact_person,'')) LIKE ${p} OR lower(coalesce(v.recipient_name,'')) LIKE ${p}
      OR lower(coalesce(o.phone,'')) LIKE ${p}
      OR (length(${pc}) >= 3 AND replace(v.code,'-','') LIKE '%' || ${pc} || '%')
    )`);
  }
  if (params.status && params.status !== "all") {
    if (params.status === "pending") where.push("v.status IN ('ordered','awaiting_payment')");
    else {
      args.push(params.status);
      where.push(`v.status = $${args.length}`);
    }
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  args.push(Math.min(params.limit ?? 50, 200));
  args.push(params.offset ?? 0);
  const rows = await query(
    `SELECT o.id, o.order_number, o.created_at, o.customer_type, o.first_name, o.last_name, o.company_name, o.contact_person,
            o.email, o.phone, o.amount_cents, o.payment_status, o.source,
            v.code, v.status, v.original_cents, v.remaining_cents, v.recipient_name, v.expires_at,
            count(*) OVER() AS total
     FROM orders o LEFT JOIN vouchers v ON v.order_id = o.id
     ${whereSql}
     ORDER BY o.created_at DESC
     LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args,
  );
  const counts = await query<{ status: string; n: string }>("SELECT status, count(*) AS n FROM vouchers GROUP BY status");
  return { rows, total: Number(rows[0]?.total ?? 0), counts: Object.fromEntries(counts.map((r) => [r.status, Number(r.n)])) };
}

// ---------------------------------------------------------------------
// Statusacties vanuit de backoffice
// ---------------------------------------------------------------------
export type AdminAction =
  | { action: "mark_invoiced"; note?: string }
  | { action: "mark_paid"; sendEmail?: boolean; note?: string }
  | { action: "block"; reason?: string }
  | { action: "unblock" }
  | { action: "cancel"; reason?: string }
  | { action: "reopen" }
  | { action: "set_expiry"; expiresAt: string | null }
  | { action: "update_details"; recipientName?: string; recipientEmail?: string; fromName?: string; personalMessage?: string }
  | { action: "regenerate_pdf" }
  | { action: "set_notes"; notes: string }
  | { action: "set_status"; status: VoucherStatus };

export class ActionError extends Error {}

export async function applyAdminAction(orderId: string, a: AdminAction, settings: Settings) {
  return tx(async (c) => {
    const o = (await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
    if (!o) throw new ActionError("Bestelling niet gevonden");
    const v = (await c.query("SELECT * FROM vouchers WHERE order_id=$1 FOR UPDATE", [orderId])).rows[0];
    if (!v) throw new ActionError("Geen cadeaubon bij deze bestelling");
    const log = (type: string, message: string) => logEvent(c, { orderId, voucherId: v.id, type, message, actor: "admin" });
    let activated = false;

    switch (a.action) {
      case "mark_invoiced": {
        if (!["ordered", "awaiting_payment"].includes(v.status)) throw new ActionError("Alleen mogelijk voor bestellingen die nog niet betaald zijn.");
        await c.query("UPDATE orders SET payment_status='invoiced', invoice_sent_at=now(), payment_note=coalesce($2,payment_note), updated_at=now() WHERE id=$1", [orderId, a.note || null]);
        await c.query("UPDATE vouchers SET status='awaiting_payment', updated_at=now() WHERE id=$1", [v.id]);
        await log("invoiced", `Factuur verstuurd — status naar "Wacht op betaling".${a.note ? ` Notitie: ${a.note}` : ""}`);
        break;
      }
      case "mark_paid": {
        if (!["ordered", "awaiting_payment"].includes(v.status)) throw new ActionError("Deze cadeaubon is al actief of afgesloten.");
        await c.query("UPDATE orders SET payment_status='paid', paid_at=now(), payment_note=coalesce($2,payment_note), updated_at=now() WHERE id=$1", [orderId, a.note || null]);
        await c.query(
          `UPDATE vouchers SET status='active', activated_at=now(), updated_at=now(),
             expires_at = CASE WHEN expires_at IS NULL AND $2::int > 0
                               THEN ((((now() AT TIME ZONE 'Europe/Amsterdam')::date + make_interval(months => $2::int))::date + time '23:59') AT TIME ZONE 'Europe/Amsterdam')
                               ELSE expires_at END
           WHERE id=$1`,
          [v.id, settings.validityMonths],
        );
        await log("activated", `Betaling ontvangen — cadeaubon ${v.code} geactiveerd.`);
        activated = true;
        break;
      }
      case "block": {
        if (["cancelled", "blocked"].includes(v.status)) throw new ActionError("Deze bon is al geblokkeerd of geannuleerd.");
        await c.query("UPDATE vouchers SET status='blocked', blocked_reason=$2, updated_at=now() WHERE id=$1", [v.id, a.reason || null]);
        await log("blocked", `Cadeaubon geblokkeerd${a.reason ? `: ${a.reason}` : ""}.`);
        break;
      }
      case "unblock": {
        if (v.status !== "blocked") throw new ActionError("Deze bon is niet geblokkeerd.");
        const back: VoucherStatus = !v.activated_at
          ? o.payment_status === "invoiced" ? "awaiting_payment" : "ordered"
          : v.remaining_cents <= 0 ? "used" : v.remaining_cents < v.original_cents ? "partially_used" : "active";
        await c.query("UPDATE vouchers SET status=$2, blocked_reason=NULL, updated_at=now() WHERE id=$1", [v.id, back]);
        await log("unblocked", `Blokkade opgeheven — status terug naar "${STATUS_LABELS[back]}".`);
        break;
      }
      case "cancel": {
        if (v.status === "cancelled") throw new ActionError("Deze bon is al geannuleerd.");
        const held = await c.query("SELECT 1 FROM redemptions WHERE voucher_id=$1 AND status='held'", [v.id]);
        if (held.rowCount) throw new ActionError("Er staat nog een reservering vanuit de boekingsapp open. Geef die eerst vrij.");
        await c.query("UPDATE vouchers SET status='cancelled', updated_at=now() WHERE id=$1", [v.id]);
        await c.query("UPDATE orders SET payment_status = CASE WHEN payment_status='paid' THEN 'paid' ELSE 'cancelled' END, updated_at=now() WHERE id=$1", [orderId]);
        await log("cancelled", `Cadeaubon geannuleerd${a.reason ? `: ${a.reason}` : ""}. De code is niet meer bruikbaar.`);
        break;
      }
      case "reopen": {
        if (v.status !== "cancelled") throw new ActionError("Alleen een geannuleerde bon kan heropend worden.");
        const back: VoucherStatus = !v.activated_at
          ? o.invoice_sent_at ? "awaiting_payment" : "ordered"
          : v.remaining_cents <= 0 ? "used" : v.remaining_cents < v.original_cents ? "partially_used" : "active";
        await c.query("UPDATE vouchers SET status=$2, updated_at=now() WHERE id=$1", [v.id, back]);
        await c.query(
          "UPDATE orders SET payment_status = CASE WHEN paid_at IS NOT NULL THEN 'paid' WHEN invoice_sent_at IS NOT NULL THEN 'invoiced' ELSE 'unpaid' END, updated_at=now() WHERE id=$1",
          [orderId],
        );
        await log("reopened", `Annulering ongedaan gemaakt — status "${STATUS_LABELS[back]}".`);
        break;
      }
      case "set_status": {
        // Noodknop: status direct zetten (zonder automatische e-mails)
        await c.query("UPDATE vouchers SET status=$2, updated_at=now() WHERE id=$1", [v.id, a.status]);
        await log("status", `Status handmatig gewijzigd naar "${STATUS_LABELS[a.status]}".`);
        break;
      }
      case "set_expiry": {
        const d = a.expiresAt || null;
        if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ActionError("Ongeldige datum");
        await c.query(
          `UPDATE vouchers SET expires_at = CASE WHEN $2::date IS NULL THEN NULL ELSE ($2::date + time '23:59') AT TIME ZONE 'Europe/Amsterdam' END,
             pdf_version=pdf_version+1, pdf_generated_at=now(), updated_at=now() WHERE id=$1`,
          [v.id, d],
        );
        await log("expiry", d ? `Geldig tot aangepast naar ${d.split("-").reverse().join("-")}.` : "Vervaldatum verwijderd (onbeperkt geldig).");
        break;
      }
      case "update_details": {
        await c.query(
          `UPDATE vouchers SET recipient_name=$2, recipient_email=$3, from_name=$4, personal_message=$5,
             pdf_version=pdf_version+1, pdf_generated_at=now(), updated_at=now() WHERE id=$1`,
          [v.id, a.recipientName?.trim() || null, a.recipientEmail?.trim() || null, a.fromName?.trim() || null, a.personalMessage?.trim().slice(0, 300) || null],
        );
        await c.query("UPDATE orders SET recipient_name=$2, recipient_email=$3, from_name=$4, personal_message=$5, updated_at=now() WHERE id=$1", [
          orderId, a.recipientName?.trim() || null, a.recipientEmail?.trim() || null, a.fromName?.trim() || null, a.personalMessage?.trim().slice(0, 300) || null,
        ]);
        await log("details", "Gegevens op de cadeaubon aangepast; PDF opnieuw gegenereerd.");
        break;
      }
      case "regenerate_pdf": {
        await c.query("UPDATE vouchers SET pdf_version=pdf_version+1, pdf_generated_at=now(), updated_at=now() WHERE id=$1", [v.id]);
        await log("pdf", `PDF opnieuw gegenereerd (versie ${v.pdf_version + 1}).`);
        break;
      }
      case "set_notes": {
        await c.query("UPDATE orders SET admin_notes=$2, updated_at=now() WHERE id=$1", [orderId, a.notes?.slice(0, 4000) || null]);
        break;
      }
      default:
        throw new ActionError("Onbekende actie");
    }
    return { activated };
  });
}

/**
 * Verwijdert een bestelling + cadeaubon definitief.
 * Alleen toegestaan als de bon nooit (definitief of gereserveerd) gebruikt is in de boekingsapp,
 * zodat de gebruiksgeschiedenis van echte boekingen nooit verloren gaat. Gebruik anders "Annuleren".
 */
export async function deleteOrder(orderId: string) {
  return tx(async (c) => {
    const o = (await c.query("SELECT id, order_number FROM orders WHERE id=$1 FOR UPDATE", [orderId])).rows[0];
    if (!o) throw new ActionError("Bestelling niet gevonden");
    const vs = (await c.query("SELECT id, code FROM vouchers WHERE order_id=$1 FOR UPDATE", [orderId])).rows;
    for (const v of vs) {
      const used = await c.query("SELECT 1 FROM redemptions WHERE voucher_id=$1 AND status IN ('held','captured') LIMIT 1", [v.id]);
      if (used.rowCount) {
        throw new ActionError(
          `Cadeaubon ${v.code} is (deels) gebruikt of gereserveerd voor een boeking en kan daarom niet verwijderd worden. Gebruik "Annuleren" om de code onbruikbaar te maken.`,
        );
      }
    }
    for (const v of vs) {
      await c.query("DELETE FROM redemptions WHERE voucher_id=$1", [v.id]);
      await c.query("DELETE FROM events WHERE voucher_id=$1", [v.id]);
      await c.query("DELETE FROM vouchers WHERE id=$1", [v.id]);
    }
    await c.query("DELETE FROM orders WHERE id=$1", [orderId]); // events en e-maillog gaan automatisch mee
    return { orderNumber: o.order_number as string };
  });
}
