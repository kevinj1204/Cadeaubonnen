// POST /api/v1/vouchers/check — Controleer een code (wijzigt niets).
import { err, readApiRequest } from "@/lib/booking-api";
import { recordApiFailure } from "@/lib/security";
import { findVoucherByCode, publicVoucherInfo } from "@/lib/vouchers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const r = await readApiRequest(req, {});
  if ("res" in r) return r.res;
  const v = await findVoucherByCode(r.body.code);
  if (!v) {
    await recordApiFailure(r.keyId);
    return err(404, "not_found", "Deze code is niet bekend. Controleer de code nog eens.", { valid: false });
  }
  return Response.json({ ok: true, voucher: publicVoucherInfo(v, r.body.booking_total_cents) });
}
