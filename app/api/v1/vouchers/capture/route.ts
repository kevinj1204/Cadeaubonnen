// POST /api/v1/vouchers/capture — Maak een reservering definitief (boeking goedgekeurd).
import { handleVoucherError, readApiRequest } from "@/lib/booking-api";
import { captureVoucher, publicVoucherInfo, redemptionJson } from "@/lib/vouchers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const r = await readApiRequest(req, { bookingRef: true });
  if ("res" in r) return r.res;
  try {
    const res = await captureVoucher({ code: r.body.code, bookingRef: r.body.booking_ref! });
    return Response.json({ ok: true, idempotent: res.idempotent, redemption: redemptionJson(res.redemption), voucher: publicVoucherInfo(res.voucher) });
  } catch (e) {
    return handleVoucherError(e, r.body.code, r.keyId);
  }
}
