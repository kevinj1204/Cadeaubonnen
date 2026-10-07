// POST /api/v1/vouchers/redeem — Reserveren + direct definitief afboeken in één stap.
// Handig als de boeking meteen definitief is (geen goedkeuringsstap).
import { handleVoucherError, readApiRequest } from "@/lib/booking-api";
import { holdVoucher, publicVoucherInfo, redemptionJson } from "@/lib/vouchers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const r = await readApiRequest(req, { bookingRef: true, total: true });
  if ("res" in r) return r.res;
  try {
    const res = await holdVoucher({
      code: r.body.code,
      bookingRef: r.body.booking_ref!,
      bookingTotalCents: r.body.booking_total_cents!,
      maxAmountCents: r.body.max_amount_cents,
      description: r.body.description,
      capture: true,
    });
    const total = res.redemption.booking_total_cents ?? r.body.booking_total_cents!;
    return Response.json({
      ok: true,
      idempotent: res.idempotent,
      redemption: redemptionJson(res.redemption),
      applied_cents: res.redemption.amount_cents,
      to_pay_cents: Math.max(0, total - res.redemption.amount_cents),
      voucher: publicVoucherInfo(res.voucher),
    });
  } catch (e) {
    return handleVoucherError(e, r.body.code, r.keyId);
  }
}
