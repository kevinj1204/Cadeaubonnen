// GET /api/voucher-pdf/:id?t=… — Downloadlink voor de klant (uit de activatie-e-mail).
// Werkt alleen met de juiste ondertekende sleutel én alleen voor geactiveerde bonnen.
import { queryOne } from "@/lib/db";
import { pdfFilename, renderVoucherPdf } from "@/lib/pdf";
import { pdfToken, safeEqual } from "@/lib/security";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const t = new URL(req.url).searchParams.get("t") || "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Niet gevonden", { status: 404 });
  const v = await queryOne("SELECT * FROM vouchers WHERE id = $1", [id]);
  if (!v || !safeEqual(t, pdfToken(v.id, v.pdf_version))) {
    return new Response("Deze link is niet (meer) geldig. Neem contact op met The Light Portraits.", { status: 404 });
  }
  if (!["active", "partially_used", "used"].includes(v.status)) {
    return new Response("Deze cadeaubon is (nog) niet actief.", { status: 403 });
  }
  const settings = await getSettings();
  const pdf = await renderVoucherPdf(
    { code: v.code, valueCents: v.original_cents, recipientName: v.recipient_name, fromName: v.from_name, message: v.personal_message, expiresAt: v.expires_at, status: v.status },
    settings,
    v.design_key,
  );
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${pdfFilename(v.code)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
