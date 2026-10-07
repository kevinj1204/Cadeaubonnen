import { after } from "next/server";
import { sendTemplate } from "@/lib/email";
import { createOrder, searchOrders } from "@/lib/orders";
import { requireAdmin } from "@/lib/security";
import { getSettings } from "@/lib/settings";
import { parseOrderInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

// GET: overzicht met zoeken en filters
export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const p = new URL(req.url).searchParams;
  const data = await searchOrders({
    q: p.get("q") || undefined,
    status: p.get("status") || undefined,
    limit: Number(p.get("limit") || 50),
    offset: Number(p.get("offset") || 0),
  });
  return Response.json(data);
}

// POST: handmatig een cadeaubon aanmaken
export async function POST(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const body = await req.json().catch(() => ({}));
  const settings = await getSettings(true);
  const parsed = parseOrderInput(body, { min: settings.minAmount, max: settings.maxAmount, amounts: settings.amounts, allowCustom: true }, { relaxed: true });
  if (!parsed.ok) return Response.json({ error: "Controleer de velden.", errors: parsed.errors }, { status: 422 });
  const { order, voucher } = await createOrder(parsed.value, { source: "admin", activate: body.activate === true, settings });
  if (body.sendEmail === true) {
    after(async () => {
      await sendTemplate(body.activate ? "activated" : "orderReceived", order, voucher, settings, { force: true }).catch(console.error);
    });
  }
  return Response.json({ ok: true, id: order.id, orderNumber: order.order_number, code: voucher.code });
}
