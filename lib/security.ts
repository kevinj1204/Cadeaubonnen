import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { query, queryOne } from "./db";

export const SESSION_COOKIE = "tlp_admin";
const SESSION_HOURS = 12;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET ontbreekt of is te kort (minimaal 32 tekens).");
  return s;
}

export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${ip}|${process.env.SESSION_SECRET ?? ""}`).digest("hex").slice(0, 32);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
}

// ---------------------------------------------------------------
// Backoffice-sessie
// ---------------------------------------------------------------
export function createSessionToken(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_HOURS * 3600_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  if (!safeEqual(sig, sign(payload))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_HOURS * 3600,
};

/**
 * Controle voor alle /api/admin-routes: geldige sessie + verzoek komt van
 * deze site zelf (bescherming tegen cross-site requests).
 */
export async function requireAdmin(req: Request): Promise<Response | null> {
  if (!(await isAdmin())) return Response.json({ error: "Niet ingelogd" }, { status: 401 });
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
    if (origin && host && new URL(origin).host !== host) {
      return Response.json({ error: "Ongeldige herkomst" }, { status: 403 });
    }
  }
  return null;
}

// Max 5 foute inlogpogingen per 15 minuten per IP
export async function loginBlocked(ipHash: string): Promise<boolean> {
  const row = await queryOne<{ n: string }>(
    "SELECT count(*) AS n FROM login_attempts WHERE ip_hash = $1 AND success = false AND created_at > now() - interval '15 minutes'",
    [ipHash],
  );
  return Number(row?.n ?? 0) >= 5;
}

export async function recordLogin(ipHash: string, success: boolean) {
  await query("INSERT INTO login_attempts (ip_hash, success) VALUES ($1,$2)", [ipHash, success]);
  await query("DELETE FROM login_attempts WHERE created_at < now() - interval '7 days'");
}

// ---------------------------------------------------------------
// API-sleutel voor de boekingsapp
// ---------------------------------------------------------------
export function bookingApiAuth(req: Request): { ok: true; keyId: string } | { ok: false; response: Response } {
  const configured = (process.env.BOOKING_API_KEY || "").trim();
  if (configured.length < 32) {
    return {
      ok: false,
      response: Response.json({ ok: false, error: "api_not_configured", message: "BOOKING_API_KEY is niet ingesteld." }, { status: 503 }),
    };
  }
  const header = req.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : req.headers.get("x-api-key")?.trim() || "";
  if (!given || !safeEqual(given, configured)) {
    return { ok: false, response: Response.json({ ok: false, error: "unauthorized", message: "Ongeldige API-sleutel." }, { status: 401 }) };
  }
  return { ok: true, keyId: createHash("sha256").update(configured).digest("hex").slice(0, 12) };
}

// Bescherming tegen raden: na 30 onbekende codes binnen 10 minuten tijdelijk blokkeren
export async function apiTooManyFailures(keyId: string): Promise<boolean> {
  const row = await queryOne<{ n: string }>(
    "SELECT count(*) AS n FROM api_failures WHERE key_id = $1 AND created_at > now() - interval '10 minutes'",
    [keyId],
  );
  return Number(row?.n ?? 0) >= 30;
}
export async function recordApiFailure(keyId: string) {
  await query("INSERT INTO api_failures (key_id) VALUES ($1)", [keyId]);
  await query("DELETE FROM api_failures WHERE created_at < now() - interval '1 day'");
}

// ---------------------------------------------------------------
// Ondertekende downloadlink voor de PDF (in de activatie-e-mail)
// ---------------------------------------------------------------
export function pdfToken(voucherId: string, pdfVersion: number): string {
  return sign(`pdf:${voucherId}:${pdfVersion}`).slice(0, 32);
}
