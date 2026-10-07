// =====================================================================
// Digitale cadeaubon als PDF (A5 liggend).
// Vormgeving: kleuren en teksten komen uit de instellingen (backoffice).
// Een nieuw ontwerp toevoegen = een extra functie in DESIGNS hieronder.
// =====================================================================
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { euro, dateNL } from "./format";
import type { Settings } from "./settings";

export type VoucherPdfData = {
  code: string;
  valueCents: number;
  recipientName?: string | null;
  fromName?: string | null;
  message?: string | null;
  expiresAt?: string | Date | null;
  orderNumber?: string | null;
  status?: string;
};

type Fonts = { display: PDFFont; displayItalic: PDFFont; displayMedium: PDFFont; sans: PDFFont; sansLight: PDFFont; sansMedium: PDFFont };

let fontCache: Record<string, Uint8Array> | null = null;
async function loadFontBytes() {
  if (fontCache) return fontCache;
  const dir = path.join(process.cwd(), "assets", "fonts");
  const files = {
    display: "cormorant-garamond-latin-300-normal.woff",
    displayItalic: "cormorant-garamond-latin-400-italic.woff",
    displayMedium: "cormorant-garamond-latin-500-normal.woff",
    sans: "inter-latin-400-normal.woff",
    sansLight: "inter-latin-300-normal.woff",
    sansMedium: "inter-latin-500-normal.woff",
  };
  const out: Record<string, Uint8Array> = {};
  for (const [k, f] of Object.entries(files)) out[k] = new Uint8Array(await readFile(path.join(dir, f)));
  fontCache = out;
  return out;
}

function hex(h: string) {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Tekst met letterafstand, gecentreerd op x (of links uitgelijnd). */
function spaced(page: PDFPage, text: string, o: { x: number; y: number; font: PDFFont; size: number; tracking: number; color: ReturnType<typeof rgb>; align?: "center" | "left" | "right"; opacity?: number }) {
  const chars = [...text];
  const widths = chars.map((ch) => o.font.widthOfTextAtSize(ch, o.size));
  const total = widths.reduce((a, b) => a + b, 0) + o.tracking * (chars.length - 1);
  let x = o.align === "left" ? o.x : o.align === "right" ? o.x - total : o.x - total / 2;
  chars.forEach((ch, i) => {
    page.drawText(ch, { x, y: o.y, size: o.size, font: o.font, color: o.color, opacity: o.opacity });
    x += widths[i] + o.tracking;
  });
  return total;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number, maxLines: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].replace(/\s*\S*$/, "") + " …";
    return cut;
  }
  return lines;
}

function centered(page: PDFPage, text: string, cx: number, y: number, font: PDFFont, size: number, color: ReturnType<typeof rgb>, opacity?: number) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: cx - w / 2, y, size, font, color, opacity });
}

// ---------------------------------------------------------------------
// Ontwerp "classic": donker, koperen lijnen, veel ruimte
// ---------------------------------------------------------------------
function drawClassic(page: PDFPage, f: Fonts, d: VoucherPdfData, s: Settings["design"]) {
  const W = page.getWidth();
  const H = page.getHeight();
  const bg = hex(s.background), text = hex(s.text), muted = hex(s.muted), copper = hex(s.accent), gold = hex(s.accentSoft);
  const cx = W / 2;

  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: bg });

  // Dubbele kader-lijn
  page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: copper, borderWidth: 0.7 });
  page.drawRectangle({ x: 23, y: 23, width: W - 46, height: H - 46, borderColor: copper, borderWidth: 0.3, borderOpacity: 0.5 });

  // Kopregel
  let y = H - 62;
  spaced(page, s.title.toUpperCase(), { x: cx, y, font: f.sansLight, size: 10.5, tracking: 4.2, color: text });
  y -= 14;
  page.drawLine({ start: { x: cx - 18, y }, end: { x: cx + 18, y }, thickness: 0.6, color: copper });

  // "Cadeaubon"
  y -= 44;
  centered(page, s.subtitle, cx, y, f.displayItalic, 40, text);

  // Waarde
  y -= 58;
  centered(page, euro(d.valueCents), cx, y, f.display, 50, gold);

  // Voor / Van
  const hasNames = d.recipientName || d.fromName;
  y -= 30;
  if (hasNames) {
    const parts: string[] = [];
    if (d.recipientName) parts.push(`Voor ${d.recipientName}`);
    if (d.fromName) parts.push(`van ${d.fromName}`);
    centered(page, parts.join("  ·  "), cx, y, f.displayMedium, 15, text);
    y -= 8;
  }

  // Persoonlijke boodschap
  if (d.message) {
    const lines = wrap(`“${d.message}”`, f.displayItalic, 12, W - 200, 3);
    y -= 12;
    for (const line of lines) {
      centered(page, line, cx, y, f.displayItalic, 12, muted);
      y -= 15;
    }
  }

  // Code-blok onderaan
  const boxW = 230, boxH = 46, boxY = 66;
  page.drawRectangle({ x: cx - boxW / 2, y: boxY, width: boxW, height: boxH, borderColor: copper, borderWidth: 0.6, color: rgb(1, 1, 1), opacity: 0.025 });
  spaced(page, "CADEAUBONCODE", { x: cx, y: boxY + boxH - 13, font: f.sans, size: 6.5, tracking: 2.6, color: muted });
  spaced(page, d.code, { x: cx, y: boxY + 11, font: f.sansMedium, size: 16, tracking: 2.4, color: text });

  // Voetregel
  const foot: string[] = [];
  if (d.expiresAt) foot.push(`Geldig tot en met ${dateNL(d.expiresAt)}`);
  foot.push(s.website);
  spaced(page, foot.join("   ·   ").toUpperCase(), { x: cx, y: 46, font: f.sansLight, size: 6.5, tracking: 1.6, color: muted });
  centered(page, s.footer, cx, 34, f.sansLight, 7, muted, 0.8);

  // Niet-actief watermerk (alleen in de backoffice-preview vóór betaling)
  if (d.status && ["ordered", "awaiting_payment"].includes(d.status)) {
    page.drawText("VOORBEELD — NOG NIET ACTIEF", {
      x: 95, y: 120, size: 30, font: f.sansMedium, color: copper, opacity: 0.13, rotate: degrees(18),
    });
  }
}

const DESIGNS: Record<string, typeof drawClassic> = {
  classic: drawClassic,
  // kerst: drawKerst, verjaardag: drawVerjaardag, … (later toe te voegen)
};

export async function renderVoucherPdf(d: VoucherPdfData, settings: Settings, designKey = "classic"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bytes = await loadFontBytes();
  const fonts: Fonts = {
    display: await doc.embedFont(bytes.display, { subset: true }),
    displayItalic: await doc.embedFont(bytes.displayItalic, { subset: true }),
    displayMedium: await doc.embedFont(bytes.displayMedium, { subset: true }),
    sans: await doc.embedFont(bytes.sans, { subset: true }),
    sansLight: await doc.embedFont(bytes.sansLight, { subset: true }),
    sansMedium: await doc.embedFont(bytes.sansMedium, { subset: true }),
  };
  doc.setTitle(`The Light Portraits cadeaubon ${d.code}`);
  doc.setAuthor("The Light Portraits");
  doc.setSubject(`Cadeaubon t.w.v. ${euro(d.valueCents)}`);
  doc.setCreator("The Light Portraits – Cadeaubonnen");
  const page = doc.addPage([595.28, 419.53]); // A5 liggend
  (DESIGNS[designKey] ?? DESIGNS.classic)(page, fonts, d, settings.design);
  return doc.save();
}

export function pdfFilename(code: string) {
  return `TheLightPortraits-cadeaubon-${code}.pdf`;
}
