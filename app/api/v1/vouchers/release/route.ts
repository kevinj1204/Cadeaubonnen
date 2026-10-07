// POST /api/v1/vouchers/release — Geef een reservering vrij (boeking afgewezen/geannuleerd).
// Het bedrag komt terug op de cadeaubon. Een al definitieve afboeking terugdraaien kan alleen met force: true.
import { handleVoucherError, readApiRequest } from "@/lib/booking-api";
import { publicVoucherInfo, redemptionJson, releaseVoucher } from "@/lib/vouchers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const r = await readApiRequest(req, { bookingRef: true });
  if ("res" in r) return r.res;
  try {
    const res = await releaseVoucher({
      code: r.body.code,
      bookingRef: r.body.booking_ref!,
      reason: r.body.reason,
      allowCaptured: r.body.force === true,
    });
    return Response.json({ ok: true, idempotent: res.idempotent, redemption: redemptionJson(res.redemption), voucher: publicVoucherInfo(res.voucher) });
  } catch (e) {
    return handleVoucherError(e, r.body.code, r.keyId);
  }
}
