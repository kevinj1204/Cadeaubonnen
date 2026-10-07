// POST /api/orders — Klant plaatst een bestelling via de bestelpagina.
import { after } from "next/server";
import { queryOne } from "@/lib/db";
import { sendTemplate } from "@/lib/email";
import { createOrder } from "@/lib/orders";
import { clientIp, hashIp } from "@/lib/security";
import { getSettings } from "@/lib/settings";
import { parseOrderInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, message: "Ongeldig verzoek." }, { status: 400 });
  }

  // Spam-val: dit veld is onzichtbaar voor mensen
  if (body?.website) return Response.json({ ok: true, orderNumber: "CB-0000-0000" });

  const ipHash = hashIp(await clientIp());
  const recent = await queryOne<{ n: string }>(
    "SELECT count(*) AS n FROM orders WHERE ip_hash = $1 AND created_at > now() - interval '1 hour'",
    [ipHash],
  );
  if (Number(recent?.n ?? 0) >= Number(process.env.ORDER_RATE_LIMIT || 10)) {
    return Response.json(
      { ok: false, message: "Er zijn vanaf dit adres al meerdere bestellingen geplaatst. Probeer het later opnieuw of neem contact op." },
      { status: 429 },
    );
  }

  const settings = await getSettings();
  const parsed = parseOrderInput(body, {
    min: settings.minAmount,
    max: settings.maxAmount,
    amounts: settings.amounts,
    allowCustom: settings.allowCustomAmount,
  });
  if (!parsed.ok) {
    return Response.json({ ok: false, message: "Controleer de gemarkeerde velden.", errors: parsed.errors }, { status: 422 });
  }
  if (body?.acceptTerms !== true) {
    return Response.json({ ok: false, message: "Ga akkoord met de voorwaarden om te bestellen.", errors: { acceptTerms: "Verplicht" } }, { status: 422 });
  }

  const { order, voucher } = await createOrder(parsed.value, { source: "web", ipHash, settings });

  // E-mails na het antwoord versturen, zodat de klant niet hoeft te wachten
  after(async () => {
    await sendTemplate("orderReceived", order, voucher, settings).catch((e) => console.error(e));
    await sendTemplate("adminNewOrder", order, voucher, settings).catch((e) => console.error(e));
  });

  return Response.json({ ok: true, orderNumber: order.order_number });
}
