-- ============================================================
-- The Light Portraits – Cadeaubonnen
-- Database schema (PostgreSQL 14+ / Neon / Supabase)
-- Veilig om meerdere keren uit te voeren (idempotent).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Doorlopende nummering voor bestelnummers (CB-2026-0001)
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

-- ------------------------------------------------------------
-- Bestellingen (wie heeft besteld, factuurgegevens)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     text UNIQUE NOT NULL,
  source           text NOT NULL DEFAULT 'web',          -- web | admin
  customer_type    text NOT NULL CHECK (customer_type IN ('private','business')),

  -- Besteller
  first_name       text,
  last_name        text,
  company_name     text,
  contact_person   text,
  vat_number       text,
  coc_number       text,                                 -- KvK-nummer
  invoice_reference text,                                -- PO-nummer / kenmerk
  invoice_email    text,                                 -- afwijkend factuur-e-mailadres
  email            text NOT NULL,
  phone            text,
  street           text,
  house_number     text,
  postal_code      text,
  city             text,
  country          text,

  -- Ontvanger
  for_self         boolean NOT NULL DEFAULT true,
  recipient_name   text,
  recipient_email  text,
  from_name        text,
  personal_message text,

  -- Bedrag (altijd in centen)
  amount_cents     integer NOT NULL CHECK (amount_cents > 0),
  currency         text NOT NULL DEFAULT 'EUR',

  -- Betaling (handmatig via eigen factuur)
  payment_status   text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','invoiced','paid','refunded','cancelled')),
  invoice_sent_at  timestamptz,
  paid_at          timestamptz,
  payment_note     text,

  admin_notes      text,
  ip_hash          text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_email_idx   ON orders (lower(email));
CREATE INDEX IF NOT EXISTS orders_ip_idx      ON orders (ip_hash, created_at);

-- ------------------------------------------------------------
-- Cadeaubonnen (de waardecode zelf)
-- Één bestelling = één bon (kan later uitgebreid worden naar meerdere).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vouchers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text UNIQUE NOT NULL,                  -- TLP-XXXX-XXXX
  order_id         uuid REFERENCES orders(id) ON DELETE RESTRICT,
  kind             text NOT NULL DEFAULT 'giftcard',      -- giftcard | promo (toekomst)
  design_key       text NOT NULL DEFAULT 'classic',       -- ontwerp van de PDF

  original_cents   integer NOT NULL CHECK (original_cents > 0),
  remaining_cents  integer NOT NULL CHECK (remaining_cents >= 0),
  CONSTRAINT remaining_le_original CHECK (remaining_cents <= original_cents),

  -- ordered → awaiting_payment → active → partially_used → used
  -- (+ blocked / cancelled)
  status           text NOT NULL DEFAULT 'ordered' CHECK (status IN
                     ('ordered','awaiting_payment','active','partially_used','used','blocked','cancelled')),

  recipient_name   text,
  recipient_email  text,
  from_name        text,
  personal_message text,

  activated_at     timestamptz,
  expires_at       timestamptz,
  blocked_reason   text,
  pdf_version      integer NOT NULL DEFAULT 1,
  pdf_generated_at timestamptz,

  -- Voorbereid voor latere functies
  send_to_recipient boolean NOT NULL DEFAULT false,
  scheduled_send_at timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vouchers_order_idx  ON vouchers (order_id);
CREATE INDEX IF NOT EXISTS vouchers_status_idx ON vouchers (status);

-- ------------------------------------------------------------
-- Gebruik van een bon in de boekingsapp
-- hold     = gereserveerd bij boekingsaanvraag (waarde al afgeschreven)
-- captured = definitief gebruikt (boeking goedgekeurd)
-- released = vrijgegeven (boeking afgewezen/geannuleerd), waarde terug op de bon
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS redemptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id       uuid NOT NULL REFERENCES vouchers(id) ON DELETE RESTRICT,
  booking_ref      text NOT NULL,                        -- uniek kenmerk van de boeking
  description      text,
  booking_total_cents integer,
  amount_cents     integer NOT NULL CHECK (amount_cents > 0),
  status           text NOT NULL CHECK (status IN ('held','captured','released')),
  source           text NOT NULL DEFAULT 'booking-api',  -- booking-api | admin
  balance_after_cents integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  captured_at      timestamptz,
  released_at      timestamptz,
  release_reason   text
);

-- Eén boeking kan een bon maar één keer tegelijk gebruiken (voorkomt dubbele afboeking bij herhaalde verzoeken).
-- Een vrijgegeven (released) reservering telt niet mee, zodat dezelfde boeking het later opnieuw kan proberen.
CREATE UNIQUE INDEX IF NOT EXISTS redemptions_voucher_booking_active_uq
  ON redemptions (voucher_id, booking_ref) WHERE status <> 'released';
CREATE INDEX IF NOT EXISTS redemptions_voucher_idx ON redemptions (voucher_id, created_at);

-- ------------------------------------------------------------
-- Logboek: alles wat er met een bestelling/bon gebeurt
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id          bigserial PRIMARY KEY,
  order_id    uuid REFERENCES orders(id) ON DELETE CASCADE,
  voucher_id  uuid REFERENCES vouchers(id) ON DELETE CASCADE,
  type        text NOT NULL,
  message     text NOT NULL,
  actor       text NOT NULL DEFAULT 'system',            -- system | admin | customer | booking-api
  data        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_order_idx   ON events (order_id, created_at);
CREATE INDEX IF NOT EXISTS events_voucher_idx ON events (voucher_id, created_at);

-- ------------------------------------------------------------
-- Instellingen (bedragen, e-mailteksten, ontwerp)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Verzonden e-mails
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_log (
  id          bigserial PRIMARY KEY,
  order_id    uuid REFERENCES orders(id) ON DELETE CASCADE,
  template    text NOT NULL,
  to_address  text NOT NULL,
  subject     text NOT NULL,
  status      text NOT NULL,                             -- sent | failed | skipped
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_log_order_idx ON email_log (order_id, created_at);

-- ------------------------------------------------------------
-- Pogingen in de backoffice (beperken van inlogpogingen)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_attempts (
  id          bigserial PRIMARY KEY,
  ip_hash     text NOT NULL,
  success     boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_idx ON login_attempts (ip_hash, created_at);

-- ------------------------------------------------------------
-- API-verzoeken van de boekingsapp (beperken misbruik)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_failures (
  id          bigserial PRIMARY KEY,
  key_id      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_failures_idx ON api_failures (key_id, created_at);
