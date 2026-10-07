/**
 * VOORBEELD — hoe je de cadeaubon inbouwt in je BESTAANDE boekingsfuncties.
 * Dit bestand hoef je niet toe te voegen; het laat zien welke paar regels
 * je in je eigen functies zet. Namen als submitBooking / approveBooking zijn
 * voorbeelden: gebruik de namen uit jouw project.
 */

// 1) Bij het versturen van een boekingsaanvraag (server-side)
function submitBooking_VOORBEELD(data) {
  // ... jouw bestaande controles ...
  var bookingId = 'BOEKING-' + Utilities.getUuid().slice(0, 8);   // of jouw eigen ID
  var totalCents = Math.round(PRIJS_VAN_SHOOT_IN_EURO * 100);      // ← bereken zelf, niet uit de browser!

  var giftCode = (data.giftCode || '').trim();
  var gift = null;
  if (giftCode) {
    gift = cadeaubon_hold_(giftCode, bookingId, totalCents, 'Fotoshoot ' + data.datum);
    if (!gift.ok) {
      // Boeking NIET opslaan; laat de klant de melding zien
      return { ok: false, message: gift.message };
    }
  }

  // ... jouw bestaande code die de boeking opslaat ...
  // Sla bij de boeking ook op:
  //   cadeaubon code     → giftCode
  //   verrekend (euro)   → gift ? gift.appliedCents / 100 : 0
  //   nog te betalen     → gift ? gift.toPayCents / 100 : totalCents / 100
  //
  // Mislukt het opslaan van de boeking hierna? Geef het tegoed dan weer vrij:
  //   if (gift) cadeaubon_release_(giftCode, bookingId, 'Opslaan boeking mislukt');

  return { ok: true, toPay: gift ? gift.toPayCents / 100 : totalCents / 100 };
}

// 2) Als jij de boeking goedkeurt
function approveBooking_VOORBEELD(bookingId) {
  var booking = /* jouw boeking ophalen */ {};
  // ... jouw bestaande goedkeuringscode ...
  if (booking.giftCode) cadeaubon_capture_(booking.giftCode, bookingId);
  // Betaallink: gebruik het bedrag "nog te betalen" (kan € 0 zijn).
}

// 3) Als jij de boeking afwijst of de klant annuleert
function rejectBooking_VOORBEELD(bookingId) {
  var booking = /* jouw boeking ophalen */ {};
  // ... jouw bestaande afwijscode ...
  if (booking.giftCode) cadeaubon_release_(booking.giftCode, bookingId, 'Boeking afgewezen');
}
