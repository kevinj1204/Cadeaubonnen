// Controle van de bestelgegevens (draait op de server; de browser doet een eigen, vriendelijkere controle).

export type OrderInput = {
  customerType: "private" | "business";
  amount: number; // hele euro's of met centen
  firstName?: string;
  lastName?: string;
  companyName?: string;
  contactPerson?: string;
  vatNumber?: string;
  cocNumber?: string;
  invoiceReference?: string;
  invoiceEmail?: string;
  email: string;
  phone: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
  forSelf: boolean;
  recipientName?: string;
  recipientEmail?: string;
  fromName?: string;
  personalMessage?: string;
};

export const MESSAGE_MAX = 300;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function str(v: unknown, max = 120): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
}
function multiline(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max) : "";
}

export function parseOrderInput(
  body: any,
  limits: { min: number; max: number; amounts: number[]; allowCustom: boolean },
  opts: { relaxed?: boolean } = {},
): { ok: true; value: OrderInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const customerType = body?.customerType === "business" ? "business" : body?.customerType === "private" ? "private" : null;
  if (!customerType) errors.customerType = "Kies particulier of zakelijk.";

  const amount = Math.round(Number(body?.amount) * 100) / 100;
  const minA = opts.relaxed ? 1 : limits.min, maxA = opts.relaxed ? 5000 : limits.max;
  if (!Number.isFinite(amount) || amount < minA || amount > maxA) {
    errors.amount = `Kies een bedrag tussen €${minA} en €${maxA}.`;
  } else if (!opts.relaxed && !limits.allowCustom && !limits.amounts.includes(amount)) {
    errors.amount = "Kies een van de beschikbare bedragen.";
  } else if (!Number.isInteger(amount)) {
    errors.amount = "Kies een bedrag in hele euro's.";
  }

  const v: OrderInput = {
    customerType: customerType ?? "private",
    amount,
    firstName: str(body?.firstName, 60),
    lastName: str(body?.lastName, 80),
    companyName: str(body?.companyName, 120),
    contactPerson: str(body?.contactPerson, 120),
    vatNumber: str(body?.vatNumber, 30).toUpperCase().replace(/\s/g, ""),
    cocNumber: str(body?.cocNumber, 30),
    invoiceReference: str(body?.invoiceReference, 80),
    invoiceEmail: str(body?.invoiceEmail, 160).toLowerCase(),
    email: str(body?.email, 160).toLowerCase(),
    phone: str(body?.phone, 30),
    street: str(body?.street, 120),
    houseNumber: str(body?.houseNumber, 20),
    postalCode: str(body?.postalCode, 12).toUpperCase(),
    city: str(body?.city, 80),
    country: str(body?.country, 60) || "Nederland",
    forSelf: body?.forSelf !== false,
    recipientName: str(body?.recipientName, 80),
    recipientEmail: str(body?.recipientEmail, 160).toLowerCase(),
    fromName: str(body?.fromName, 80),
    personalMessage: multiline(body?.personalMessage, MESSAGE_MAX),
  };

  if (v.customerType === "private") {
    if (!v.firstName) errors.firstName = "Vul je voornaam in.";
    if (!v.lastName) errors.lastName = "Vul je achternaam in.";
  } else {
    if (!v.companyName) errors.companyName = "Vul de bedrijfsnaam in.";
    if (!v.contactPerson) errors.contactPerson = "Vul een contactpersoon in.";
    if (v.vatNumber && !/^[A-Z]{2}[A-Z0-9]{8,12}$/.test(v.vatNumber))
      errors.vatNumber = "Dit lijkt geen geldig btw-nummer (bijv. NL123456789B01).";
    if (v.invoiceEmail && !EMAIL_RE.test(v.invoiceEmail)) errors.invoiceEmail = "Vul een geldig e-mailadres in.";
  }
  if (!EMAIL_RE.test(v.email)) errors.email = "Vul een geldig e-mailadres in.";
  const r = !opts.relaxed; // in de backoffice zijn adres en telefoon optioneel
  if ((r || v.phone) && v.phone.replace(/[^0-9]/g, "").length < 8) errors.phone = "Vul een geldig telefoonnummer in.";
  if (r && !v.street) errors.street = "Vul de straat in.";
  if (r && !v.houseNumber) errors.houseNumber = "Vul het huisnummer in.";
  if (!v.postalCode) { if (r) errors.postalCode = "Vul de postcode in."; }
  else if (v.country === "Nederland" && !/^[1-9][0-9]{3}\s?[A-Z]{2}$/.test(v.postalCode))
    errors.postalCode = "Gebruik het formaat 1234 AB.";
  else if (v.country === "België" && !/^[1-9][0-9]{3}$/.test(v.postalCode)) errors.postalCode = "Gebruik 4 cijfers, bijv. 3630.";
  if (r && !v.city) errors.city = "Vul de plaats in.";

  if (!v.forSelf) {
    if (!v.recipientName) errors.recipientName = "Vul de naam van de ontvanger in.";
    if (v.recipientEmail && !EMAIL_RE.test(v.recipientEmail)) errors.recipientEmail = "Vul een geldig e-mailadres in.";
  } else {
    v.recipientName = "";
    v.recipientEmail = "";
    v.personalMessage = "";
    v.fromName = "";
  }
  if (v.country === "Nederland" && /^[0-9]{4}[A-Z]{2}$/.test(v.postalCode)) v.postalCode = `${v.postalCode.slice(0, 4)} ${v.postalCode.slice(4)}`;

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: v };
}
