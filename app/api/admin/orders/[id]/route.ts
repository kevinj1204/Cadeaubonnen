import { emailConfigured, sendTemplate } from "@/lib/email";
import { ActionError, applyAdminAction, deleteOrder, getOrderDetail, type AdminAction } from "@/lib/orders";
import { pdfToken, requireAdmin } from "@/lib/security";
import { getSettings } from "@/lib/settings";
import { VOUCHER_STATUSES } from "@/lib/format";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function detail(id: string) {
  const d = await getOrderDetail(id);
  if (!d) return null;
  return {
    ...d,
    emailConfigured: emailConfigured(),
    customerPdfLink:
      d.voucher && ["active", "partially_used", "used"].includes(d.voucher.status)
        ? `/api/voucher-pdf/${d.voucher.id}?t=${pdfToken(d.voucher.id, d.voucher.pdf_version)}`
        : null,
  };
}

export async function GET(req: Request, ctx: Ctx) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Niet gevonden" }, { status: 404 });
  const d = await detail(id);
  if (!d) return Response.json({ error: "Niet gevonden" }, { status: 404 });
  return Response.json(d);
}

// POST: statusactie uitvoeren
export async function POST(req: Request, ctx: Ctx) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as AdminAction;
  if (body.action === "set_status" && !VOUCHER_STATUSES.includes((body as any).status)) {
    return Response.json({ error: "Ongeldige status" }, { status: 400 });
  }
  const settings = await getSettings(true);
  try {
    const { activated } = await applyAdminAction(id, body, settings);
    let email: string | undefined;
    if (activated && (body as any).sendEmail !== false) {
      const d = await getOrderDetail(id);
      const res = await sendTemplate("activated", d!.order, d!.voucher, settings);
      email = res.status;
    }
    return Response.json({ ok: true, email, ...(await detail(id)) });
  } catch (e) {
    if (e instanceof ActionError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

// DELETE: bestelling + cadeaubon definitief verwijderen (alleen als de bon nooit gebruikt is)
export async function DELETE(req: Request, ctx: Ctx) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "Niet gevonden" }, { status: 404 });
  try {
    const r = await deleteOrder(id);
    return Response.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ActionError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
