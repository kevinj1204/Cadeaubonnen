// POST: e-mail (opnieuw) versturen
import { sendTemplate } from "@/lib/email";
import { getOrderDetail } from "@/lib/orders";
import { logEvent } from "@/lib/db";
import { requireAdmin } from "@/lib/security";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;
  const { template } = await req.json().catch(() => ({}));
  if (!["orderReceived", "activated"].includes(template)) return Response.json({ error: "Onbekende e-mail" }, { status: 400 });
  const d = await getOrderDetail(id);
  if (!d) return Response.json({ error: "Niet gevonden" }, { status: 404 });
  if (template === "activated" && !["active", "partially_used", "used"].includes(d.voucher?.status)) {
    return Response.json({ error: "De bon is nog niet actief. Markeer eerst de betaling als ontvangen." }, { status: 400 });
  }
  const res = await sendTemplate(template, d.order, d.voucher, await getSettings(true), { force: true });
  await logEvent(null, { orderId: id, voucherId: d.voucher?.id, type: "email", actor: "admin", message: `E-mail "${template === "activated" ? "cadeaubon geactiveerd" : "bestelling ontvangen"}" handmatig verstuurd (${res.status}).` });
  if (res.status === "failed") return Response.json({ error: `Versturen mislukt: ${(res as any).error}` }, { status: 502 });
  if (res.status === "skipped") return Response.json({ error: "E-mail is niet ingesteld (SMTP). Zie README." }, { status: 400 });
  return Response.json({ ok: true });
}
