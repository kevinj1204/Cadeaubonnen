// Gedeelde afhandeling voor de API die de boekingsapp aanroept.
import { normalizeCode } from "./codes";
import { apiTooManyFailures, bookingApiAuth, recordApiFailure } from "./security";
import { findVoucherByCode, publicVoucherInfo, VoucherError } from "./vouchers";

export type ApiBody = {
  code: string;
  booking_ref?: string;
  booking_total_cents?: number;
  max_amount_cents?: number;
  description?: string;
  reason?: string;
  force?: boolean;
};

function cents(body: any, key: string): number | undefined {
  if (body?.[`${key}_cents`] !== undefined && body?.[`${key}_cents`] !== null && body?.[`${key}_cents`] !== "") {
    const n = Number(body[`${key}_cents`]);
    return Number.isFinite(n) ? Math.round(n) : NaN;
  }
  if (body?.[key] !== undefined && body?.[key] !== null && body?.[key] !== "") {
    const n = Number(String(body[key]).replace(",", "."));
    return Number.isFinite(n) ? Math.round(n * 100) : NaN;
  }
  return undefined;
}

export function err(status: number, error: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ ok: false, error, message, ...extra }, { status });
}

/**
 * Leest en controleert het verzoek. Geeft óf een Response (fout) óf de gegevens terug.
 */
export async function readApiRequest(
  req: Request,
  needs: { bookingRef?: boolean; total?: boolean },
): Promise<{ res: Response } | { body: ApiBody; keyId: string }> {
  const auth = bookingApiAuth(req);
  if (!auth.ok) return { res: auth.response };
  if (await apiTooManyFailures(auth.keyId)) {
    return { res: err(429, "too_many_attempts", "Te veel onbekende codes geprobeerd. Probeer het over 10 minuten opnieuw.") };
  }
  let raw: any;
  try {
    raw = await req.json();
  } catch {
    return { res: err(400, "invalid_json", "Ongeldige JSON in het verzoek.") };
  }
  const code = normalizeCode(raw?.code);
  if (!code) return { res: err(400, "invalid_code_format", "Vul een geldige code in, bijv. TLP-ABCD-EFGH.") };

  const body: ApiBody = { code };
  const total = cents(raw, "booking_total");
  if (Number.isNaN(total)) return { res: err(400, "invalid_amount", "booking_total_cents is geen geldig bedrag.") };
  if (total !== undefined) {
    if (total <= 0 || total > 10_000_00) return { res: err(400, "invalid_amount", "Het boekingsbedrag moet groter dan 0 zijn.") };
    body.booking_total_cents = total;
  } else if (needs.total) {
    return { res: err(400, "missing_amount", "booking_total_cents (of booking_total in euro) is verplicht.") };
  }
  const max = cents(raw, "max_amount");
  if (max !== undefined) {
    if (Number.isNaN(max) || max <= 0) return { res: err(400, "invalid_amount", "max_amount_cents is ongeldig.") };
    body.max_amount_cents = max;
  }
  if (raw?.booking_ref !== undefined) body.booking_ref = String(raw.booking_ref).trim().slice(0, 120);
  if (needs.bookingRef && !body.booking_ref) return { res: err(400, "missing_booking_ref", "booking_ref (uniek boekingskenmerk) is verplicht.") };
  if (raw?.description) body.description = String(raw.description).trim().slice(0, 200);
  if (raw?.reason) body.reason = String(raw.reason).trim().slice(0, 200);
  if (raw?.force === true) body.force = true;
  return { body, keyId: auth.keyId };
}

export async function handleVoucherError(e: unknown, code: string, keyId: string) {
  if (e instanceof VoucherError) {
    if (e.code === "not_found") await recordApiFailure(keyId);
    const v = e.code === "not_found" ? null : await findVoucherByCode(code);
    return err(e.status, e.code, e.message, v ? { voucher: publicVoucherInfo(v) } : {});
  }
  console.error(e);
  return err(500, "server_error", "Er ging iets mis aan de kant van het cadeaubonnensysteem.");
}
