-- ═══════════════════════════════════════════════════════════════
-- ScolaDesk CAP — Migration 006: Full Schema Rebuild
-- Production schema per CAP_SPEC.md
-- WARNING: Drops all existing tables. Dev only.
-- ═══════════════════════════════════════════════════════════════

-- Drop old views first
DROP VIEW IF EXISTS school_active_license CASCADE;
DROP VIEW IF EXISTS license_payment_summary CASCADE;

-- Drop old tables (order matters for FK deps)
DROP TABLE IF EXISTS otp_codes CASCADE;
DROP TABLE IF EXISTS hardware_bindings CASCADE;
DROP TABLE IF EXISTS sync_log CASCADE;
DROP TABLE IF EXISTS license_payments CASCADE;
DROP TABLE IF EXISTS sync_records CASCADE;
DROP TABLE IF EXISTS cap_audit_logs CASCADE;
DROP TABLE IF EXISTS licenses CASCADE;
DROP TABLE IF EXISTS pricing_plans CASCADE;
DROP TABLE IF EXISTS schools CASCADE;

-- Drop old functions/triggers (all overloaded signatures)
DROP FUNCTION IF EXISTS generate_school_code() CASCADE;
DROP FUNCTION IF EXISTS generate_school_code(TEXT) CASCADE;
DROP FUNCTION IF EXISTS generate_license_key() CASCADE;
DROP FUNCTION IF EXISTS compute_expiry_date() CASCADE;
DROP FUNCTION IF EXISTS auto_license_key() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────
-- UTILITY: auto updated_at trigger
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- SCHOOLS
-- Permanent records. Never deleted.
-- id = internal UUID (never shown externally)
-- school_code = public reference (SD-BJ-0042)
-- ─────────────────────────────────────────────

CREATE TABLE schools (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_code   TEXT NOT NULL UNIQUE,
  school_name   TEXT NOT NULL,
  director_name TEXT,
  phone         TEXT,
  city          TEXT,
  country       TEXT DEFAULT 'Bénin',
  country_code  TEXT DEFAULT 'BJ',
  notes         TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_schools_code ON schools(school_code);

CREATE TRIGGER trg_schools_updated_at
  BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- SCHOOL CODE GENERATOR
-- Format: SD-{CC}-{SEQ}  e.g. SD-BJ-0042
-- Sequential per country code
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_school_code(p_country_code TEXT DEFAULT 'BJ')
RETURNS TEXT AS $$
DECLARE
  prefix TEXT;
  next_num INTEGER;
BEGIN
  prefix := 'SD-' || UPPER(p_country_code) || '-';
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(school_code FROM prefix || '(\d+)') AS INTEGER)
  ), 0) + 1 INTO next_num FROM schools
  WHERE school_code LIKE prefix || '%';
  RETURN prefix || LPAD(next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- LICENSES
-- One row per license period per school.
-- New row on renewal. Old row → REVOKED.
-- License key: hash-only storage.
-- ─────────────────────────────────────────────

CREATE TABLE licenses (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,

  -- Key storage (plain text NEVER stored)
  license_key_hash      TEXT NOT NULL UNIQUE,
  license_key_preview   TEXT NOT NULL,

  -- Commercial terms
  tier                  TEXT NOT NULL DEFAULT 'STANDARD'
                          CHECK(tier IN ('STANDARD', 'PRO')),
  size                  TEXT NOT NULL DEFAULT 'SMALL'
                          CHECK(size IN ('SMALL', 'MEDIUM', 'LARGE')),
  semesters_active      INTEGER NOT NULL DEFAULT 3
                          CHECK(semesters_active IN (1, 2, 3)),
  total_fee_due         NUMERIC NOT NULL DEFAULT 0,

  -- Feature flags (drives requireFeature() in local app)
  features              TEXT[] NOT NULL DEFAULT '{}',

  -- Semester deadline months (1-12, informational)
  semester_1_deadline   INTEGER CHECK(semester_1_deadline BETWEEN 1 AND 12),
  semester_2_deadline   INTEGER CHECK(semester_2_deadline BETWEEN 1 AND 12),
  semester_3_deadline   INTEGER CHECK(semester_3_deadline BETWEEN 1 AND 12),

  -- License lifecycle
  status                TEXT NOT NULL DEFAULT 'PENDING_ACTIVATION'
                          CHECK(status IN (
                            'PENDING_ACTIVATION',
                            'ACTIVE',
                            'REVOKED',
                            'SUSPENDED'
                          )),
  is_active             BOOLEAN NOT NULL DEFAULT true,
  expiry_date           DATE NOT NULL,

  -- Hardware binding (inline, no separate table)
  hardware_fingerprint  TEXT,
  hardware_bound_at     TIMESTAMPTZ,

  -- Sync telemetry
  student_count_sync    INTEGER,
  last_sync_at          TIMESTAMPTZ,

  -- Rate limiting (failed activation attempts)
  failed_attempts       INTEGER DEFAULT 0,
  last_failed_at        TIMESTAMPTZ,

  -- Attribution
  created_by            TEXT,
  assigned_engineer     TEXT,

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_licenses_school ON licenses(school_id, created_at DESC);
CREATE INDEX idx_licenses_hash ON licenses(license_key_hash);
CREATE INDEX idx_licenses_status ON licenses(status);

CREATE TRIGGER trg_licenses_updated_at
  BEFORE UPDATE ON licenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- LICENSE KEY GENERATOR
-- Format: SDLK-{YEAR}-{SEG1}-{SEG2}-{SEG3}
-- Returns: plain key, hash, preview
-- Called server-side only, never from client
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_license_key()
RETURNS TABLE(plain_key TEXT, key_hash TEXT, key_preview TEXT) AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  current_year TEXT;
  seg1 TEXT := '';
  seg2 TEXT := '';
  seg3 TEXT := '';
  full_key TEXT;
  i INTEGER;
BEGIN
  current_year := EXTRACT(YEAR FROM now())::TEXT;

  FOR i IN 1..4 LOOP
    seg1 := seg1 || SUBSTR(chars, FLOOR(RANDOM() * LENGTH(chars) + 1)::INTEGER, 1);
    seg2 := seg2 || SUBSTR(chars, FLOOR(RANDOM() * LENGTH(chars) + 1)::INTEGER, 1);
    seg3 := seg3 || SUBSTR(chars, FLOOR(RANDOM() * LENGTH(chars) + 1)::INTEGER, 1);
  END LOOP;

  full_key := 'SDLK-' || current_year || '-' || seg1 || '-' || seg2 || '-' || seg3;
  plain_key := full_key;
  key_hash := encode(digest(full_key, 'sha256'), 'hex');
  key_preview := 'SDLK-' || current_year || '-****-****-' || seg3;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- EXPIRY DATE CALCULATOR
-- Sept-Dec registration → Aug 30 next year
-- Jan-Aug registration → Aug 30 current year
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION compute_expiry_date()
RETURNS DATE AS $$
BEGIN
  IF EXTRACT(MONTH FROM now()) >= 9 THEN
    RETURN (EXTRACT(YEAR FROM now()) + 1)::TEXT || '-08-30';
  ELSE
    RETURN EXTRACT(YEAR FROM now())::TEXT || '-08-30';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- LICENSE PAYMENTS
-- One row per payment installment.
-- Multiple rows per license (partial payments).
-- ─────────────────────────────────────────────

CREATE TABLE license_payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  license_id        UUID NOT NULL REFERENCES licenses(id) ON DELETE RESTRICT,
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  amount            NUMERIC NOT NULL,
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method    TEXT NOT NULL
                      CHECK(payment_method IN (
                        'cash', 'mobile_money', 'bank_transfer', 'other'
                      )),
  payment_reference TEXT,
  notes             TEXT,
  recorded_by       TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payments_license ON license_payments(license_id);
CREATE INDEX idx_payments_school ON license_payments(school_id);

-- ─────────────────────────────────────────────
-- SYNC RECORDS
-- Pushed by local app on every sync attempt.
-- Append-only — never updated.
-- ─────────────────────────────────────────────

CREATE TABLE sync_records (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id     UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  sync_type     TEXT NOT NULL
                  CHECK(sync_type IN (
                    'full', 'grades', 'financial', 'telemetry', 'license'
                  )),
  status        TEXT NOT NULL
                  CHECK(status IN ('success', 'failed', 'partial')),
  records_sent  INTEGER DEFAULT 0,
  chunk_reached INTEGER,
  error_message TEXT,
  synced_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sync_school ON sync_records(school_id, synced_at DESC);

-- ─────────────────────────────────────────────
-- CAP AUDIT LOG
-- Every owner action recorded.
-- Append-only — never updated or deleted.
-- ─────────────────────────────────────────────

CREATE TABLE cap_audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  old_values  JSONB,
  new_values  JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cap_audit_entity
  ON cap_audit_logs(entity_type, entity_id, created_at DESC);

-- ─────────────────────────────────────────────
-- PRICING PLANS (reference table)
-- Suggested defaults for /schools/new
-- Does NOT retroactively change existing licenses
-- ─────────────────────────────────────────────

CREATE TABLE pricing_plans (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country      TEXT NOT NULL DEFAULT 'Bénin',
  country_code TEXT NOT NULL DEFAULT 'BJ',
  tier         TEXT NOT NULL CHECK(tier IN ('STANDARD', 'PRO')),
  size         TEXT NOT NULL CHECK(size IN ('SMALL', 'MEDIUM', 'LARGE')),
  setup_fee    INTEGER NOT NULL DEFAULT 0,
  annual_fee   INTEGER NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'XOF',
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country, tier, size)
);

CREATE TRIGGER trg_pricing_updated_at
  BEFORE UPDATE ON pricing_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed Benin pricing
INSERT INTO pricing_plans (country, country_code, tier, size, setup_fee, annual_fee) VALUES
  ('Bénin', 'BJ', 'STANDARD', 'SMALL',  25000, 45000),
  ('Bénin', 'BJ', 'STANDARD', 'MEDIUM', 40000, 70000),
  ('Bénin', 'BJ', 'STANDARD', 'LARGE',  60000, 100000),
  ('Bénin', 'BJ', 'PRO',      'SMALL',  25000, 70000),
  ('Bénin', 'BJ', 'PRO',      'MEDIUM', 40000, 110000),
  ('Bénin', 'BJ', 'PRO',      'LARGE',  60000, 150000);

-- ─────────────────────────────────────────────
-- COMPUTED VIEWS
-- ─────────────────────────────────────────────

-- Payment status per license
CREATE VIEW license_payment_summary AS
SELECT
  l.id                                              AS license_id,
  l.school_id,
  l.total_fee_due,
  COALESCE(SUM(p.amount), 0)                        AS total_paid,
  l.total_fee_due - COALESCE(SUM(p.amount), 0)      AS balance,
  CASE
    WHEN COALESCE(SUM(p.amount), 0) = 0        THEN 'pending'
    WHEN COALESCE(SUM(p.amount), 0) >= l.total_fee_due THEN 'paid'
    ELSE 'partial'
  END                                               AS payment_status
FROM licenses l
LEFT JOIN license_payments p ON p.license_id = l.id
GROUP BY l.id, l.school_id, l.total_fee_due;

-- Active license per school (latest non-REVOKED)
CREATE VIEW school_active_license AS
SELECT DISTINCT ON (l.school_id)
  l.*,
  s.school_name,
  s.school_code,
  s.director_name,
  s.phone,
  s.city,
  s.country,
  s.notes AS school_notes
FROM licenses l
JOIN schools s ON s.id = l.school_id
WHERE l.status IN ('ACTIVE', 'PENDING_ACTIVATION', 'SUSPENDED')
ORDER BY l.school_id, l.created_at DESC;

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- All tables: only authenticated users (owner)
-- Service role key bypasses RLS for API routes
-- ─────────────────────────────────────────────

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cap_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON schools
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON licenses
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON license_payments
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON sync_records
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON cap_audit_logs
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON pricing_plans
  FOR ALL USING (auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════════
-- END OF MIGRATION 006 — Full Schema Rebuild
-- ═══════════════════════════════════════════════════════════════
