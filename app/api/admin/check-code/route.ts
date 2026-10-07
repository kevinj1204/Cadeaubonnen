// Testhulp in de backoffice: controleer een code zoals de boekingsapp dat doet (wijzigt niets).
import { normalizeCode } from "@/lib/codes";
import { requireAdmin } from "@/lib/security";
import { findVoucherByCode, publicVoucherInfo } from "@/lib/vouchers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const body = await req.json().catch(() => ({}));
  const code = normalizeCode(body.code);
  if (!code) return Response.json({ error: "Ongeldig codeformaat" }, { status: 400 });
  const v = await findVoucherByCode(code);
  if (!v) return Response.json({ voucher: null, message: "Deze code is niet bekend." });
  const total = Math.round(Number(String(body.amount || "").replace(",", ".")) * 100);
  return Response.json({ voucher: publicVoucherInfo(v, total > 0 ? total : undefined), orderId: v.order_id });
}
