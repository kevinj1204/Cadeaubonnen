/**
 * =====================================================================
 *  The Light Portraits – Koppeling cadeaubonnen  (Google Apps Script)
 * =====================================================================
 *  Voeg dit bestand toe als NIEUW bestand aan het Apps Script-project
 *  van de boekingsapp. Bestaande code hoeft hiervoor niet te veranderen.
 *
 *  Eenmalig instellen: Projectinstellingen (tandwiel) → Scripteigenschappen
 *    CADEAUBON_API_URL  = https://cadeaubon.thelightportraits.nl
 *    CADEAUBON_API_KEY  = (exact dezelfde waarde als BOOKING_API_KEY in Vercel)
 *
 *  Test daarna: kies bovenin de functie "cadeaubon_test" en klik op Uitvoeren.
 *
 *  Functies:
 *    cadeaubon_check(code, totaalEuro)        → mag vanuit de browser (google.script.run)
 *    cadeaubon_hold_(code, boekingId, centen)  → alleen server-side (eindigt op _)
 *    cadeaubon_capture_(code, boekingId)       → alleen server-side
 *    cadeaubon_release_(code, boekingId, reden)→ alleen server-side
 *
 *  Functies die eindigen op een underscore (_) kunnen NIET vanuit de browser
 *  worden aangeroepen. Zo kan niemand via de browser tegoed afboeken.
 * =====================================================================
 */

var CADEAUBON_TIMEOUT_MSG = 'Het cadeaubonnensysteem is even niet bereikbaar. Probeer het zo opnieuw.';

function cadeaubon_config_() {
  var props = PropertiesService.getScriptProperties();
  var url = (props.getProperty('CADEAUBON_API_URL') || '').replace(/\/+$/, '');
  var key = props.getProperty('CADEAUBON_API_KEY') || '';
  if (!url || !key) throw new Error('CADEAUBON_API_URL of CADEAUBON_API_KEY ontbreekt in de Scripteigenschappen.');
  return { url: url, key: key };
}

/** Doet een API-aanroep en geeft altijd een object terug (nooit een exception bij een API-fout). */
function cadeaubon_call_(method, path, payload) {
  var cfg = cadeaubon_config_();
  var options = {
    method: method,
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + cfg.key },
    muteHttpExceptions: true,
    followRedirects: true
  };
  if (payload) options.payload = JSON.stringify(payload);
  var res;
  try {
    res = UrlFetchApp.fetch(cfg.url + path, options);
  } catch (e) {
    console.error('Cadeaubon API niet bereikbaar: ' + e);
    return { ok: false, error: 'unreachable', message: CADEAUBON_TIMEOUT_MSG, httpStatus: 0 };
  }
  var body;
  try {
    body = JSON.parse(res.getContentText());
  } catch (e) {
    body = { ok: false, error: 'invalid_response', message: CADEAUBON_TIMEOUT_MSG };
  }
  body.httpStatus = res.getResponseCode();
  if (body.httpStatus >= 500 && !body.message) body.message = CADEAUBON_TIMEOUT_MSG;
  return body;
}

function cadeaubon_euroToCents_(v) {
  var n = Number(String(v).replace(',', '.'));
  return isFinite(n) ? Math.round(n * 100) : 0;
}
function cadeaubon_centsToEuro_(c) {
  return Math.round(c) / 100;
}

/**
 * Controleer een code (wijzigt niets). Veilig om vanuit de browser aan te roepen:
 *   google.script.run.withSuccessHandler(fn).cadeaubon_check('TLP-ABCD-EFGH', 165)
 *
 * Tip: geef liever geen totaal vanuit de browser mee, maar bereken het
 * totaal hier op de server uit de gekozen shoot (zie README).
 *
 * @return {{valid:boolean, code:string, message:string, remaining:number,
 *           original:number, applied:number, toPay:number, expiresAt:string|null}}
 */
function cadeaubon_check(code, bookingTotalEuro) {
  if (!code || String(code).replace(/[^A-Za-z0-9]/g, '').length < 8) {
    return { valid: false, message: 'Vul een geldige code in, bijv. TLP-ABCD-EFGH.' };
  }
  var payload = { code: String(code) };
  var totalCents = bookingTotalEuro ? cadeaubon_euroToCents_(bookingTotalEuro) : 0;
  if (totalCents > 0) payload.booking_total_cents = totalCents;
  var r = cadeaubon_call_('post', '/api/v1/vouchers/check', payload);
  if (!r.ok || !r.voucher) {
    return { valid: false, message: r.message || 'Deze code is niet bekend.' };
  }
  var v = r.voucher;
  var applied = v.valid ? (totalCents > 0 ? v.applied_cents : v.remaining_cents) : 0;
  return {
    valid: v.valid,
    code: v.code,
    message: v.message,
    remaining: cadeaubon_centsToEuro_(v.remaining_cents),
    original: cadeaubon_centsToEuro_(v.original_cents),
    applied: cadeaubon_centsToEuro_(applied),
    toPay: totalCents > 0 ? cadeaubon_centsToEuro_(totalCents - applied) : null,
    expiresAt: v.expires_at
  };
}

/**
 * Reserveer tegoed bij het versturen van een boekingsaanvraag.
 * Roep dit aan in je bestaande server-functie die een boeking opslaat,
 * NADAT je de prijs zelf (server-side) hebt berekend.
 *
 * Veilig om opnieuw te proberen: dezelfde boekingId geeft hetzelfde resultaat
 * en boekt nooit twee keer af.
 *
 * @param {string} code        cadeauboncode van de klant
 * @param {string} bookingId   uniek kenmerk van de boeking (bijv. rijnummer of eigen ID)
 * @param {number} totalCents  totaalprijs van de boeking in centen (bijv. 16500)
 * @param {string=} description bijv. "Fotoshoot 14 november 2026"
 * @return {{ok:boolean, message:string, appliedCents:number, toPayCents:number, remainingCents:number}}
 */
function cadeaubon_hold_(code, bookingId, totalCents, description) {
  var r = cadeaubon_call_('post', '/api/v1/vouchers/hold', {
    code: String(code),
    booking_ref: String(bookingId),
    booking_total_cents: Math.round(totalCents),
    description: description || ''
  });
  if (!r.ok) return { ok: false, message: r.message || 'De cadeaubon kon niet verwerkt worden.', error: r.error };
  return {
    ok: true,
    code: r.voucher.code,
    message: 'Cadeaubon verrekend.',
    appliedCents: r.applied_cents,
    toPayCents: r.to_pay_cents,
    remainingCents: r.voucher.remaining_cents
  };
}

/** Maak de reservering definitief. Aanroepen als je de boeking goedkeurt. */
function cadeaubon_capture_(code, bookingId) {
  var r = cadeaubon_call_('post', '/api/v1/vouchers/capture', { code: String(code), booking_ref: String(bookingId) });
  if (!r.ok) console.warn('Cadeaubon capture mislukt voor ' + bookingId + ': ' + r.message);
  return { ok: !!r.ok, message: r.message || 'Afgeboekt.' };
}

/** Geef de reservering vrij. Aanroepen als je de boeking afwijst of annuleert. */
function cadeaubon_release_(code, bookingId, reason) {
  var r = cadeaubon_call_('post', '/api/v1/vouchers/release', {
    code: String(code),
    booking_ref: String(bookingId),
    reason: reason || 'Boeking afgewezen'
  });
  if (!r.ok) console.warn('Cadeaubon release mislukt voor ' + bookingId + ': ' + r.message);
  return { ok: !!r.ok, message: r.message || 'Vrijgegeven.', remainingCents: r.voucher ? r.voucher.remaining_cents : null };
}

/** Handmatige test vanuit de Apps Script-editor (Uitvoeren → cadeaubon_test). */
function cadeaubon_test() {
  var h = cadeaubon_call_('get', '/api/v1/health');
  Logger.log('Verbinding: ' + (h.ok ? 'OK ✓' : 'MISLUKT ✗ — ' + (h.message || h.error) + ' (HTTP ' + h.httpStatus + ')'));
  var c = cadeaubon_check('TLP-TEST-TEST', 100);
  Logger.log('Testcode (hoort onbekend te zijn): ' + c.message);
}
