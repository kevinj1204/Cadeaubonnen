// GET /api/v1/health — Controle of de koppeling werkt (met API-sleutel).
import { bookingApiAuth } from "@/lib/security";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = bookingApiAuth(req);
  if (!auth.ok) return auth.response;
  await query("SELECT 1");
  return Response.json({ ok: true, service: "tlp-cadeaubonnen", version: 1, time: new Date().toISOString() });
}
