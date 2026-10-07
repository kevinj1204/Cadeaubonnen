// Gedeelde helpers (veilig voor zowel server als browser)

export const VOUCHER_STATUSES = [
  "ordered",
  "awaiting_payment",
  "active",
  "partially_used",
  "used",
  "blocked",
  "cancelled",
] as const;
export type VoucherStatus = (typeof VOUCHER_STATUSES)[number];

export const STATUS_LABELS: Record<VoucherStatus, string> = {
  ordered: "Besteld",
  awaiting_payment: "Wacht op betaling",
  active: "Actief",
  partially_used: "Deels gebruikt",
  used: "Volledig gebruikt",
  blocked: "Geblokkeerd",
  cancelled: "Geannuleerd",
};

export const PAYMENT_LABELS: Record<string, string> = {
  unpaid: "Niet betaald",
  invoiced: "Factuur verstuurd",
  paid: "Betaald",
  refunded: "Terugbetaald",
  cancelled: "Geannuleerd",
};

export const REDEMPTION_LABELS: Record<string, string> = {
  held: "Gereserveerd",
  captured: "Gebruikt",
  released: "Vrijgegeven",
};

export function euro(cents: number | null | undefined, opts: { decimals?: "auto" | "always" } = {}) {
  const v = (cents ?? 0) / 100;
  const whole = Number.isInteger(v);
  const decimals = opts.decimals === "always" || !whole ? 2 : 0;
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(v);
}

export function dateNL(d: string | Date | null | undefined, withTime = false) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Europe/Amsterdam",
  }).format(date);
}

export function customerName(o: {
  customer_type: string;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  contact_person?: string | null;
}) {
  if (o.customer_type === "business") return o.company_name || o.contact_person || "—";
  return [o.first_name, o.last_name].filter(Boolean).join(" ") || "—";
}
