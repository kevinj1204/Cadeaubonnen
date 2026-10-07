# The Light Portraits — Cadeaubonnen

Zelfstandige webapp waarmee klanten een cadeaubon bestellen, jij in een backoffice de betaling verwerkt en de bon activeert, en je boekingsapp de code veilig kan verrekenen — inclusief restwaarde.

```
Klant bestelt  →  Besteld  →  (factuur verstuurd) Wacht op betaling  →  Betaald / Actief
                                                                          ↓
                                       Boekingsapp: check → hold → capture / release
                                                                          ↓
                                                     Deels gebruikt  →  Volledig gebruikt
                         (altijd mogelijk: Geblokkeerd / Geannuleerd)
```

**Techniek:** Next.js 16 (Vercel) · PostgreSQL (Neon, via Vercel) · PDF met pdf-lib · e-mail via je eigen SMTP-mailbox.
Er staan geen geheimen in de frontend: alles wat gevoelig is draait server-side en komt uit environment variables.

---

## Inhoud

1. [Installatie via GitHub](#1-installatie-via-github)
2. [Deployment via Vercel](#2-deployment-via-vercel)
3. [Databaseconfiguratie](#3-databaseconfiguratie)
4. [Environment variables](#4-environment-variables)
5. [Backoffice-login](#5-backoffice-login)
6. [Beheer van bestellingen](#6-beheer-van-bestellingen)
7. [Een cadeaubon activeren](#7-een-cadeaubon-activeren)
8. [De PDF-cadeaubon](#8-de-pdf-cadeaubon)
9. [E-mail instellen](#9-e-mail-instellen)
10. [Koppeling met de boekingsapp](#10-koppeling-met-de-boekingsapp)
11. [API-endpoints](#11-api-endpoints)
12. [Waardecodes testen](#12-waardecodes-testen)
13. [Gedeeltelijk gebruik / restwaarde testen](#13-gedeeltelijk-gebruik--restwaarde-testen)
14. [Beveiliging van de koppeling](#14-beveiliging-van-de-koppeling)
15. [Later uitbreiden](#15-later-uitbreiden)

---

## 1. Installatie via GitHub

1. Ga naar **github.com → New repository**. Naam bijvoorbeeld `cadeaubon`, zet hem op **Private**. Vink níets aan (geen README).
2. Pak de zip uit. Kies één van deze twee manieren:
   - **Zonder terminal:** open de nieuwe lege repository, klik op **“uploading an existing file”** en sleep de *inhoud* van de map `cadeaubon` erin (dus `app`, `lib`, `package.json`, … — niet de map zelf). Sleep de map `node_modules` niet mee (zit niet in de zip). Klik **Commit changes**.
   - **Met terminal (Mac):**
     ```bash
     cd ~/Downloads/cadeaubon
     git init && git add . && git commit -m "Cadeaubonnen-app"
     git branch -M main
     git remote add origin https://github.com/<jouw-naam>/cadeaubon.git
     git push -u origin main
     ```
3. Controleer dat het bestand `.env.local` **niet** in GitHub staat (het `.gitignore`-bestand zorgt daarvoor).

## 2. Deployment via Vercel

1. Ga naar **vercel.com → Add New… → Project** en kies de repository `cadeaubon` → **Import**.
2. Framework wordt automatisch herkend als **Next.js**. Niets aanpassen.
3. Klik nog **niet** op Deploy als je de database nog niet hebt; doe eerst stap 3 en 4. (Al gedeployd? Geen probleem — na stap 3 en 4 kies je **Deployments → ⋯ → Redeploy**.)
4. **Eigen adres (aanbevolen):** Project → **Settings → Domains → Add** → `cadeaubon.thelightportraits.nl`. Vercel toont een CNAME-record (meestal `cname.vercel-dns.com`). Voeg dat toe bij **goedkopewebhoster.nl → DNS-beheer** van thelightportraits.nl, net zoals je bij `casting.thelightportraits.nl` deed.
5. **In WordPress tonen (zoals de review-app):** maak in WordPress een pagina, bijv. `/cadeaubon`, met een blok **Aangepaste HTML** en plak de inhoud van `wordpress/embed.html`. Het iframe groeit per stap automatisch mee in hoogte en scrollt netjes naar boven bij elke stap. De backoffice open je los via `<vercel-adres>/admin` (die kan bewust niet in een iframe).
   Gebruik je geen subdomein, zet `APP_URL` dan op je Vercel-adres (bijv. `https://cadeaubonnen.vercel.app`).

## 3. Databaseconfiguratie

Aanbevolen: **Neon Postgres via Vercel** (gratis tier ruim voldoende).

1. Vercel → je project → **Storage → Create Database → Neon (Serverless Postgres)** → regio **Frankfurt (eu-central-1)** → koppel aan het project.
   Vercel zet daarmee automatisch `DATABASE_URL` in je environment variables.
2. Tabellen aanmaken — kies één manier:
   - **Zonder terminal:** open in Vercel → Storage → je database → **Open in Neon Console → SQL Editor**. Kopieer de volledige inhoud van `db/schema.sql`, plak en klik **Run**.
   - **Met terminal:** zet `DATABASE_URL` in `.env.local` en voer uit:
     ```bash
     npm install
     npm run db:setup
     ```
3. Je ziet de tabellen `orders`, `vouchers`, `redemptions`, `events`, `settings`, `email_log`, `login_attempts`, `api_failures`.
   Het schema is veilig om opnieuw te draaien (bij updates later).

> Andere Postgres (Supabase e.d.) werkt ook: zet alleen een andere `DATABASE_URL`.

## 4. Environment variables

Vercel → Project → **Settings → Environment Variables**. Zie ook `.env.example`.

| Naam | Verplicht | Waarde |
|---|---|---|
| `DATABASE_URL` | ja | Automatisch via Neon (stap 3) |
| `APP_URL` | ja | `https://cadeaubon.thelightportraits.nl` (zonder `/` aan het eind) |
| `ADMIN_PASSWORD` | ja | Wachtwoord voor de backoffice, min. 10 tekens |
| `SESSION_SECRET` | ja | Willekeurige reeks van min. 32 tekens |
| `BOOKING_API_KEY` | ja | Willekeurige reeks van min. 32 tekens — de sleutel voor de boekingsapp |
| `SMTP_HOST` | voor e-mail | Zie stap 9 |
| `SMTP_PORT` | voor e-mail | `465` |
| `SMTP_USER` | voor e-mail | `info@thelightportraits.nl` |
| `SMTP_PASS` | voor e-mail | Wachtwoord van die mailbox |
| `MAIL_FROM` | voor e-mail | `The Light Portraits <info@thelightportraits.nl>` |
| `MAIL_BCC` | nee | Kopie van elke klantmail naar jezelf |
| `ORDER_RATE_LIMIT` | nee | Max. bestellingen per uur per IP (standaard 10) |

**Willekeurige sleutels maken:** in Terminal `openssl rand -base64 36` (twee keer: één voor `SESSION_SECRET`, één voor `BOOKING_API_KEY`). Of gebruik de wachtwoordgenerator van je wachtwoordbeheerder (≥ 40 tekens, letters + cijfers).

Na het toevoegen of wijzigen: **Deployments → ⋯ → Redeploy**.

## 5. Backoffice-login

- Ga naar `https://cadeaubon.thelightportraits.nl/admin` en log in met `ADMIN_PASSWORD`.
- Je blijft 12 uur ingelogd. Na 5 foute pogingen wordt inloggen vanaf dat adres 15 minuten geblokkeerd.
- Wachtwoord wijzigen = `ADMIN_PASSWORD` aanpassen in Vercel en redeployen. `SESSION_SECRET` wijzigen logt iedereen uit.

## 6. Beheer van bestellingen

**Bestellingen** (startpagina backoffice)
- Zoeken op naam, e-mail, telefoon, bestelnummer, bedrijfsnaam, ontvanger of (een deel van) de code.
- Filters: Open (nog niet betaald), Besteld, Wacht op betaling, Actief, Deels gebruikt, Volledig gebruikt, Geblokkeerd, Geannuleerd.
- **Export (CSV)** — alle bestellingen voor je boekhouding (opent in Excel/Numbers).

**Bestelling openen** toont: code, oorspronkelijke waarde, restwaarde, geldigheid, alle gegevens van de besteller (particulier of zakelijk incl. btw/KvK/referentie), ontvanger, persoonlijke boodschap, gebruiksgeschiedenis, logboek en verzonden e-mails.

**Acties per bestelling**
| Actie | Wat het doet |
|---|---|
| Factuur verstuurd | Besteld → Wacht op betaling (zodat je ziet welke facturen al de deur uit zijn) |
| Betaald — activeren | Bon wordt actief en direct bruikbaar; geldigheid wordt gezet; klant krijgt (optioneel) de PDF |
| Blokkeren / Blokkade opheffen | Tijdelijk onbruikbaar maken (bijv. bij twijfel) |
| Annuleren / Heropenen | Code definitief onbruikbaar (terug te draaien) |
| Verwijderen | Bestelling + bon helemaal wissen (alleen als de bon nooit in een boeking is gebruikt; typ VERWIJDER ter bevestiging) |
| Handmatig afboeken | Tegoed gebruiken buiten de boekingsapp (bijv. betaling in de studio) |
| Terugzetten | Een afboeking ongedaan maken; bedrag komt terug op de bon |
| Wijzigen (op de cadeaubon) | Naam/boodschap aanpassen; PDF wordt opnieuw gegenereerd |
| Geldig tot | Vervaldatum aanpassen of leegmaken (onbeperkt) |
| E-mails opnieuw versturen | Bevestiging of cadeaubon-met-PDF nogmaals sturen |
| Interne notities | Bijv. je factuurnummer |
| Geavanceerd | Status direct zetten (alleen om een vergissing te herstellen) |

**Nieuwe bon** — handmatig een cadeaubon aanmaken (telefonische bestelling, winactie, cadeau). Optioneel direct activeren.

**Instellingen**
- Bedragen die klanten kunnen kiezen (toevoegen/verwijderen), minimum/maximum, wel/geen eigen bedrag.
- Geldigheid na activatie in maanden (standaard 12, `0` = onbeperkt).
- Titel en introductietekst van de bestelpagina, link naar je voorwaarden.
- Ontwerp van de PDF (teksten en kleuren) met **Voorbeeld-PDF**.
- Teksten van alle e-mails, met invulvelden zoals `{{naam}}`, `{{code}}`, `{{bedrag}}`.

## 7. Een cadeaubon activeren

1. Klant bestelt → je krijgt een melding (als e-mail is ingesteld) en de bestelling staat op **Besteld**. De code is al aangemaakt maar **werkt nog niet**.
2. Stuur de factuur vanuit je boekhoudpakket. Klik in de backoffice op **Factuur verstuurd** (optioneel, voor overzicht).
3. Betaling binnen? Open de bestelling → **Betaald — activeren** → laat het vinkje “Stuur de klant de cadeaubon (PDF)” aan → bevestigen.
4. De status wordt **Actief**, de vervaldatum wordt gezet en de klant ontvangt de PDF. Vanaf nu werkt de code in de boekingsapp.

## 8. De PDF-cadeaubon

- Wordt altijd vers gegenereerd uit de database (A5 liggend), dus er hoeft niets opgeslagen te worden.
- **Bekijken / Downloaden / Opnieuw genereren** op de bestelpagina in de backoffice.
- Zolang een bon niet betaald is, staat er een watermerk *“Voorbeeld — nog niet actief”* op.
- De klant krijgt de PDF als bijlage bij de activatiemail, plus een persoonlijke downloadlink (werkt alleen voor die ene, geactiveerde bon; na “Opnieuw genereren” vervalt de oude link).
- **Ontwerp aanpassen:** kleuren en teksten via Instellingen. Een volledig nieuw ontwerp (bijv. kerst) voeg je toe als extra functie in `lib/pdf.ts` → `DESIGNS`; elke bon heeft een `design_key` in de database.
- Lettertypes: Cormorant Garamond + Inter, gelijk aan de boekingsapp (map `assets/fonts`, open licentie).

## 9. E-mail instellen

De app verstuurt via je bestaande mailbox `info@thelightportraits.nl` — geen extra dienst of DNS-wijziging nodig.

1. Zoek in het klantenpaneel van **goedkopewebhoster.nl** de **uitgaande mailserver (SMTP)** op. Meestal is dat `mail.thelightportraits.nl` of de servernaam van je pakket, poort **465 (SSL)**.
2. Zet in Vercel: `SMTP_HOST`, `SMTP_PORT=465`, `SMTP_USER=info@thelightportraits.nl`, `SMTP_PASS=<wachtwoord>`, `MAIL_FROM=The Light Portraits <info@thelightportraits.nl>`. Redeploy.
3. Controleer in de backoffice: **Instellingen → Systeemstatus** moet “E-mail (SMTP): ingesteld” tonen.
4. Test: plaats een testbestelling met je eigen e-mailadres. Bij elke bestelling zie je onder **E-mails** of het gelukt is (en zo niet: de foutmelding).

E-mails:
- **E-mail 1 — Bestelling ontvangen** → klant, direct na bestellen (zonder code; die werkt nog niet).
- **E-mail 2 — Cadeaubon geactiveerd** → klant, als jij op “Betaald — activeren” klikt, met PDF als bijlage.
- **Melding nieuwe bestelling** → jou (adres in Instellingen).

Zonder SMTP werkt alles gewoon, alleen worden er geen mails verstuurd (dat zie je terug als “Niet verstuurd”).

## 10. Koppeling met de boekingsapp

Uitgangspunt: **bestaande boekingen en functies blijven ongewijzigd.** Je voegt drie dingen toe.

De boekingsapp draait in Google Apps Script. De browser van de klant praat met Apps Script (`google.script.run`), en Apps Script praat server-side met deze API. De geheime sleutel staat dus alleen in Apps Script, nooit in de browser.

### Stap A — Module toevoegen (geen bestaande code aanpassen)
1. Open het Apps Script-project van de boekingsapp.
2. **Bestanden → + → Script** → naam `Cadeaubon` → plak de inhoud van `apps-script/Cadeaubon.gs`.
3. **Projectinstellingen (tandwiel) → Scripteigenschappen → Eigenschap toevoegen:**
   - `CADEAUBON_API_URL` = `https://cadeaubon.thelightportraits.nl`
   - `CADEAUBON_API_KEY` = exact dezelfde waarde als `BOOKING_API_KEY` in Vercel
4. Kies bovenin de functie `cadeaubon_test` → **Uitvoeren** → geef toestemming voor externe verbindingen. In het logboek moet staan: `Verbinding: OK ✓`.

Tot hier is er voor klanten niets veranderd.

### Stap B — Invoerveld in het boekingsformulier
1. **Bestanden → + → HTML** → naam `CadeaubonVeld` → plak `apps-script/CadeaubonVeld.html`.
2. Zet het veld in je boekings-HTML waar de prijs/het overzicht staat, vlak boven de verstuurknop:
   ```html
   <?!= HtmlService.createHtmlOutputFromFile('CadeaubonVeld').getContent(); ?>
   ```
   (Gebruik je al een `include()`-functie, dan `<?!= include('CadeaubonVeld'); ?>`. Laad je de pagina met `createHtmlOutputFromFile` in plaats van `createTemplateFromFile`, plak dan de inhoud van het bestand rechtstreeks in je HTML.)
3. In je eigen JavaScript, op het moment dat de prijs van de gekozen shoot bekend is:
   ```js
   tlpCadeaubon.setTotal(165);            // prijs in euro
   ```
4. Bij het versturen van de boeking geef je de code mee aan je server-functie:
   ```js
   data.giftCode = tlpCadeaubon.getCode();   // '' als er geen geldige code is
   google.script.run.withSuccessHandler(...).submitBooking(data);
   ```
   Wil je het totaalbedrag op de pagina laten bijwerken? Luister naar:
   ```js
   document.addEventListener('tlp:cadeaubon', e => { /* e.detail.toPay, e.detail.applied of null */ });
   ```

### Stap C — Drie regels in je bestaande server-functies
Zie `apps-script/VoorbeeldBoeking.gs` voor een uitgewerkt voorbeeld.

| Moment | Toevoegen | Effect |
|---|---|---|
| Boekingsaanvraag opslaan (bijv. `submitBooking`) | `var gift = cadeaubon_hold_(data.giftCode, bookingId, totaalInCenten, 'Fotoshoot ' + datum);` Als `!gift.ok` → boeking niet opslaan en `gift.message` tonen. Sla `giftCode`, `gift.appliedCents` en `gift.toPayCents` op bij de boeking. | Tegoed wordt gereserveerd en direct van de bon afgehaald |
| Boeking goedkeuren | `if (booking.giftCode) cadeaubon_capture_(booking.giftCode, bookingId);` | Afboeking wordt definitief |
| Boeking afwijzen / annuleren | `if (booking.giftCode) cadeaubon_release_(booking.giftCode, bookingId, 'Boeking afgewezen');` | Bedrag komt terug op de bon |

Belangrijk:
- **Bereken het totaalbedrag server-side** (uit de gekozen shoot), niet uit de browser.
- `bookingId` moet uniek zijn per boeking. Dezelfde aanroep nogmaals (bijv. bij een netwerkfout) boekt nooit dubbel af.
- Stuur de betaallink voor het bedrag **nog te betalen** (`toPayCents`, kan € 0 zijn).
- Geen goedkeuringsstap? Gebruik dan alleen `redeem` (reserveren + direct definitief).

Volgorde om veilig live te gaan: A → testen met `cadeaubon_test` → B en C in een **kopie/testimplementatie** van je web-app → zelf een testboeking met een testbon → daarna pas de live-implementatie bijwerken (**Implementeren → Implementaties beheren → Bewerken → Nieuwe versie**).

## 11. API-endpoints

Basis-URL: `APP_URL`. Alle aanroepen: header `Authorization: Bearer <BOOKING_API_KEY>`, body JSON. Bedragen in **centen**. De code mag in elke vorm (`tlp abcd efgh` wordt `TLP-ABCD-EFGH`).

| Methode | Pad | Body | Doel |
|---|---|---|---|
| POST | `/api/v1/vouchers/check` | `code`, optioneel `booking_total_cents` | Controleren, wijzigt niets |
| POST | `/api/v1/vouchers/hold` | `code`, `booking_ref`, `booking_total_cents`, opt. `description`, `max_amount_cents` | Reserveren (saldo gaat er direct af) |
| POST | `/api/v1/vouchers/capture` | `code`, `booking_ref` | Reservering definitief maken |
| POST | `/api/v1/vouchers/release` | `code`, `booking_ref`, opt. `reason`, `force` | Reservering vrijgeven (met `force: true` ook een definitieve afboeking) |
| POST | `/api/v1/vouchers/redeem` | als `hold` | Reserveren + direct definitief |
| GET | `/api/v1/health` | — | Verbinding testen |

**Voorbeeld `check`-antwoord** (bon € 100, boeking € 165):
```json
{
  "ok": true,
  "voucher": {
    "code": "TLP-A3C6-K9QX", "valid": true, "reason": null,
    "message": "Cadeaubon geldig. Beschikbaar tegoed: € 100.",
    "status": "active", "original_cents": 10000, "remaining_cents": 10000,
    "expires_at": "2027-10-07T21:59:00.000Z",
    "booking_total_cents": 16500, "applied_cents": 10000,
    "to_pay_cents": 6500, "remaining_after_cents": 0
  }
}
```

**Foutcodes** (`error`): `not_found` (404), `not_paid`, `blocked`, `cancelled`, `used`, `expired` (409), `no_hold` (404), `already_captured` (409), `invalid_code_format`/`missing_booking_ref`/`invalid_amount` (400), `unauthorized` (401), `too_many_attempts` (429). Elke fout heeft ook een Nederlandse `message` die je direct aan de klant kunt tonen.

## 12. Waardecodes testen

**In de backoffice (geen code nodig):**
1. **Nieuwe bon** → € 100, vink **Direct activeren** aan → aanmaken. Noteer de code.
2. **Koppeling → Code testen** → code invullen, bedrag `75` → je ziet: verrekend € 75, te betalen € 0, rest € 25. Er wordt niets afgeboekt.
3. Test ook een niet-betaalde bon (bestel er zelf een via de bestelpagina): melding “nog niet geactiveerd”.

**Vanuit Apps Script:** voer `cadeaubon_test` uit, of tijdelijk:
```js
function testCheck() { Logger.log(JSON.stringify(cadeaubon_check('TLP-XXXX-XXXX', 75))); }
```

**Met curl (Terminal):**
```bash
curl -s https://cadeaubon.thelightportraits.nl/api/v1/vouchers/check \
  -H "Authorization: Bearer $BOOKING_API_KEY" -H "Content-Type: application/json" \
  -d '{"code":"TLP-XXXX-XXXX","booking_total_cents":7500}'
```

## 13. Gedeeltelijk gebruik / restwaarde testen

Met een actieve testbon van € 100:

| Stap | Actie | Verwacht |
|---|---|---|
| 1 | `hold` boeking `TEST-1`, € 75 | verrekend € 75, te betalen € 0, rest **€ 25**, status *Deels gebruikt* |
| 2 | dezelfde `hold` nogmaals | `idempotent: true`, rest blijft € 25 |
| 3 | `capture` `TEST-1` | status *Gebruikt* in de geschiedenis |
| 4 | `hold` boeking `TEST-2`, € 165 | verrekend € 25, **te betalen € 140**, rest € 0, *Volledig gebruikt* |
| 5 | `release` `TEST-2` | € 25 terug, *Deels gebruikt* |

Alles verschijnt in de backoffice onder **Gebruiksgeschiedenis** en **Logboek**. Handmatig kan het ook: bestelling openen → **Handmatig afboeken** / **Terugzetten**.

**Automatische test** (40 controles, incl. 10 gelijktijdige boekingen op één bon): draai de app lokaal met een **lege testdatabase** en voer uit:
```bash
npm install
npm run db:setup
npm run build && npm start      # in een tweede venster:
npm run test:api
```
(Draai dit nooit tegen je live database: het maakt testbestellingen aan.)

## 14. Beveiliging van de koppeling

- **Geen openbare lijst:** er bestaat geen endpoint dat codes opsomt. De boekingsapp kan alleen één bekende code laten controleren en krijgt dan alleen status en bedragen terug — nooit naam, e-mail of adres.
- **Geheime sleutel** (`BOOKING_API_KEY`) alleen in Vercel en in de Scripteigenschappen van Apps Script. Functies die afboeken eindigen op `_` en zijn dus niet vanuit de browser aan te roepen.
- **Raden van codes** is praktisch onmogelijk (≈ 110 miljard combinaties) en wordt bovendien na 30 onbekende codes in 10 minuten tijdelijk geblokkeerd.
- **Dubbel gebruik onmogelijk:** elke afboeking vergrendelt de rij in de database (`SELECT … FOR UPDATE`) binnen één transactie. Getest met 10 gelijktijdige boekingen: er wordt nooit meer afgeboekt dan het saldo. Dezelfde `booking_ref` boekt nooit twee keer af.
- **Niet betaald = niet bruikbaar:** de API weigert alles behalve *Actief* en *Deels gebruikt* (en controleert de vervaldatum).
- **Backoffice:** wachtwoord + ondertekende sessiecookie (`HttpOnly`, `Secure`, `SameSite=Strict`), controle op herkomst bij wijzigingen, limiet op inlogpogingen, niet in een iframe te laden, `noindex`.
- **Bestelformulier:** onzichtbare spam-val en maximaal 10 bestellingen per uur per IP-adres.
- **Sleutel vervangen** (bijv. als je denkt dat hij is uitgelekt): nieuwe `BOOKING_API_KEY` in Vercel → redeploy → dezelfde waarde in de Scripteigenschappen van Apps Script.

## 15. Later uitbreiden

De database en code zijn hierop voorbereid:
- **Andere ontwerpen** (kerst, verjaardag): extra functie in `lib/pdf.ts` + `design_key` per bon.
- **Automatische online betaling** (bijv. Mollie): webhook die dezelfde actie uitvoert als “Betaald — activeren” (`applyAdminAction(..., { action: "mark_paid" })`).
- **Direct naar de ontvanger mailen / geplande verzending:** velden `recipient_email`, `send_to_recipient` en `scheduled_send_at` bestaan al.
- **Promotiecodes:** veld `kind` op `vouchers` (`giftcard` / `promo`).
- **Meerdere bonnen per bestelling:** bonnen hangen via `order_id` aan een bestelling.

---

### Projectstructuur
```
app/                 bestelpagina, backoffice (admin/) en API-routes (api/)
  api/v1/vouchers/   API voor de boekingsapp
  api/admin/         API voor de backoffice (alleen ingelogd)
lib/                 database, cadeaubonlogica, PDF, e-mail, beveiliging
db/schema.sql        databaseschema
apps-script/         koppelmodule voor de boekingsapp (Google Apps Script)
assets/fonts/        lettertypes voor de PDF
scripts/             db-setup en end-to-end test
```

### Lokaal ontwikkelen
```bash
cp .env.example .env.local    # en vul in (met een lokale of test-database)
npm install
npm run db:setup
npm run dev                   # http://localhost:3000 en /admin
```
