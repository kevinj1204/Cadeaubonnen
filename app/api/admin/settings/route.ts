import { PLACEHOLDERS, emailConfigured } from "@/lib/email";
import { requireAdmin } from "@/lib/security";
import { DEFAULT_SETTINGS, getSettings, saveSettings, validateSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  return Response.json({
    settings: await getSettings(true),
    defaults: DEFAULT_SETTINGS,
    placeholders: PLACEHOLDERS,
    status: {
      email: emailConfigured(),
      mailFrom: process.env.MAIL_FROM || null,
      bookingApi: (process.env.BOOKING_API_KEY || "").length >= 32,
      appUrl: process.env.APP_URL || null,
    },
  });
}

export async function PUT(req: Request) {
  const deny = await requireAdmin(req);
  if (deny) return deny;
  const body = await req.json().catch(() => null);
  const v = validateSettings(body);
  if (!v.ok) return Response.json({ error: v.error }, { status: 400 });
  await saveSettings(v.value);
  return Response.json({ ok: true, settings: v.value });
}
