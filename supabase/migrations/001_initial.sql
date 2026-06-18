-- ═══════════════════════════════════════════════════════════════
-- ScolaDesk Central Admin Panel — Phase 1 Baseline Schema
-- Target: Supabase (PostgreSQL)
-- Run via: Supabase SQL Editor (paste & execute)
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────
-- SCHOOLS
-- ─────────────────────────────────────────────
-- Central registry of all schools using ScolaDesk.
-- school_code is the SCHOOL_ID shared with the school (e.g. SD-BJ-0042).
-- status tracks the activation lifecycle.

CREATE TABLE schools (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_code     TEXT NOT NULL UNIQUE,
  school_name     TEXT NOT NULL,
  director_name   TEXT NOT NULL,
  director_phone  TEXT,
  director_email  TEXT,
  address         TEXT,
  city            TEXT,
  country         TEXT DEFAULT 'Bénin',
  status          TEXT NOT NULL DEFAULT 'pending_activation'
                    CHECK (status IN (
                      'pending_activation', 'active', 'suspended', 'expired', 'deactivated'
                    )),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_schools_status ON schools(status);
CREATE INDEX idx_schools_code ON schools(school_code);

-- ─────────────────────────────────────────────
-- LICENSES
-- ─────────────────────────────────────────────
-- One license per school. Defines tier, size, pricing, and expiry.
-- is_active is the kill switch — flip to false to disable a school.

CREATE TABLE licenses (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id           UUID NOT NULL UNIQUE REFERENCES schools(id) ON DELETE RESTRICT,
  tier                TEXT NOT NULL DEFAULT 'STANDARD'
                        CHECK (tier IN ('STANDARD', 'PRO')),
  size                TEXT NOT NULL DEFAULT 'S'
                        CHECK (size IN ('S', 'M', 'L')),
  semesters_active    INTEGER NOT NULL DEFAULT 3
                        CHECK (semesters_active IN (1, 2, 3)),
  setup_fee           INTEGER NOT NULL DEFAULT 0,
  annual_fee          INTEGER NOT NULL DEFAULT 0,
  annual_fee_assigned INTEGER,
  expiry_date         DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '1 year'),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  activated_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- HARDWARE BINDINGS
-- ─────────────────────────────────────────────
-- Stores the SHA256 hardware fingerprint captured during activation.
-- One binding per school. If hardware changes, owner must re-authorize.

CREATE TABLE hardware_bindings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID NOT NULL UNIQUE REFERENCES schools(id) ON DELETE RESTRICT,
  fingerprint     TEXT NOT NULL,
  bound_at        TIMESTAMPTZ DEFAULT now(),
  previous_fingerprint TEXT,
  rebound_count   INTEGER DEFAULT 0,
  rebound_reason  TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- OTP CODES
-- ─────────────────────────────────────────────
-- One-time codes for school activation.
-- Sent to director's phone/WhatsApp. 6-digit numeric code.
-- Expires after 10 minutes. Max 5 attempts before lockout.

CREATE TABLE otp_codes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  code            TEXT NOT NULL,
  channel         TEXT NOT NULL DEFAULT 'manual'
                    CHECK (channel IN ('sms', 'whatsapp', 'email', 'manual')),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
  is_used         BOOLEAN DEFAULT false,
  used_at         TIMESTAMPTZ,
  attempts        INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_otp_school ON otp_codes(school_id, is_used, expires_at);

-- ─────────────────────────────────────────────
-- SYNC METADATA
-- ─────────────────────────────────────────────
-- Tracks sync activity per school. Not the synced data itself
-- (those mirror tables come in Phase 7), just the log.

CREATE TABLE sync_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  sync_type       TEXT NOT NULL
                    CHECK (sync_type IN ('full', 'grades', 'financial', 'telemetry', 'license')),
  started_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  records_sent    INTEGER DEFAULT 0,
  records_received INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending', 'success', 'failed', 'partial')),
  error_message   TEXT,
  checkpoint      JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sync_school ON sync_log(school_id, status, created_at);

-- ─────────────────────────────────────────────
-- AUTO-UPDATE TRIGGER
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_schools_updated_at
  BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_licenses_updated_at
  BEFORE UPDATE ON licenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────
-- Only authenticated users (you/engineer via Supabase Auth) can access.
-- No public access to any table.

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE hardware_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access" ON schools
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON licenses
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON hardware_bindings
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON otp_codes
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated full access" ON sync_log
  FOR ALL USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- SCHOOL CODE GENERATOR FUNCTION
-- ─────────────────────────────────────────────
-- Generates sequential school codes: SD-BJ-0001, SD-BJ-0002, etc.

CREATE OR REPLACE FUNCTION generate_school_code()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  code TEXT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(school_code FROM 'SD-BJ-(\d+)') AS INTEGER)
  ), 0) + 1 INTO next_num FROM schools;
  code := 'SD-BJ-' || LPAD(next_num::TEXT, 4, '0');
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- END OF PHASE 1 BASELINE
-- ═══════════════════════════════════════════════════════════════
