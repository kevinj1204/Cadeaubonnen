// POST: handmatig tegoed afboeken / reservering bevestigen / vrijgeven vanuit de backoffice
import { getOrderDetail } from "@/lib/orders";
import { requireAdmin } from "@/lib/security";
import { captureVoucher, holdVoucher, releaseVoucher, VoucherError } from "@/lib/vouchers";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const d = await getOrderDetail(id);
  if (!d?.voucher) return Response.json({ error: "Niet gevonden" }, { status: 404 });
  const code = d.voucher.code;
  try {
    if (body.op === "redeem") {
      const amount = Math.round(Number(String(body.amount).replace(",", ".")) * 100);
      if (!Number.isFinite(amount) || amount <= 0) return Response.json({ error: "Vul een geldig bedrag in." }, { status: 400 });
      const ref = String(body.bookingRef || "").trim() || `HANDMATIG-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`;
      await holdVoucher({ code, bookingRef: ref.slice(0, 120), bookingTotalCents: amount, description: String(body.description || "").slice(0, 200) || "Handmatig afgeboekt", actor: "admin", capture: true });
    } else if (body.op === "capture") {
      await captureVoucher({ code, bookingRef: String(body.bookingRef), actor: "admin" });
    } else if (body.op === "release") {
      await releaseVoucher({ code, bookingRef: String(body.bookingRef), reason: String(body.reason || "Teruggezet in backoffice"), actor: "admin", allowCaptured: true });
    } else {
      return Response.json({ error: "Onbekende actie" }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof VoucherError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
