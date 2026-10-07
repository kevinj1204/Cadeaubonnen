// =====================================================================
// Kern van het cadeaubonsysteem: controleren, reserveren, afboeken.
// Alle wijzigingen aan het saldo gebeuren in een transactie met een
// rij-lock (SELECT … FOR UPDATE). Twee gelijktijdige boekingen worden
// daardoor na elkaar verwerkt en kunnen nooit samen meer gebruiken dan
// er op de bon staat.
// =====================================================================
import type { PoolClient } from "pg";
import { logEvent, queryOne, tx } from "./db";
import { euro, STATUS_LABELS, type VoucherStatus } from "./format";

export type VoucherRow = {
  id: string;
  code: string;
  order_id: string | null;
  original_cents: number;
  remaining_cents: number;
  status: VoucherStatus;
  expires_at: string | null;
  activated_at: string | null;
  recipient_name: string | null;
  from_name: string | null;
  personal_message: string | null;
  pdf_version: number;
  design_key: string;
};

export type UsabilityReason = "not_found" | "not_paid" | "blocked" | "cancelled" | "used" | "expired";

const REASON_MESSAGES: Record<UsabilityReason, string> = {
  not_found: "Deze code is niet bekend. Controleer de code nog eens.",
  not_paid: "Deze cadeaubon is nog niet geactiveerd. De bon kan gebruikt worden zodra de betaling is verwerkt.",
  blocked: "Deze cadeaubon is geblokkeerd. Neem contact op met The Light Portraits.",
  cancelled: "Deze cadeaubon is geannuleerd en kan niet meer gebruikt worden.",
  used: "Het volledige tegoed van deze cadeaubon is al gebruikt.",
  expired: "Deze cadeaubon is verlopen.",
};

export class VoucherError extends Error {
  constructor(public code: string, message: string, public status = 400, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export function usability(v: VoucherRow | null): { usable: true } | { usable: false; reason: UsabilityReason; message: string } {
  if (!v) return { usable: false, reason: "not_found", message: REASON_MESSAGES.not_found };
  const r = (reason: UsabilityReason) => ({ usable: false as const, reason, message: REASON_MESSAGES[reason] });
  if (v.status === "ordered" || v.status === "awaiting_payment") return r("not_paid");
  if (v.status === "blocked") return r("blocked");
  if (v.status === "cancelled") return r("cancelled");
  if (v.status === "used" || v.remaining_cents <= 0) return r("used");
  if (v.expires_at && new Date(v.expires_at).getTime() < Date.now()) return r("expired");
  return { usable: true };
}

/** Status na een saldowijziging (alleen voor bonnen die in gebruik zijn). */
export function statusForBalance(v: { status: VoucherStatus; original_cents: number }, remaining: number): VoucherStatus {
  if (!["active", "partially_used", "used"].includes(v.status)) return v.status;
  if (remaining <= 0) return "used";
  if (remaining < v.original_cents) return "partially_used";
  return "active";
}

/** Alleen de informatie die de boekingsapp nodig heeft. */
export function publicVoucherInfo(v: VoucherRow, bookingTotalCents?: number) {
  const u = usability(v);
  const applicable = u.usable && bookingTotalCents ? Math.min(v.remaining_cents, bookingTotalCents) : u.usable ? v.remaining_cents : 0;
  return {
    code: v.code,
    valid: u.usable,
    reason: u.usable ? null : u.reason,
    message: u.usable
      ? `Cadeaubon geldig. Beschikbaar tegoed: ${euro(v.remaining_cents)}.`
      : u.message,
    status: v.status,
    status_label: STATUS_LABELS[v.status],
    original_cents: v.original_cents,
    remaining_cents: v.remaining_cents,
    expires_at: v.expires_at,
    ...(bookingTotalCents
      ? {
          booking_total_cents: bookingTotalCents,
          applied_cents: applicable,
          to_pay_cents: Math.max(0, bookingTotalCents - applicable),
          remaining_after_cents: v.remaining_cents - applicable,
        }
      : {}),
  };
}

export async function findVoucherByCode(code: string): Promise<VoucherRow | null> {
  return queryOne<VoucherRow>("SELECT * FROM vouchers WHERE code = $1", [code]);
}

async function lockVoucher(c: PoolClient, code: string): Promise<VoucherRow | null> {
  const r = await c.query<VoucherRow>("SELECT * FROM vouchers WHERE code = $1 FOR UPDATE", [code]);
  return r.rows[0] ?? null;
}

type Actor = "booking-api" | "admin";

/**
 * Reserveert tegoed voor een boeking (bij een boekingsaanvraag).
 * Het bedrag wordt direct van het saldo afgehaald zodat het niet dubbel
 * gebruikt kan worden. Herhaald verzoek met hetzelfde booking_ref → zelfde antwoord.
 */
export async function holdVoucher(input: {
  code: string;
  bookingRef: string;
  bookingTotalCents: number;
  maxAmountCents?: number;
  description?: string;
  actor?: Actor;
  capture?: boolean; // direct definitief afboeken
}) {
  const actor = input.actor ?? "booking-api";
  return tx(async (c) => {
    const v = await lockVoucher(c, input.code);
    if (!v) throw new VoucherError("not_found", REASON_MESSAGES.not_found, 404);

    // Idempotent: bestaat er al een actieve reservering voor deze boeking?
    const existing = await c.query(
      "SELECT * FROM redemptions WHERE voucher_id = $1 AND booking_ref = $2 AND status <> 'released'",
      [v.id, input.bookingRef],
    );
    if (existing.rows[0]) {
      const r = existing.rows[0];
      if (input.capture && r.status === "held") {
        // Alsnog definitief maken
        await c.query("UPDATE redemptions SET status='captured', captured_at=now() WHERE id=$1", [r.id]);
        r.status = "captured";
      }
      return { redemption: r, voucher: v, idempotent: true };
    }

    const u = usability(v);
    if (!u.usable) throw new VoucherError(u.reason, u.message, 409);

    const cap = Math.min(input.bookingTotalCents, input.maxAmountCents ?? Number.MAX_SAFE_INTEGER);
    const amount = Math.min(v.remaining_cents, cap);
    if (amount <= 0) throw new VoucherError("nothing_to_apply", "Er is geen bedrag om te verrekenen.", 400);

    const newRemaining = v.remaining_cents - amount;
    const newStatus = statusForBalance(v, newRemaining);
    await c.query("UPDATE vouchers SET remaining_cents=$1, status=$2, updated_at=now() WHERE id=$3", [newRemaining, newStatus, v.id]);
    const ins = await c.query(
      `INSERT INTO redemptions (voucher_id, booking_ref, description, booking_total_cents, amount_cents, status, source, balance_after_cents, captured_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $6 = 'captured' THEN now() END) RETURNING *`,
      [v.id, input.bookingRef, input.description || null, input.bookingTotalCents, amount, input.capture ? "captured" : "held", actor, newRemaining],
    );
    await logEvent(c, {
      orderId: v.order_id,
      voucherId: v.id,
      type: input.capture ? "redeemed" : "held",
      actor,
      message: `${euro(amount)} ${input.capture ? "gebruikt" : "gereserveerd"} voor boeking ${input.bookingRef}${input.description ? ` (${input.description})` : ""}. Restwaarde ${euro(newRemaining)}.`,
      data: { bookingRef: input.bookingRef, amount, newRemaining },
    });
    return { redemption: ins.rows[0], voucher: { ...v, remaining_cents: newRemaining, status: newStatus }, idempotent: false };
  });
}

/** Maakt een reservering definitief (boeking goedgekeurd / betaald). */
export async function captureVoucher(input: { code: string; bookingRef: string; actor?: Actor }) {
  const actor = input.actor ?? "booking-api";
  return tx(async (c) => {
    const v = await lockVoucher(c, input.code);
    if (!v) throw new VoucherError("not_found", REASON_MESSAGES.not_found, 404);
    const r = (
      await c.query("SELECT * FROM redemptions WHERE voucher_id=$1 AND booking_ref=$2 AND status <> 'released' FOR UPDATE", [v.id, input.bookingRef])
    ).rows[0];
    if (!r) throw new VoucherError("no_hold", "Er is geen reservering gevonden voor deze boeking.", 404);
    if (r.status === "captured") return { redemption: r, voucher: v, idempotent: true };
    const upd = await c.query("UPDATE redemptions SET status='captured', captured_at=now() WHERE id=$1 RETURNING *", [r.id]);
    await logEvent(c, {
      orderId: v.order_id,
      voucherId: v.id,
      type: "captured",
      actor,
      message: `Reservering van ${euro(r.amount_cents)} voor boeking ${input.bookingRef} definitief afgeboekt.`,
    });
    return { redemption: upd.rows[0], voucher: v, idempotent: false };
  });
}

/** Geeft een reservering of afboeking vrij: het bedrag komt terug op de bon. */
export async function releaseVoucher(input: { code: string; bookingRef: string; reason?: string; actor?: Actor; allowCaptured?: boolean }) {
  const actor = input.actor ?? "booking-api";
  return tx(async (c) => {
    const v = await lockVoucher(c, input.code);
    if (!v) throw new VoucherError("not_found", REASON_MESSAGES.not_found, 404);
    const r = (
      await c.query("SELECT * FROM redemptions WHERE voucher_id=$1 AND booking_ref=$2 AND status <> 'released' FOR UPDATE", [v.id, input.bookingRef])
    ).rows[0];
    if (!r) {
      const released = (
        await c.query("SELECT * FROM redemptions WHERE voucher_id=$1 AND booking_ref=$2 AND status='released' ORDER BY released_at DESC LIMIT 1", [v.id, input.bookingRef])
      ).rows[0];
      if (released) return { redemption: released, voucher: v, idempotent: true };
      throw new VoucherError("no_hold", "Er is geen reservering gevonden voor deze boeking.", 404);
    }
    if (r.status === "captured" && !input.allowCaptured) {
      throw new VoucherError(
        "already_captured",
        "Deze afboeking is al definitief. Terugboeken kan alleen vanuit de backoffice of met force=true.",
        409,
      );
    }
    const newRemaining = Math.min(v.original_cents, v.remaining_cents + r.amount_cents);
    const newStatus = statusForBalance(v, newRemaining);
    await c.query("UPDATE vouchers SET remaining_cents=$1, status=$2, updated_at=now() WHERE id=$3", [newRemaining, newStatus, v.id]);
    const upd = await c.query(
      "UPDATE redemptions SET status='released', released_at=now(), release_reason=$2 WHERE id=$1 RETURNING *",
      [r.id, input.reason || null],
    );
    await logEvent(c, {
      orderId: v.order_id,
      voucherId: v.id,
      type: "released",
      actor,
      message: `${euro(r.amount_cents)} van boeking ${input.bookingRef} teruggezet op de bon${input.reason ? ` (${input.reason})` : ""}. Restwaarde ${euro(newRemaining)}.`,
    });
    return { redemption: upd.rows[0], voucher: { ...v, remaining_cents: newRemaining, status: newStatus }, idempotent: false };
  });
}

export function redemptionJson(r: any) {
  return {
    id: r.id,
    booking_ref: r.booking_ref,
    status: r.status,
    amount_cents: r.amount_cents,
    balance_after_cents: r.balance_after_cents,
    created_at: r.created_at,
    captured_at: r.captured_at,
    released_at: r.released_at,
  };
}
