// POST: voorbeeld-PDF met (nog niet opgeslagen) ontwerpinstellingen
import { renderVoucherPdf } from "@/lib/pdf";
import { requireAdmin } from "@/lib/security";
import { validateSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const body = await req.json().catch(() => null);
  const v = validateSettings(body);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
  const until = new Date();
  until.setMonth(until.getMonth() + (v.value.validityMonths || 12));
  const pdf = await renderVoucherPdf(
    {
      code: "TLP-A3C6-K9QX",
      valueCents: 15000,
      recipientName: "Sophie",
      fromName: "Mark & Lotte",
      message: "Voor de mooiste herinneringen van dit jaar. Geniet ervan!",
      expiresAt: v.value.validityMonths ? until : null,
      status: "active",
    },
    v.value,
  );
  return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="voorbeeld-cadeaubon.pdf"' } });
}
