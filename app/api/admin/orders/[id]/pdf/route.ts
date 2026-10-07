import { getOrderDetail } from "@/lib/orders";
import { pdfFilename, renderVoucherPdf } from "@/lib/pdf";
import { requireAdmin } from "@/lib/security";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const { id } = await ctx.params;
  const d = await getOrderDetail(id);
  if (!d?.voucher) return new Response("Niet gevonden", { status: 404 });
  const v = d.voucher;
  const pdf = await renderVoucherPdf(
    { code: v.code, valueCents: v.original_cents, recipientName: v.recipient_name, fromName: v.from_name, message: v.personal_message, expiresAt: v.expires_at, orderNumber: d.order.order_number, status: v.status },
    await getSettings(true),
    v.design_key,
  );
  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${pdfFilename(v.code)}"`,
    },
  });
}
