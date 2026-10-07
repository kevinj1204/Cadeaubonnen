import { randomInt } from "node:crypto";

// Geen verwarrende tekens: geen 0/O, 1/I/L, 5/S, 8/B, 2/Z.
// 24 tekens × 8 posities ≈ 1,1 × 10^11 combinaties — onmogelijk te raden,
// zeker omdat de API alleen met geheime sleutel en met een limiet op foute pogingen werkt.
const ALPHABET = "ACDEFGHJKMNPQRTUVWXY3469";

export const CODE_PREFIX = "TLP";

export function generateCode(prefix = CODE_PREFIX): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${prefix}-${part()}-${part()}`;
}

/**
 * Maakt invoer van een klant netjes: hoofdletters, spaties weg, streepjes goed.
 * "tlp ab12cd34" → "TLP-AB12-CD34"
 */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length < 8 || raw.length > 16) return null;
  const m = raw.match(/^([A-Z]{2,4})([A-Z0-9]{4})([A-Z0-9]{4})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}
