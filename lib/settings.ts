import { query } from "./db";

export type EmailTemplate = { enabled: boolean; subject: string; body: string };

export type Settings = {
  /** Bedragen (in hele euro's) die klanten kunnen kiezen */
  amounts: number[];
  /** Mag de klant ook een eigen bedrag invullen (binnen min/max)? */
  allowCustomAmount: boolean;
  minAmount: number;
  maxAmount: number;
  /** Geldigheid na activatie in maanden (0 = onbeperkt) */
  validityMonths: number;
  /** Teksten op de bestelpagina */
  intro: { title: string; subtitle: string };
  termsUrl: string;
  /** Ontwerp van de PDF-cadeaubon */
  design: {
    key: string;
    title: string;
    subtitle: string;
    footer: string;
    website: string;
    accent: string;      // koper
    accentSoft: string;  // goud
    background: string;
    text: string;
    muted: string;
  };
  /** Waar meldingen van nieuwe bestellingen heen gaan */
  notifyEmail: string;
  emails: {
    orderReceived: EmailTemplate;
    activated: EmailTemplate;
    adminNewOrder: EmailTemplate;
  };
};

export const DEFAULT_SETTINGS: Settings = {
  amounts: [10, 15, 20, 25, 30, 40, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500],
  allowCustomAmount: true,
  minAmount: 10,
  maxAmount: 500,
  validityMonths: 12,
  intro: {
    title: "Geef licht cadeau",
    subtitle:
      "Een cadeaubon van The Light Portraits is een herinnering die blijft. Te besteden aan iedere fotoshoot — wat er over blijft, blijft gewoon op de bon staan.",
  },
  termsUrl: "",
  design: {
    key: "classic",
    title: "THE LIGHT PORTRAITS",
    subtitle: "Cadeaubon",
    footer: "In te wisselen bij het boeken van een fotoshoot via thelightportraits.nl",
    website: "thelightportraits.nl",
    accent: "#B87A4B",
    accentSoft: "#C9A96E",
    background: "#0E0E0F",
    text: "#EDE8E0",
    muted: "#8F887E",
  },
  notifyEmail: "info@thelightportraits.nl",
  emails: {
    orderReceived: {
      enabled: true,
      subject: "Je bestelling {{bestelnummer}} is ontvangen",
      body: `Beste {{naam}},

Dank je wel voor je bestelling van een The Light Portraits cadeaubon.

Bestelnummer: {{bestelnummer}}
Waarde: {{bedrag}}
{{voor_regel}}

Er heeft nog geen betaling plaatsgevonden. Je ontvangt binnenkort een factuur met de betaalinformatie op dit e-mailadres.
Zodra de betaling binnen is, activeren we de cadeaubon en sturen we je de digitale cadeaubon als PDF.

Heb je vragen? Beantwoord gerust deze e-mail.

Met lichte groet,
The Light Portraits`,
    },
    activated: {
      enabled: true,
      subject: "Je The Light Portraits cadeaubon is actief",
      body: `Beste {{naam}},

Je betaling is ontvangen — dank je wel! De cadeaubon is vanaf nu actief.

Cadeauboncode: {{code}}
Waarde: {{bedrag}}
{{geldig_tot_regel}}

In de bijlage vind je de digitale cadeaubon als PDF, klaar om cadeau te geven.
Je kunt hem ook hier downloaden: {{pdf_link}}

De code kan worden ingevoerd bij het boeken van een fotoshoot. Wordt niet het hele bedrag gebruikt, dan blijft de restwaarde op dezelfde code staan.

Met lichte groet,
The Light Portraits`,
    },
    adminNewOrder: {
      enabled: true,
      subject: "Nieuwe cadeaubonbestelling {{bestelnummer}} – {{bedrag}}",
      body: `Nieuwe bestelling ontvangen.

Bestelnummer: {{bestelnummer}}
Klant: {{naam}} ({{type}})
E-mail: {{email}}
Telefoon: {{telefoon}}
Waarde: {{bedrag}}
{{voor_regel}}

Open de backoffice: {{admin_link}}`,
    },
  },
};

function merge<T>(base: T, override: any): T {
  if (override === null || override === undefined) return base;
  if (Array.isArray(base)) return (Array.isArray(override) ? override : base) as T;
  if (typeof base === "object" && base !== null) {
    const out: any = { ...base };
    for (const k of Object.keys(base as any)) out[k] = merge((base as any)[k], override[k]);
    return out;
  }
  return (typeof override === typeof base ? override : base) as T;
}

let cache: { at: number; value: Settings } | null = null;

export async function getSettings(fresh = false): Promise<Settings> {
  if (!fresh && cache && Date.now() - cache.at < 15_000) return cache.value;
  const rows = await query<{ value: any }>("SELECT value FROM settings WHERE key = 'app'");
  const value = merge(DEFAULT_SETTINGS, rows[0]?.value ?? {});
  cache = { at: Date.now(), value };
  return value;
}

export function validateSettings(input: any): { ok: true; value: Settings } | { ok: false; error: string } {
  const s = merge(DEFAULT_SETTINGS, input);
  const min = Math.round(Number(s.minAmount));
  const max = Math.round(Number(s.maxAmount));
  if (!(min >= 1 && max >= min && max <= 10000)) return { ok: false, error: "Minimum en maximum kloppen niet." };
  const amounts = Array.from(new Set((s.amounts || []).map((n: any) => Math.round(Number(n)))))
    .filter((n) => Number.isFinite(n) && n >= min && n <= max)
    .sort((a, b) => a - b);
  if (!amounts.length && !s.allowCustomAmount)
    return { ok: false, error: "Kies minstens één bedrag of sta een eigen bedrag toe." };
  const months = Math.max(0, Math.min(120, Math.round(Number(s.validityMonths) || 0)));
  const hex = /^#[0-9a-fA-F]{6}$/;
  for (const k of ["accent", "accentSoft", "background", "text", "muted"] as const) {
    if (!hex.test(s.design[k])) return { ok: false, error: `Kleur "${k}" moet een hexcode zijn, bijv. #B87A4B.` };
  }
  return { ok: true, value: { ...s, amounts, minAmount: min, maxAmount: max, validityMonths: months } };
}

export async function saveSettings(value: Settings) {
  await query(
    `INSERT INTO settings (key, value, updated_at) VALUES ('app', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify(value)],
  );
  cache = null;
}

/** Instellingen die veilig naar de browser mogen (geen e-mailteksten e.d.) */
export function publicSettings(s: Settings) {
  return {
    amounts: s.amounts,
    allowCustomAmount: s.allowCustomAmount,
    minAmount: s.minAmount,
    maxAmount: s.maxAmount,
    validityMonths: s.validityMonths,
    intro: s.intro,
    termsUrl: s.termsUrl,
  };
}
export type PublicSettings = ReturnType<typeof publicSettings>;
