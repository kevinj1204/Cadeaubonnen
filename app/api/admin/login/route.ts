import { cookies } from "next/headers";
import { clientIp, createSessionToken, hashIp, loginBlocked, recordLogin, safeEqual, SESSION_COOKIE, sessionCookieOptions } from "@/lib/security";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const configured = process.env.ADMIN_PASSWORD || "";
  if (configured.length < 10) {
    return Response.json({ error: "ADMIN_PASSWORD is niet ingesteld (minimaal 10 tekens)." }, { status: 503 });
  }
  const ipHash = hashIp(await clientIp());
  if (await loginBlocked(ipHash)) {
    return Response.json({ error: "Te veel mislukte pogingen. Probeer het over 15 minuten opnieuw." }, { status: 429 });
  }
  const { password } = await req.json().catch(() => ({ password: "" }));
  const ok = typeof password === "string" && safeEqual(password, configured);
  await recordLogin(ipHash, ok);
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600));
    return Response.json({ error: "Onjuist wachtwoord." }, { status: 401 });
  }
  (await cookies()).set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions);
  return Response.json({ ok: true });
}
