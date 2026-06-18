-- ═══════════════════════════════════════════════════════════════
-- ScolaDesk CAP — Migration 003: School Code v2
-- Format: SD-{COUNTRY_CODE}-{YEAR}-{INCREMENT}
-- Example: SD-BJ-2026-0001
-- Increment resets per country per year.
-- ═══════════════════════════════════════════════════════════════

-- Add country_code to pricing_plans
ALTER TABLE pricing_plans ADD COLUMN IF NOT EXISTS country_code TEXT;

UPDATE pricing_plans SET country_code = 'BJ' WHERE country = 'Bénin' AND country_code IS NULL;

-- Replace the school code generator function
CREATE OR REPLACE FUNCTION generate_school_code(p_country_code TEXT DEFAULT 'BJ')
RETURNS TEXT AS $$
DECLARE
  current_year TEXT;
  prefix TEXT;
  next_num INTEGER;
  code TEXT;
BEGIN
  current_year := EXTRACT(YEAR FROM now())::TEXT;
  prefix := 'SD-' || UPPER(p_country_code) || '-' || current_year || '-';

  SELECT COALESCE(MAX(
    CAST(SUBSTRING(school_code FROM prefix || '(\d+)') AS INTEGER)
  ), 0) + 1 INTO next_num FROM schools
  WHERE school_code LIKE prefix || '%';

  code := prefix || LPAD(next_num::TEXT, 4, '0');
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- END OF MIGRATION 003
-- ═══════════════════════════════════════════════════════════════
