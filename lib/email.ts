// =====================================================================
// E-mails via SMTP (bijv. je bestaande mailbox info@thelightportraits.nl).
// Zonder SMTP-instellingen wordt er niets verstuurd, maar wel gelogd,
// zodat de rest van de app gewoon werkt.
// =====================================================================
import nodemailer from "nodemailer";
import { query } from "./db";
import { customerName, dateNL, euro } from "./format";
import { pdfToken } from "./security";
import { renderVoucherPdf, pdfFilename } from "./pdf";
import type { EmailTemplate, Settings } from "./settings";

export const PLACEHOLDERS: { key: string; label: string }[] = [
  { key: "naam", label: "Voornaam / contactpersoon van de besteller" },
  { key: "volledige_naam", label: "Volledige naam of bedrijfsnaam" },
  { key: "bestelnummer", label: "Bestelnummer, bijv. CB-2026-0001" },
  { key: "bedrag", label: "Waarde van de cadeaubon" },
  { key: "code", label: "Cadeauboncode (pas zinvol na activatie)" },
  { key: "ontvanger", label: "Naam ontvanger" },
  { key: "voor_regel", label: "‘Voor: …’ als de bon voor iemand anders is, anders leeg" },
  { key: "geldig_tot", label: "Vervaldatum" },
  { key: "geldig_tot_regel", label: "‘Geldig tot en met …’ of leeg" },
  { key: "pdf_link", label: "Downloadlink van de PDF (na activatie)" },
  { key: "email", label: "E-mailadres besteller" },
  { key: "telefoon", label: "Telefoonnummer besteller" },
  { key: "type", label: "Particulier / Zakelijk" },
  { key: "admin_link", label: "Link naar de bestelling in de backoffice" },
];

export function appUrl() {
  return (process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")).replace(/\/$/, "");
}

export function templateVars(order: any, voucher: any): Record<string, string> {
  const first = order.customer_type === "business" ? order.contact_person : order.first_name;
  return {
    naam: first || customerName(order),
    volledige_naam: customerName(order),
    bestelnummer: order.order_number,
    bedrag: euro(voucher?.original_cents ?? order.amount_cents),
    code: voucher?.code ?? "",
    ontvanger: voucher?.recipient_name ?? "",
    voor_regel: voucher?.recipient_name ? `Voor: ${voucher.recipient_name}` : "",
    geldig_tot: voucher?.expires_at ? dateNL(voucher.expires_at) : "onbeperkt",
    geldig_tot_regel: voucher?.expires_at ? `Geldig tot en met ${dateNL(voucher.expires_at)}` : "",
    pdf_link: voucher ? `${appUrl()}/api/voucher-pdf/${voucher.id}?t=${pdfToken(voucher.id, voucher.pdf_version)}` : "",
    email: order.email,
    telefoon: order.phone ?? "",
    type: order.customer_type === "business" ? "Zakelijk" : "Particulier",
    admin_link: `${appUrl()}/admin/orders/${order.id}`,
  };
}

export function fill(text: string, vars: Record<string, string>) {
  return text
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_, k) => vars[k] ?? "")
    .replace(/\n{3,}/g, "\n\n");
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function toHtml(text: string, settings: Settings) {
  const d = settings.design;
  const body = esc(text)
    .replace(/(https?:\/\/[^\s<]+)/g, `<a href="$1" style="color:${d.accent};">$1</a>`)
    .split(/\n\n/)
    .map((p) => `<p style="margin:0 0 16px;">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f3f1ee;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1ee;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${d.background};border-radius:4px;overflow:hidden;">
        <tr><td style="padding:34px 36px 8px;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:4px;color:${d.text};">${esc(d.title)}</td></tr>
        <tr><td align="center" style="padding:0 0 22px;"><div style="width:36px;height:1px;background:${d.accent};"></div></td></tr>
        <tr><td style="padding:0 36px 30px;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.65;color:${d.text};">${body}</td></tr>
        <tr><td style="padding:18px 36px 26px;border-top:1px solid #2a2826;text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:1px;color:${d.muted};">${esc(d.website)}</td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function transport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

export function emailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

async function send(opts: {
  orderId: string;
  template: string;
  to: string;
  subject: string;
  text: string;
  settings: Settings;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
  replyTo?: string;
}) {
  const t = transport();
  if (!t || !process.env.MAIL_FROM) {
    await query("INSERT INTO email_log (order_id, template, to_address, subject, status, error) VALUES ($1,$2,$3,$4,'skipped',$5)", [
      opts.orderId, opts.template, opts.to, opts.subject, "SMTP niet ingesteld",
    ]);
    return { status: "skipped" as const };
  }
  try {
    await t.sendMail({
      from: process.env.MAIL_FROM,
      to: opts.to,
      replyTo: opts.replyTo || process.env.MAIL_REPLY_TO || undefined,
      bcc: opts.template !== "adminNewOrder" ? process.env.MAIL_BCC || undefined : undefined,
      subject: opts.subject,
      text: opts.text,
      html: toHtml(opts.text, opts.settings),
      attachments: opts.attachments,
    });
    await query("INSERT INTO email_log (order_id, template, to_address, subject, status) VALUES ($1,$2,$3,$4,'sent')", [
      opts.orderId, opts.template, opts.to, opts.subject,
    ]);
    return { status: "sent" as const };
  } catch (err: any) {
    console.error("E-mail mislukt", err);
    await query("INSERT INTO email_log (order_id, template, to_address, subject, status, error) VALUES ($1,$2,$3,$4,'failed',$5)", [
      opts.orderId, opts.template, opts.to, opts.subject, String(err?.message ?? err).slice(0, 500),
    ]);
    return { status: "failed" as const, error: String(err?.message ?? err) };
  }
}

export async function sendTemplate(
  name: keyof Settings["emails"],
  order: any,
  voucher: any,
  settings: Settings,
  opts: { force?: boolean } = {},
) {
  const tpl: EmailTemplate = settings.emails[name];
  if (!tpl.enabled && !opts.force) return { status: "disabled" as const };
  const vars = templateVars(order, voucher);
  const subject = fill(tpl.subject, vars);
  const text = fill(tpl.body, vars);
  if (name === "adminNewOrder") {
    if (!settings.notifyEmail) return { status: "disabled" as const };
    return send({ orderId: order.id, template: name, to: settings.notifyEmail, subject, text, settings, replyTo: order.email });
  }
  const to = order.email;
  let attachments;
  if (name === "activated" && voucher) {
    const pdf = await renderVoucherPdf(
      {
        code: voucher.code,
        valueCents: voucher.original_cents,
        recipientName: voucher.recipient_name,
        fromName: voucher.from_name,
        message: voucher.personal_message,
        expiresAt: voucher.expires_at,
        status: voucher.status,
      },
      settings,
      voucher.design_key,
    );
    attachments = [{ filename: pdfFilename(voucher.code), content: Buffer.from(pdf), contentType: "application/pdf" }];
  }
  return send({ orderId: order.id, template: name, to, subject, text, settings, attachments });
}
