-- ═══════════════════════════════════════════════════════════════
-- ScolaDesk CAP — Migration 007: New Pricing Model + ID System
-- Per-student pricing, new school code format, license_discounts
-- WARNING: Drops all existing data. Clean restart.
-- ═══════════════════════════════════════════════════════════════

-- Drop views first
DROP VIEW IF EXISTS school_active_license CASCADE;
DROP VIEW IF EXISTS license_payment_summary CASCADE;

-- Drop all tables
DROP TABLE IF EXISTS cap_audit_logs CASCADE;
DROP TABLE IF EXISTS sync_records CASCADE;
DROP TABLE IF EXISTS license_payments CASCADE;
DROP TABLE IF EXISTS license_discounts CASCADE;
DROP TABLE IF EXISTS licenses CASCADE;
DROP TABLE IF EXISTS pricing_plans CASCADE;
DROP TABLE IF EXISTS schools CASCADE;

-- Drop old functions
DROP FUNCTION IF EXISTS generate_school_code() CASCADE;
DROP FUNCTION IF EXISTS generate_school_code(TEXT) CASCADE;
DROP FUNCTION IF EXISTS generate_license_key() CASCADE;
DROP FUNCTION IF EXISTS compute_expiry_date() CASCADE;
DROP FUNCTION IF EXISTS update_updated_at() CASCADE;

-- Extensions
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
-- school_code format: CC-YYYY-XXXX (e.g. BJ-2026-A4P3)
-- school_prefix: last 4 chars of school_code (e.g. A4P3)
-- ─────────────────────────────────────────────

CREATE TABLE schools (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_code   TEXT NOT NULL UNIQUE,
  school_prefix TEXT NOT NULL,
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
CREATE INDEX idx_schools_prefix ON schools(school_prefix);

CREATE TRIGGER trg_schools_updated_at
  BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- SCHOOL CODE GENERATOR
-- Format: CC-YYYY-XXXX
-- CC = country code, YYYY = year, XXXX = 4 random chars
-- Charset: ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no 0OI1)
-- Returns: school_code, school_prefix
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_school_code(p_country_code TEXT DEFAULT 'BJ')
RETURNS TABLE(school_code TEXT, school_prefix TEXT) AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  rand4 TEXT := '';
  full_code TEXT;
  current_year TEXT;
  i INTEGER;
  attempts INTEGER := 0;
BEGIN
  current_year := EXTRACT(YEAR FROM now())::TEXT;

  LOOP
    rand4 := '';
    FOR i IN 1..4 LOOP
      rand4 := rand4 || SUBSTR(chars, FLOOR(RANDOM() * LENGTH(chars) + 1)::INTEGER, 1);
    END LOOP;

    full_code := UPPER(p_country_code) || '-' || current_year || '-' || rand4;

    -- Check uniqueness
    IF NOT EXISTS (SELECT 1 FROM schools s WHERE s.school_code = full_code) THEN
      school_code := full_code;
      school_prefix := rand4;
      RETURN NEXT;
      RETURN;
    END IF;

    attempts := attempts + 1;
    IF attempts > 100 THEN
      RAISE EXCEPTION 'Could not generate unique school code after 100 attempts';
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────
-- LICENSE KEY GENERATOR (unchanged format)
-- Format: SDLK-{YEAR}-{SEG1}-{SEG2}-{SEG3}
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
-- EXPIRY DATE: always Aug 30
-- Sep-Dec → Aug 30 next year
-- Jan-Aug → Aug 30 current year
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
-- LICENSES
-- Per-student pricing model. One row per license period.
-- rate_per_student can override country default (per-school pricing).
-- ─────────────────────────────────────────────

CREATE TABLE licenses (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id               UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,

  -- Key storage (plain text NEVER stored)
  license_key_hash        TEXT NOT NULL UNIQUE,
  license_key_preview     TEXT NOT NULL,

  -- Tier + features
  tier                    TEXT NOT NULL DEFAULT 'STANDARD'
                            CHECK(tier IN ('STANDARD', 'PRO')),
  features                TEXT[] NOT NULL DEFAULT '{}',

  -- Per-student pricing
  rate_per_student        INTEGER NOT NULL DEFAULT 2000,
  declared_student_count  INTEGER NOT NULL DEFAULT 0,
  paid_student_count      INTEGER NOT NULL DEFAULT 0,
  allowed_students        INTEGER NOT NULL DEFAULT 0,
  amount_paid             INTEGER NOT NULL DEFAULT 0,

  -- Installation fee
  installation_fee        INTEGER NOT NULL DEFAULT 0,
  installation_fee_paid   BOOLEAN NOT NULL DEFAULT false,

  -- Semester config
  semesters_active        INTEGER NOT NULL DEFAULT 3
                            CHECK(semesters_active IN (1, 2, 3)),
  semester_1_deadline     INTEGER CHECK(semester_1_deadline BETWEEN 1 AND 12),
  semester_2_deadline     INTEGER CHECK(semester_2_deadline BETWEEN 1 AND 12),
  semester_3_deadline     INTEGER CHECK(semester_3_deadline BETWEEN 1 AND 12),

  -- Lifecycle
  status                  TEXT NOT NULL DEFAULT 'PENDING_ACTIVATION'
                            CHECK(status IN (
                              'PENDING_ACTIVATION', 'ACTIVE', 'REVOKED', 'SUSPENDED'
                            )),
  is_active               BOOLEAN NOT NULL DEFAULT true,
  expiry_date             DATE NOT NULL,

  -- Hardware binding
  hardware_fingerprint    TEXT,
  hardware_bound_at       TIMESTAMPTZ,

  -- Sync telemetry
  student_count_sync      INTEGER,
  last_sync_at            TIMESTAMPTZ,

  -- Rate limiting
  failed_attempts         INTEGER DEFAULT 0,
  last_failed_at          TIMESTAMPTZ,

  -- Attribution
  created_by              TEXT,
  assigned_engineer       TEXT,

  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_licenses_school ON licenses(school_id, created_at DESC);
CREATE INDEX idx_licenses_hash ON licenses(license_key_hash);
CREATE INDEX idx_licenses_status ON licenses(status);

CREATE TRIGGER trg_licenses_updated_at
  BEFORE UPDATE ON licenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- LICENSE PAYMENTS
-- ─────────────────────────────────────────────

CREATE TABLE license_payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  license_id        UUID NOT NULL REFERENCES licenses(id) ON DELETE RESTRICT,
  school_id         UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  amount            INTEGER NOT NULL,
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method    TEXT NOT NULL
                      CHECK(payment_method IN (
                        'especes', 'mobile_money', 'virement', 'autre'
                      )),
  reference_number  TEXT,
  notes             TEXT,
  recorded_by       TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_payments_license ON license_payments(license_id);
CREATE INDEX idx_payments_school ON license_payments(school_id);

-- ─────────────────────────────────────────────
-- LICENSE DISCOUNTS
-- ─────────────────────────────────────────────

CREATE TABLE license_discounts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  license_id  UUID NOT NULL REFERENCES licenses(id) ON DELETE RESTRICT,
  school_id   UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  amount      INTEGER NOT NULL,
  reason      TEXT NOT NULL,
  granted_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_discounts_license ON license_discounts(license_id);

-- ─────────────────────────────────────────────
-- SYNC RECORDS
-- ─────────────────────────────────────────────

CREATE TABLE sync_records (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id             UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  sync_type             TEXT NOT NULL
                          CHECK(sync_type IN ('full', 'grades', 'financial', 'telemetry', 'license')),
  status                TEXT NOT NULL
                          CHECK(status IN ('success', 'failed', 'partial')),
  records_sent          INTEGER DEFAULT 0,
  actual_student_count  INTEGER,
  error_message         TEXT,
  synced_at             TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sync_school ON sync_records(school_id, synced_at DESC);

-- ─────────────────────────────────────────────
-- CAP AUDIT LOG
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
-- PRICING PLANS (simplified)
-- One row per tier per country.
-- rate_per_student is the default; can be overridden per school on license.
-- Installation fees by school size.
-- ─────────────────────────────────────────────

CREATE TABLE pricing_plans (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country                 TEXT NOT NULL DEFAULT 'Bénin',
  country_code            TEXT NOT NULL DEFAULT 'BJ',
  tier                    TEXT NOT NULL CHECK(tier IN ('STANDARD', 'PRO')),
  rate_per_student        INTEGER NOT NULL DEFAULT 2000,
  installation_fee_default INTEGER NOT NULL DEFAULT 25000,
  currency                TEXT NOT NULL DEFAULT 'XOF',
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE(country_code, tier)
);

CREATE TRIGGER trg_pricing_updated_at
  BEFORE UPDATE ON pricing_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed Benin pricing (per-student model)
INSERT INTO pricing_plans (country, country_code, tier, rate_per_student, installation_fee_default) VALUES
  ('Bénin', 'BJ', 'STANDARD', 2000, 25000),
  ('Bénin', 'BJ', 'PRO',      3000, 25000);

-- ─────────────────────────────────────────────
-- COMPUTED VIEWS
-- ─────────────────────────────────────────────

-- Payment + discount summary per license
CREATE VIEW license_payment_summary AS
SELECT
  l.id AS license_id,
  l.school_id,
  l.rate_per_student,
  l.declared_student_count,
  l.paid_student_count,
  l.allowed_students,
  GREATEST(COALESCE(l.student_count_sync, l.declared_student_count), l.paid_student_count) * l.rate_per_student AS total_due,
  COALESCE(SUM(p.amount), 0) AS total_paid,
  COALESCE(d.total_discount, 0) AS total_discount,
  GREATEST(COALESCE(l.student_count_sync, l.declared_student_count), l.paid_student_count) * l.rate_per_student
    - COALESCE(SUM(p.amount), 0)
    - COALESCE(d.total_discount, 0) AS remaining,
  CASE
    WHEN COALESCE(SUM(p.amount), 0) + COALESCE(d.total_discount, 0) = 0 THEN 'pending'
    WHEN COALESCE(SUM(p.amount), 0) + COALESCE(d.total_discount, 0)
      >= GREATEST(COALESCE(l.student_count_sync, l.declared_student_count), l.paid_student_count) * l.rate_per_student
    THEN 'paid'
    ELSE 'partial'
  END AS payment_status
FROM licenses l
LEFT JOIN license_payments p ON p.license_id = l.id
LEFT JOIN (
  SELECT license_id, SUM(amount) AS total_discount FROM license_discounts GROUP BY license_id
) d ON d.license_id = l.id
GROUP BY l.id, l.school_id, l.rate_per_student, l.declared_student_count, l.paid_student_count,
         l.allowed_students, l.student_count_sync, d.total_discount;

-- Active license per school (latest non-REVOKED)
CREATE VIEW school_active_license AS
SELECT DISTINCT ON (l.school_id)
  l.*,
  s.school_name,
  s.school_code,
  s.school_prefix,
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
-- ─────────────────────────────────────────────

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE license_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cap_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON schools
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON licenses
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON license_payments
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON license_discounts
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON sync_records
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON cap_audit_logs
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated full access" ON pricing_plans
  FOR ALL USING (auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════════
-- END OF MIGRATION 007
-- ═══════════════════════════════════════════════════════════════
