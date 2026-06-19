-- ═══════════════════════════════════════════════════════════════
-- ScolaDesk CAP — Migration 005: License Key Format v2
-- New format: SDLK-YYYY-AAAA-AAAA-AAAA
-- SDLK = ScolaDesk License Key
-- YYYY = Year of creation
-- AAAA-AAAA-AAAA = 12 random alphanumeric characters
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION generate_license_key()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  current_year TEXT;
  result TEXT;
  i INTEGER;
  g INTEGER;
BEGIN
  current_year := EXTRACT(YEAR FROM now())::TEXT;
  result := 'SDLK-' || current_year || '-';

  FOR g IN 1..3 LOOP
    IF g > 1 THEN result := result || '-'; END IF;
    FOR i IN 1..4 LOOP
      result := result || SUBSTR(chars, FLOOR(RANDOM() * LENGTH(chars) + 1)::INTEGER, 1);
    END LOOP;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Regenerate all existing keys with the new format
UPDATE licenses SET license_key = generate_license_key();

-- ═══════════════════════════════════════════════════════════════
-- END OF MIGRATION 005
-- ═══════════════════════════════════════════════════════════════
