-- ═══════════════════════════════════════════════════════════════
-- ScolaDesk CAP — Migration 004: License Key + Grace Period
-- Adds license_key for single-step activation.
-- Adds grace_period_days for post-expiry access window.
-- Replaces OTP-based activation with key-based.
-- ═══════════════════════════════════════════════════════════════

-- Add license_key and grace_period to licenses
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS license_key TEXT UNIQUE;
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS grace_period_days INTEGER NOT NULL DEFAULT 15;

-- Generate license keys for existing licenses that don't have one
-- Format: SDLK-XXXX-XXXX-XXXX (alphanumeric, easy to read/type)
CREATE OR REPLACE FUNCTION generate_license_key()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := 'SDLK-';
  i INTEGER;
  g INTEGER;
BEGIN
  FOR g IN 1..3 LOOP
    IF g > 1 THEN result := result || '-'; END IF;
    FOR i IN 1..4 LOOP
      result := result || SUBSTR(chars, FLOOR(RANDOM() * LENGTH(chars) + 1)::INTEGER, 1);
    END LOOP;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Backfill existing licenses with keys
UPDATE licenses SET license_key = generate_license_key() WHERE license_key IS NULL;

-- Make license_key NOT NULL after backfill
ALTER TABLE licenses ALTER COLUMN license_key SET NOT NULL;

-- Update default expiry to Aug 30 of the next academic year
-- For schools registered Sept-Dec: expiry = Aug 30 of next year
-- For schools registered Jan-Aug: expiry = Aug 30 of current year
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

-- Auto-generate license key on insert
CREATE OR REPLACE FUNCTION auto_license_key()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.license_key IS NULL THEN
    NEW.license_key := generate_license_key();
  END IF;
  IF NEW.expiry_date IS NULL THEN
    NEW.expiry_date := compute_expiry_date();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_licenses_auto_key
  BEFORE INSERT ON licenses
  FOR EACH ROW EXECUTE FUNCTION auto_license_key();

-- ═══════════════════════════════════════════════════════════════
-- END OF MIGRATION 004
-- ═══════════════════════════════════════════════════════════════
